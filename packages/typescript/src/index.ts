import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { formatExpr, isSourceEffectProof } from "@effect-verifier/core";
import * as ts from "@typescript/typescript6";
import type {
  BoolExpr,
  IntExpr,
  SourceProof,
  SourceEffectProof,
  Variable,
  VerificationProgram,
} from "@effect-verifier/core";

export class SourceCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceCompileError";
  }
}

interface IntTerm {
  readonly sort: "Int";
  readonly expression: IntExpr;
  readonly minimum: bigint;
  readonly maximum: bigint;
}

interface BoolTerm {
  readonly sort: "Bool";
  readonly expression: BoolExpr;
}

interface EffectTerm {
  readonly isSuccess: BoolExpr;
  readonly tag: import("@effect-verifier/core").StringExpr;
  readonly payload: IntTerm | BoolTerm;
  readonly failures: ReadonlySet<string>;
}

type Term = IntTerm | BoolTerm;

interface InputVariable {
  readonly term: Term;
}

interface ValidatedSignature {
  readonly inputs: ReadonlyMap<string, InputVariable>;
  readonly parameterNames: ReadonlyMap<number, string>;
  readonly resultSort: "Int" | "Bool";
}

const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

const minimumSafeInteger = BigInt(Number.MIN_SAFE_INTEGER);

const comparisonOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

const report = (sourceFile: ts.SourceFile, node: ts.Node, message: string): never => {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  throw new SourceCompileError(
    `${sourceFile.fileName}:${location.line + 1}:${location.character + 1}: ${message}`,
  );
};

const diagnosticMessage = (diagnostic: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;

  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

  return `${diagnostic.file.fileName}:${location.line + 1}:${location.character + 1}: ${message}`;
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);

const isExported = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.ExportKeyword);

const exportedCandidates = (
  statement: ts.Statement,
  functionName: string,
): ReadonlyArray<ts.FunctionLikeDeclaration> => {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name?.text === functionName && isExported(statement) ? [statement] : [];
  }

  if (!ts.isVariableStatement(statement) || !isExported(statement)) return [];

  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return [];

  return statement.declarationList.declarations.flatMap((declaration) => {
    if (!ts.isIdentifier(declaration.name) || declaration.name.text !== functionName) return [];

    return declaration.initializer !== undefined && ts.isArrowFunction(declaration.initializer)
      ? [declaration.initializer]
      : [];
  });
};

const findTarget = (
  sourceFile: ts.SourceFile,
  functionName: string,
): ts.FunctionLikeDeclaration => {
  const candidates = sourceFile.statements.flatMap((statement) =>
    exportedCandidates(statement, functionName),
  );

  if (candidates.length !== 1) {
    throw new SourceCompileError(
      `${sourceFile.fileName}: expected exactly one exported function named "${functionName}"`,
    );
  }

  const candidate = candidates[0];

  if (candidate === undefined) throw new SourceCompileError("Source function was not found");

  return candidate;
};

const functionBody = (
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionLikeDeclaration,
): ts.ConciseBody => {
  if (declaration.body === undefined)
    return report(sourceFile, declaration, "function has no body");

  return declaration.body;
};

const validateFunctionType = (
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionLikeDeclaration,
): "Int" | "Bool" => {
  if (
    hasModifier(declaration, ts.SyntaxKind.AsyncKeyword) ||
    declaration.asteriskToken !== undefined
  ) {
    report(sourceFile, declaration, "async and generator functions are unsupported");
  }

  if (declaration.typeParameters !== undefined && declaration.typeParameters.length > 0) {
    report(sourceFile, declaration, "generic functions are unsupported");
  }

  if (declaration.type?.kind === ts.SyntaxKind.NumberKeyword) return "Int";

  if (declaration.type?.kind === ts.SyntaxKind.BooleanKeyword) return "Bool";

  return report(
    sourceFile,
    declaration,
    "function must have an explicit number or boolean return type",
  );
};

const parameterName = (sourceFile: ts.SourceFile, parameter: ts.ParameterDeclaration): string => {
  if (
    !ts.isIdentifier(parameter.name) ||
    (parameter.type?.kind !== ts.SyntaxKind.NumberKeyword &&
      parameter.type?.kind !== ts.SyntaxKind.BooleanKeyword)
  ) {
    return report(
      sourceFile,
      parameter,
      "parameters must be named and explicitly typed as number or boolean",
    );
  }

  if (
    parameter.questionToken !== undefined ||
    parameter.dotDotDotToken !== undefined ||
    parameter.initializer !== undefined
  ) {
    return report(sourceFile, parameter, "optional, rest, and default parameters are unsupported");
  }

  return parameter.name.text;
};

const inputTerm = (
  sourceFile: ts.SourceFile,
  parameter: ts.ParameterDeclaration,
  variable: Variable,
  name: string,
): InputVariable => {
  const parameterSort = parameter.type?.kind === ts.SyntaxKind.BooleanKeyword ? "Bool" : "Int";

  if (variable.sort !== parameterSort) {
    return report(
      sourceFile,
      parameter,
      `input "${name}" must use the ${parameterSort === "Bool" ? "boolean" : "integer"} domain`,
    );
  }

  if (parameterSort === "Bool") {
    return {
      term: { sort: "Bool", expression: { kind: "Variable", id: variable.id, sort: "Bool" } },
    };
  }

  if (
    variable.minimum === null ||
    variable.maximum === null ||
    !Number.isSafeInteger(variable.minimum) ||
    !Number.isSafeInteger(variable.maximum)
  ) {
    return report(
      sourceFile,
      parameter,
      `input "${name}" requires finite safe-integer minimum and maximum bounds`,
    );
  }

  if (variable.minimum > variable.maximum) {
    return report(sourceFile, parameter, `input "${name}" has an empty domain`);
  }

  const minimum = BigInt(variable.minimum);
  const maximum = BigInt(variable.maximum);

  return {
    term: {
      sort: "Int",
      expression: { kind: "Variable", id: variable.id, sort: "Int" },
      minimum,
      maximum,
    },
  };
};

const validateSignature = (
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionLikeDeclaration,
  variables: ReadonlyArray<Variable>,
  resultVariableId: number,
): ValidatedSignature => {
  const resultSort = validateFunctionType(sourceFile, declaration);

  const resultVariable = variables.find((variable) => variable.id === resultVariableId);

  if (resultVariable === undefined || resultVariable.sort !== resultSort) {
    report(
      sourceFile,
      declaration,
      `source proof result variable must have ${resultSort === "Bool" ? "boolean" : "integer"} sort`,
    );
  }

  const inputVariables = variables.filter((variable) => variable.id !== resultVariableId);

  if (inputVariables.length !== declaration.parameters.length) {
    throw new SourceCompileError(
      `${sourceFile.fileName}: source function has ${declaration.parameters.length} parameters, but the proof declares ${inputVariables.length} input domains`,
    );
  }

  const inputs = new Map<string, InputVariable>();
  const parameterNames = new Map<number, string>();
  const seenNames = new Set<string>();

  for (const [index, parameter] of declaration.parameters.entries()) {
    const name = parameterName(sourceFile, parameter);

    if (seenNames.has(name)) return report(sourceFile, parameter, "duplicate parameter name");

    if (name === "result")
      return report(sourceFile, parameter, 'parameter name "result" is reserved');
    seenNames.add(name);

    const variable = inputVariables[index];

    if (variable === undefined) {
      return report(sourceFile, parameter, `no input domain was declared for parameter "${name}"`);
    }

    inputs.set(name, inputTerm(sourceFile, parameter, variable, name));
    parameterNames.set(variable.id, name);
  }

  return { inputs, parameterNames, resultSort };
};

const minimumOf = (values: ReadonlyArray<bigint>): bigint => {
  const first = values[0];

  if (first === undefined) throw new Error("Cannot find the minimum of an empty list");

  return values.slice(1).reduce((current, value) => (value < current ? value : current), first);
};

const maximumOf = (values: ReadonlyArray<bigint>): bigint => {
  const first = values[0];

  if (first === undefined) throw new Error("Cannot find the maximum of an empty list");

  return values.slice(1).reduce((current, value) => (value > current ? value : current), first);
};

const checkSafeRange = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  minimum: bigint,
  maximum: bigint,
): void => {
  if (minimum < minimumSafeInteger || maximum > maximumSafeInteger) {
    report(
      sourceFile,
      node,
      "operation may leave the safe-integer range; this source subset cannot model its JavaScript number result",
    );
  }
};

const requireInt = (sourceFile: ts.SourceFile, node: ts.Node, term: Term): IntTerm => {
  if (term.sort !== "Int") return report(sourceFile, node, "expected a numeric expression");

  return term;
};

const requireBool = (sourceFile: ts.SourceFile, node: ts.Node, term: Term): BoolTerm => {
  if (term.sort !== "Bool") return report(sourceFile, node, "expected a boolean condition");

  return term;
};

const compileNumericLiteral = (sourceFile: ts.SourceFile, node: ts.NumericLiteral): IntTerm => {
  const value = Number(node.text.replaceAll("_", ""));

  if (!Number.isSafeInteger(value))
    return report(sourceFile, node, "only safe-integer literals are supported");

  const integer = BigInt(value);

  return {
    sort: "Int",
    expression: { kind: "IntLiteral", value: String(value) },
    minimum: integer,
    maximum: integer,
  };
};

const compileIdentifier = (
  sourceFile: ts.SourceFile,
  node: ts.Identifier,
  inputs: ReadonlyMap<string, InputVariable>,
): Term => {
  const input = inputs.get(node.text);

  if (input === undefined) return report(sourceFile, node, `unbound identifier "${node.text}"`);

  return input.term;
};

const compilePrefixUnary = (
  sourceFile: ts.SourceFile,
  node: ts.PrefixUnaryExpression,
  inputs: ReadonlyMap<string, InputVariable>,
): Term => {
  const operand = compileExpression(sourceFile, node.operand, inputs);

  if (node.operator === ts.SyntaxKind.ExclamationToken) {
    const boolean = requireBool(sourceFile, node, operand);

    return { sort: "Bool", expression: { kind: "Not", operand: boolean.expression } };
  }

  const integer = requireInt(sourceFile, node, operand);

  if (node.operator === ts.SyntaxKind.PlusToken) return integer;

  if (node.operator !== ts.SyntaxKind.MinusToken) {
    return report(sourceFile, node, "only unary plus, unary minus, and logical not are supported");
  }

  const minimum = -integer.maximum;
  const maximum = -integer.minimum;
  checkSafeRange(sourceFile, node, minimum, maximum);

  return {
    sort: "Int",
    expression: {
      kind: "Sub",
      left: { kind: "IntLiteral", value: "0" },
      right: integer.expression,
    },
    minimum,
    maximum,
  };
};

const mergeConditional = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  condition: BoolTerm,
  whenTrue: Term,
  whenFalse: Term,
): Term => {
  if (whenTrue.sort !== whenFalse.sort) {
    return report(
      sourceFile,
      node,
      "conditional branches must have the same numeric or boolean sort",
    );
  }

  if (whenTrue.sort === "Int" && whenFalse.sort === "Int") {
    const minimum = whenTrue.minimum < whenFalse.minimum ? whenTrue.minimum : whenFalse.minimum;
    const maximum = whenTrue.maximum > whenFalse.maximum ? whenTrue.maximum : whenFalse.maximum;
    checkSafeRange(sourceFile, node, minimum, maximum);

    return {
      sort: "Int",
      expression: {
        kind: "If",
        sort: "Int",
        condition: condition.expression,
        whenTrue: whenTrue.expression,
        whenFalse: whenFalse.expression,
      },
      minimum,
      maximum,
    };
  }

  if (whenTrue.sort === "Bool" && whenFalse.sort === "Bool") {
    return {
      sort: "Bool",
      expression: {
        kind: "If",
        sort: "Bool",
        condition: condition.expression,
        whenTrue: whenTrue.expression,
        whenFalse: whenFalse.expression,
      },
    };
  }

  return report(sourceFile, node, "conditional branches have incompatible symbolic sorts");
};

const compileConditional = (
  sourceFile: ts.SourceFile,
  node: ts.ConditionalExpression,
  inputs: ReadonlyMap<string, InputVariable>,
): Term =>
  mergeConditional(
    sourceFile,
    node,
    requireBool(sourceFile, node.condition, compileExpression(sourceFile, node.condition, inputs)),
    compileExpression(sourceFile, node.whenTrue, inputs),
    compileExpression(sourceFile, node.whenFalse, inputs),
  );

const compileLogicalBinary = (
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  operator: ts.SyntaxKind,
  left: Term,
  right: Term,
): BoolTerm => {
  const leftBool = requireBool(sourceFile, node.left, left);
  const rightBool = requireBool(sourceFile, node.right, right);

  if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
    return {
      sort: "Bool",
      expression: { kind: "And", operands: [leftBool.expression, rightBool.expression] },
    };
  }

  return {
    sort: "Bool",
    expression: { kind: "Or", operands: [leftBool.expression, rightBool.expression] },
  };
};

const compileArithmetic = (
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  operator: ts.SyntaxKind,
  left: IntTerm,
  right: IntTerm,
): IntTerm => {
  let minimum: bigint;
  let maximum: bigint;
  let expression: IntExpr;

  switch (operator) {
    case ts.SyntaxKind.PlusToken:
      minimum = left.minimum + right.minimum;
      maximum = left.maximum + right.maximum;
      expression = { kind: "Add", left: left.expression, right: right.expression };
      break;
    case ts.SyntaxKind.MinusToken:
      minimum = left.minimum - right.maximum;
      maximum = left.maximum - right.minimum;
      expression = { kind: "Sub", left: left.expression, right: right.expression };
      break;
    case ts.SyntaxKind.AsteriskToken: {
      const products = [
        left.minimum * right.minimum,
        left.minimum * right.maximum,
        left.maximum * right.minimum,
        left.maximum * right.maximum,
      ];

      minimum = minimumOf(products);
      maximum = maximumOf(products);
      expression = { kind: "Mul", left: left.expression, right: right.expression };
      break;
    }

    default:
      return report(sourceFile, node, `operator ${ts.SyntaxKind[operator]} is unsupported`);
  }

  checkSafeRange(sourceFile, node, minimum, maximum);

  return { sort: "Int", expression, minimum, maximum };
};

const compileComparison = (
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  operator: ts.SyntaxKind,
  left: IntTerm,
  right: IntTerm,
): BoolTerm => {
  switch (operator) {
    case ts.SyntaxKind.LessThanToken:
      return {
        sort: "Bool",
        expression: { kind: "Lt", left: left.expression, right: right.expression },
      };
    case ts.SyntaxKind.LessThanEqualsToken:
      return {
        sort: "Bool",
        expression: { kind: "Lte", left: left.expression, right: right.expression },
      };
    case ts.SyntaxKind.GreaterThanToken:
      return {
        sort: "Bool",
        expression: { kind: "Gt", left: left.expression, right: right.expression },
      };
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return {
        sort: "Bool",
        expression: { kind: "Gte", left: left.expression, right: right.expression },
      };
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return {
        sort: "Bool",
        expression: { kind: "Equal", sort: "Int", left: left.expression, right: right.expression },
      };
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return {
        sort: "Bool",
        expression: {
          kind: "NotEqual",
          sort: "Int",
          left: left.expression,
          right: right.expression,
        },
      };
    default:
      return report(sourceFile, node, `operator ${ts.SyntaxKind[operator]} is unsupported`);
  }
};

const compileBinary = (
  sourceFile: ts.SourceFile,
  node: ts.BinaryExpression,
  inputs: ReadonlyMap<string, InputVariable>,
): Term => {
  const left = compileExpression(sourceFile, node.left, inputs);
  const right = compileExpression(sourceFile, node.right, inputs);
  const operator = node.operatorToken.kind;

  if (
    operator === ts.SyntaxKind.AmpersandAmpersandToken ||
    operator === ts.SyntaxKind.BarBarToken
  ) {
    return compileLogicalBinary(sourceFile, node, operator, left, right);
  }

  const leftInt = requireInt(sourceFile, node.left, left);
  const rightInt = requireInt(sourceFile, node.right, right);

  return comparisonOperators.has(operator)
    ? compileComparison(sourceFile, node, operator, leftInt, rightInt)
    : compileArithmetic(sourceFile, node, operator, leftInt, rightInt);
};

const compileExpression = (
  sourceFile: ts.SourceFile,
  node: ts.Expression,
  inputs: ReadonlyMap<string, InputVariable>,
): Term => {
  if (ts.isNumericLiteral(node)) return compileNumericLiteral(sourceFile, node);

  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      sort: "Bool",
      expression: { kind: "BoolLiteral", value: node.kind === ts.SyntaxKind.TrueKeyword },
    };
  }

  if (ts.isIdentifier(node)) return compileIdentifier(sourceFile, node, inputs);

  if (ts.isParenthesizedExpression(node))
    return compileExpression(sourceFile, node.expression, inputs);

  if (ts.isPrefixUnaryExpression(node)) return compilePrefixUnary(sourceFile, node, inputs);

  if (ts.isConditionalExpression(node)) return compileConditional(sourceFile, node, inputs);

  if (ts.isBinaryExpression(node)) return compileBinary(sourceFile, node, inputs);

  return report(sourceFile, node, `${ts.SyntaxKind[node.kind]} expressions are unsupported`);
};

const literalInteger = (sourceFile: ts.SourceFile, node: ts.Expression): bigint => {
  if (ts.isNumericLiteral(node)) {
    const value = Number(node.text.replaceAll("_", ""));

    if (!Number.isSafeInteger(value))
      return report(sourceFile, node, "only safe-integer literals are supported");

    return BigInt(value);
  }

  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken) &&
    ts.isNumericLiteral(node.operand)
  ) {
    const value = literalInteger(sourceFile, node.operand);

    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }

  return report(sourceFile, node, "counted loops require literal integer bounds and steps");
};

interface LoopSpecification {
  readonly name: string;
  readonly start: bigint;
  readonly end: bigint;
  readonly step: bigint;
  readonly inclusive: boolean;
}

const loopSpecification = (sourceFile: ts.SourceFile, node: ts.ForStatement): LoopSpecification => {
  const initializer = node.initializer;

  if (
    initializer === undefined ||
    !ts.isVariableDeclarationList(initializer) ||
    (initializer.flags & ts.NodeFlags.Let) === 0 ||
    initializer.declarations.length !== 1
  ) {
    return report(
      sourceFile,
      node,
      "counted loops require one let induction variable initialized with an integer literal",
    );
  }

  const declaration = initializer.declarations[0];

  if (
    declaration === undefined ||
    !ts.isIdentifier(declaration.name) ||
    declaration.initializer === undefined
  ) {
    return report(
      sourceFile,
      node,
      "counted loops require a named induction variable and literal initializer",
    );
  }

  const name = declaration.name.text;
  const start = literalInteger(sourceFile, declaration.initializer);
  const condition = node.condition;

  if (
    condition === undefined ||
    !ts.isBinaryExpression(condition) ||
    !ts.isIdentifier(condition.left) ||
    condition.left.text !== name ||
    ![
      ts.SyntaxKind.LessThanToken,
      ts.SyntaxKind.LessThanEqualsToken,
      ts.SyntaxKind.GreaterThanToken,
      ts.SyntaxKind.GreaterThanEqualsToken,
    ].includes(condition.operatorToken.kind)
  ) {
    return report(
      sourceFile,
      node,
      "counted loops require an induction-variable comparison with a literal bound",
    );
  }

  const end = literalInteger(sourceFile, condition.right);

  const inclusive =
    condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken ||
    condition.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken;

  const ascending =
    condition.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
    condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken;

  let step: bigint;
  const incrementor = node.incrementor;

  if (incrementor === undefined)
    return report(sourceFile, node, "counted loops require a canonical induction-variable update");

  if (ts.isPostfixUnaryExpression(incrementor) || ts.isPrefixUnaryExpression(incrementor)) {
    if (
      !ts.isIdentifier(incrementor.operand) ||
      incrementor.operand.text !== name ||
      (incrementor.operator !== ts.SyntaxKind.PlusPlusToken &&
        incrementor.operator !== ts.SyntaxKind.MinusMinusToken)
    ) {
      return report(
        sourceFile,
        incrementor,
        "counted loops require a canonical induction-variable update",
      );
    }

    step = incrementor.operator === ts.SyntaxKind.PlusPlusToken ? 1n : -1n;
  } else if (
    ts.isBinaryExpression(incrementor) &&
    ts.isIdentifier(incrementor.left) &&
    incrementor.left.text === name &&
    (incrementor.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ||
      incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken)
  ) {
    step = literalInteger(sourceFile, incrementor.right);

    if (incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) step = -step;
  } else {
    return report(
      sourceFile,
      incrementor,
      "counted loops require a canonical induction-variable update",
    );
  }

  if (step === 0n || (ascending && step < 0n) || (!ascending && step > 0n)) {
    return report(sourceFile, node, "counted loop step must be nonzero and match its direction");
  }

  for (const value of [start, end]) {
    if (value < minimumSafeInteger || value > maximumSafeInteger) {
      return report(
        sourceFile,
        node,
        "counted loop bounds and induction values must be safe integers",
      );
    }
  }

  return { name, start, end, step, inclusive };
};

const compileStatements = (
  sourceFile: ts.SourceFile,
  statements: ts.NodeArray<ts.Statement>,
  environment: Map<string, InputVariable>,
  fallback?: Term,
  loopDepth = 0,
): Term | undefined => {
  const compileFrom = (index: number, scope: Map<string, InputVariable>): Term | undefined => {
    if (index >= statements.length) return fallback;
    const statement = statements[index];

    if (statement === undefined) return fallback;
    const rest = (): Term | undefined => compileFrom(index + 1, new Map(scope));

    if (ts.isVariableStatement(statement)) {
      if (
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
        statement.declarationList.declarations.length !== 1
      ) {
        return report(sourceFile, statement, "only single immutable const locals are supported");
      }

      const declaration = statement.declarationList.declarations[0];

      if (
        declaration === undefined ||
        !ts.isIdentifier(declaration.name) ||
        declaration.initializer === undefined
      ) {
        return report(
          sourceFile,
          statement,
          "const locals require a named identifier and initializer",
        );
      }

      if (scope.has(declaration.name.text))
        return report(
          sourceFile,
          declaration.name,
          `ambiguous shadowing of local "${declaration.name.text}"`,
        );
      scope.set(declaration.name.text, {
        term: compileExpression(sourceFile, declaration.initializer, scope),
      });

      return compileFrom(index + 1, scope);
    }

    if (ts.isReturnStatement(statement)) {
      if (statement.expression === undefined)
        return report(sourceFile, statement, "return requires an expression");

      return compileExpression(sourceFile, statement.expression, scope);
    }

    if (ts.isBlock(statement))
      return compileStatements(sourceFile, statement.statements, new Map(scope), rest(), loopDepth);

    if (ts.isIfStatement(statement)) {
      const condition = requireBool(
        sourceFile,
        statement.expression,
        compileExpression(sourceFile, statement.expression, scope),
      );

      const thenResult = compileStatements(
        sourceFile,
        ts.isBlock(statement.thenStatement)
          ? statement.thenStatement.statements
          : ts.factory.createNodeArray([statement.thenStatement]),
        new Map(scope),
        rest(),
        loopDepth,
      );

      const elseResult =
        statement.elseStatement === undefined
          ? rest()
          : compileStatements(
              sourceFile,
              ts.isBlock(statement.elseStatement)
                ? statement.elseStatement.statements
                : ts.factory.createNodeArray([statement.elseStatement]),
              new Map(scope),
              rest(),
              loopDepth,
            );

      if (thenResult === undefined || elseResult === undefined)
        return report(sourceFile, statement, "function has an incomplete return path");

      return mergeConditional(sourceFile, statement, condition, thenResult, elseResult);
    }

    if (ts.isForStatement(statement)) {
      if (loopDepth > 0)
        return report(sourceFile, statement, "nested counted loops are unsupported");
      const spec = loopSpecification(sourceFile, statement);

      if (scope.has(spec.name))
        return report(sourceFile, statement, `ambiguous shadowing of local "${spec.name}"`);
      const iterations: bigint[] = [];

      for (
        let value = spec.start;
        spec.step > 0n
          ? spec.inclusive
            ? value <= spec.end
            : value < spec.end
          : spec.inclusive
            ? value >= spec.end
            : value > spec.end;
        value += spec.step
      ) {
        if (iterations.length === 32)
          return report(sourceFile, statement, "counted loops may execute at most 32 iterations");
        const nextValue = value + spec.step;

        if (
          value < minimumSafeInteger ||
          value > maximumSafeInteger ||
          nextValue < minimumSafeInteger ||
          nextValue > maximumSafeInteger
        )
          return report(
            sourceFile,
            statement,
            "counted loop induction values must be safe integers",
          );
        iterations.push(value);
      }

      let continuation = rest();

      for (const value of iterations.reverse()) {
        const iterationScope = new Map(scope);
        iterationScope.set(spec.name, {
          term: {
            sort: "Int",
            expression: { kind: "IntLiteral", value: String(value) },
            minimum: value,
            maximum: value,
          },
        });

        const bodyStatements = ts.isBlock(statement.statement)
          ? statement.statement.statements
          : ts.factory.createNodeArray([statement.statement]);

        const result = compileStatements(
          sourceFile,
          bodyStatements,
          iterationScope,
          continuation,
          loopDepth + 1,
        );

        if (result === undefined)
          return report(sourceFile, statement, "loop body has an incomplete return path");
        continuation = result;
      }

      return continuation;
    }

    return report(sourceFile, statement, "statement is unsupported");
  };

  return compileFrom(0, environment);
};

const compileFunctionBody = (
  sourceFile: ts.SourceFile,
  body: ts.ConciseBody,
  inputs: ReadonlyMap<string, InputVariable>,
): Term => {
  if (!ts.isBlock(body)) return compileExpression(sourceFile, body, inputs);
  const result = compileStatements(sourceFile, body.statements, new Map(inputs));

  if (result === undefined)
    return report(sourceFile, body, "function has an incomplete return path");

  return result;
};

const loadSourceProgram = (absolutePath: string) => {
  const program = ts.createProgram({
    rootNames: [absolutePath],
    options: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });

  const sourceFile = program.getSourceFile(absolutePath);

  if (sourceFile === undefined)
    throw new SourceCompileError(`cannot read or parse source file ${absolutePath}`);

  const diagnostic = program.getSyntacticDiagnostics(sourceFile)[0];

  if (diagnostic !== undefined) throw new SourceCompileError(diagnosticMessage(diagnostic));

  return { program, sourceFile };
};

const sourceFunctionSymbols = (
  program: ts.Program,
  proofSourceFile: ts.SourceFile,
): ReadonlySet<ts.Symbol> => {
  const checker = program.getTypeChecker();

  const declarations = proofSourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === "@effect-verifier/core"
      ? [statement.moduleSpecifier]
      : [],
  );

  const symbols = new Set<ts.Symbol>();

  for (const moduleSpecifier of declarations) {
    const moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);

    if (moduleSymbol === undefined) continue;

    const exports = checker.getExportsOfModule(moduleSymbol);
    const sourceFunctionExport = exports.find((symbol) => symbol.getName() === "sourceFunction");

    const sourceEffectFunctionExport = exports.find(
      (symbol) => symbol.getName() === "sourceEffectFunction",
    );

    const verifyExport = exports.find((symbol) => symbol.getName() === "Verify");

    if (
      (sourceFunctionExport === undefined && sourceEffectFunctionExport === undefined) ||
      verifyExport === undefined
    )
      continue;

    if (sourceFunctionExport !== undefined) {
      const sourceFunctionSymbol =
        (sourceFunctionExport.flags & ts.SymbolFlags.Alias) !== 0
          ? checker.getAliasedSymbol(sourceFunctionExport)
          : sourceFunctionExport;

      symbols.add(sourceFunctionSymbol);
    }

    if (sourceEffectFunctionExport !== undefined) {
      const sourceEffectFunctionSymbol =
        (sourceEffectFunctionExport.flags & ts.SymbolFlags.Alias) !== 0
          ? checker.getAliasedSymbol(sourceEffectFunctionExport)
          : sourceEffectFunctionExport;

      symbols.add(sourceEffectFunctionSymbol);
    }

    const verifyType = checker.getTypeOfSymbolAtLocation(verifyExport, proofSourceFile);

    for (const propertyName of ["sourceFunction", "sourceEffectFunction"]) {
      const verifyFunction = checker.getPropertyOfType(verifyType, propertyName);

      if (verifyFunction !== undefined) symbols.add(verifyFunction);
    }
  }

  return symbols;
};

const selectedSourceType = (
  program: ts.Program,
  proofSourceFile: ts.SourceFile,
  proofExportName: string,
): ts.TypeNode => {
  const checker = program.getTypeChecker();
  const validSourceFunctionSymbols = sourceFunctionSymbols(program, proofSourceFile);

  if (validSourceFunctionSymbols.size === 0) {
    throw new SourceCompileError(
      "cannot resolve the @effect-verifier/core Verify.sourceFunction API",
    );
  }

  const declarations = proofSourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) return [];

    return statement.declarationList.declarations.filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) && declaration.name.text === proofExportName,
    );
  });

  if (declarations.length !== 1) {
    throw new SourceCompileError(`proof export "${proofExportName}" must be one exported variable`);
  }

  const declaration = declarations[0];

  if (declaration === undefined || declaration.initializer === undefined) {
    throw new SourceCompileError(`proof export "${proofExportName}" has no initializer`);
  }

  const calls: Array<ts.CallExpression> = [];
  let invalidSourceFunctionCall: "sourceFunction" | "sourceEffectFunction" | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let symbol = checker.getSymbolAtLocation(node.expression);

      if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
        symbol = checker.getAliasedSymbol(symbol);
      }

      const symbolName = symbol?.getName();

      if (symbol !== undefined && validSourceFunctionSymbols.has(symbol)) {
        calls.push(node);
      } else if (symbolName === "sourceFunction" || symbolName === "sourceEffectFunction") {
        invalidSourceFunctionCall = symbolName;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(declaration.initializer);

  if (invalidSourceFunctionCall !== undefined) {
    throw new SourceCompileError(
      `proof export "${proofExportName}" calls a non-core ${invalidSourceFunctionCall} wrapper`,
    );
  }

  if (calls.length !== 1) {
    throw new SourceCompileError(
      `proof export "${proofExportName}" must contain exactly one resolved Verify.sourceFunction call`,
    );
  }

  const typeArgument = calls[0]?.typeArguments?.[0];

  if (typeArgument === undefined) {
    throw new SourceCompileError(
      `proof export "${proofExportName}" has no resolvable source module type argument`,
    );
  }

  return typeArgument;
};

const assertSourceModuleMatches = (
  program: ts.Program,
  proofSourceFile: ts.SourceFile,
  proofExportName: string,
  sourcePath: string,
): void => {
  const checker = program.getTypeChecker();
  const typeArgument = selectedSourceType(program, proofSourceFile, proofExportName);
  const type = checker.getTypeAtLocation(typeArgument);
  const moduleSymbol = type.getSymbol();

  const moduleFiles = new Set(
    (moduleSymbol?.declarations ?? []).map((declaration) =>
      realpathSync(declaration.getSourceFile().fileName),
    ),
  );

  if (moduleFiles.size !== 1) {
    throw new SourceCompileError(
      `proof export "${proofExportName}" source module type does not resolve to exactly one file`,
    );
  }

  if (!moduleFiles.has(sourcePath)) {
    throw new SourceCompileError(
      `proof export "${proofExportName}" type-only source module does not match sourceFile ${sourcePath}`,
    );
  }
};

export const compileSourceProof = (
  proof: SourceProof,
  proofModulePath: string,
  proofExportName: string,
): VerificationProgram => {
  const absoluteProofPath = realpathSync(resolve(proofModulePath));
  const { program, sourceFile: proofSourceFile } = loadSourceProgram(absoluteProofPath);
  const proofDirectory = dirname(absoluteProofPath);
  const absolutePath = realpathSync(resolve(proofDirectory, proof.sourceFile));
  assertSourceModuleMatches(program, proofSourceFile, proofExportName, absolutePath);
  const sourceFile = loadSourceProgram(absolutePath).sourceFile;

  const resultVariables = proof.program.variables.filter(
    (variable) => variable.id === proof.resultVariableId,
  );

  if (resultVariables.length !== 1) {
    throw new SourceCompileError("source proof must declare exactly one result variable");
  }

  const resultVariable = resultVariables[0];

  if (resultVariable === undefined)
    throw new SourceCompileError("source result variable is missing");

  const declaration = findTarget(sourceFile, proof.functionName);

  const signature = validateSignature(
    sourceFile,
    declaration,
    proof.program.variables,
    proof.resultVariableId,
  );

  const body = functionBody(sourceFile, declaration);

  if ((proof.resultSort ?? "Int") !== signature.resultSort) {
    report(sourceFile, declaration, `proof resultSort must be ${signature.resultSort}`);
  }

  const resultTerm = compileFunctionBody(sourceFile, body, signature.inputs);

  if (resultTerm.sort !== signature.resultSort) {
    return report(
      sourceFile,
      body,
      `function result expression must have ${signature.resultSort === "Bool" ? "boolean" : "numeric"} sort`,
    );
  }

  const resultEquality: BoolExpr =
    signature.resultSort === "Int"
      ? {
          kind: "Equal",
          sort: "Int",
          left: { kind: "Variable", id: proof.resultVariableId, sort: "Int" },
          right: requireInt(sourceFile, body, resultTerm).expression,
        }
      : {
          kind: "Equal",
          sort: "Bool",
          left: { kind: "Variable", id: proof.resultVariableId, sort: "Bool" },
          right: requireBool(sourceFile, body, resultTerm).expression,
        };

  const variables = proof.program.variables.map((variable) => {
    const parameterName = signature.parameterNames.get(variable.id);

    if (parameterName !== undefined) return { ...variable, name: parameterName };

    if (variable.id !== proof.resultVariableId || signature.resultSort === "Bool") return variable;

    if (resultTerm.sort !== "Int") throw new Error("Numeric result sort validation failed");

    return {
      ...variable,
      domain: `SafeInt[${resultTerm.minimum}, ${resultTerm.maximum}]`,
      minimum: Number(resultTerm.minimum),
      maximum: Number(resultTerm.maximum),
    };
  });

  const variableNames = new Map(variables.map((variable) => [variable.id, variable.name]));

  const assertions = proof.program.assertions.map((assertion) => ({
    ...assertion,
    label:
      proof.assertionLabel?.trim() ||
      formatExpr(assertion.expression, (id) => variableNames.get(id) ?? `v${id}`),
  }));

  return Object.freeze({
    ...proof.program,
    variables: Object.freeze(variables),
    assumptions: Object.freeze([...proof.program.assumptions, resultEquality]),
    assertions: Object.freeze(assertions),
  });
};

interface EffectMethodSymbols {
  readonly succeed: ReadonlySet<ts.Symbol>;
  readonly fail: ReadonlySet<ts.Symbol>;
}

interface EffectTypeSignature {
  readonly successSort: "Int" | "Bool";
  readonly errorTags: ReadonlyArray<string>;
}

interface EffectSignature extends ValidatedSignature {
  readonly errorTags: ReadonlyArray<string>;
}

type EffectValue = InputVariable | Term | EffectTerm;

const effectExpressionInputs = (environment: EffectEnvironment): Map<string, InputVariable> =>
  new Map(
    [...environment].flatMap(([name, value]) => {
      if ("tag" in value) return [];

      return [[name, "term" in value ? value : { term: value }]];
    }),
  );

type EffectEnvironment = ReadonlyMap<string, EffectValue>;

const canonicalSymbol = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined =>
  symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;

const effectMethodSymbols = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
): EffectMethodSymbols => {
  const checker = program.getTypeChecker();
  const succeed = new Set<ts.Symbol>();
  const fail = new Set<ts.Symbol>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "effect"
    )
      continue;
    const moduleSymbol = checker.getSymbolAtLocation(statement.moduleSpecifier);

    if (moduleSymbol === undefined) continue;

    const effectExport = checker
      .getExportsOfModule(moduleSymbol)
      .find((symbol) => symbol.getName() === "Effect");

    const effectSymbol = canonicalSymbol(checker, effectExport);

    if (effectSymbol === undefined) continue;

    for (const member of checker.getExportsOfModule(effectSymbol)) {
      const actual = canonicalSymbol(checker, member);

      if (actual === undefined) continue;

      if (member.getName() === "succeed") succeed.add(actual);

      if (member.getName() === "fail") fail.add(actual);
    }
  }

  return { succeed, fail };
};

const effectTypeSignature = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionLikeDeclaration,
): EffectTypeSignature => {
  if (declaration.type === undefined || !ts.isTypeReferenceNode(declaration.type)) {
    return report(
      sourceFile,
      declaration,
      "effect function requires an explicit Effect.Effect<A, E, never> return annotation",
    );
  }

  const checker = program.getTypeChecker();
  const type = checker.getTypeFromTypeNode(declaration.type);
  const symbol = type.getSymbol();
  const declarationFile = symbol?.declarations?.[0]?.getSourceFile().fileName;

  if (
    symbol?.getName() !== "Effect" ||
    declarationFile === undefined ||
    !declarationFile.replaceAll("\\", "/").includes("/effect/")
  ) {
    return report(
      sourceFile,
      declaration.type,
      "return annotation must resolve to the imported Effect.Effect type",
    );
  }

  // SAFETY: a TypeReferenceNode resolves to a TypeReference in the TypeScript checker.
  const arguments_ = checker.getTypeArguments(type as ts.TypeReference);

  if (arguments_.length !== 3)
    return report(
      sourceFile,
      declaration.type,
      "Effect.Effect return annotation must specify A, E, and R",
    );
  const [success, error, environment] = arguments_;

  if (success === undefined || error === undefined || environment === undefined)
    return report(sourceFile, declaration.type, "invalid Effect.Effect type arguments");

  const successSort =
    success.flags === ts.TypeFlags.Number
      ? "Int"
      : checker.typeToString(success) === "boolean" &&
          (success.flags & ts.TypeFlags.BooleanLike) !== 0
        ? "Bool"
        : undefined;

  if (successSort === undefined)
    return report(
      sourceFile,
      declaration.type,
      `Effect success type must be exactly number or boolean (received ${checker.typeToString(success)}, flags ${success.flags})`,
    );

  if ((environment.flags & ts.TypeFlags.Never) === 0)
    return report(
      sourceFile,
      declaration.type,
      "Effect functions requiring an environment are unsupported",
    );
  const errorTypes = error.isUnion() ? error.types : [error];
  const errorTags: string[] = [];

  if ((error.flags & ts.TypeFlags.Never) === 0) {
    for (const errorType of errorTypes) {
      if ((errorType.flags & ts.TypeFlags.StringLiteral) === 0)
        return report(
          sourceFile,
          declaration.type,
          "Effect error type must be a finite union of string literals",
        );
      // SAFETY: the StringLiteral flag guarantees the checker exposes a StringLiteralType.
      const tag = (errorType as ts.StringLiteralType).value;

      if (!errorTags.includes(tag)) errorTags.push(tag);
    }
  }

  return { successSort, errorTags };
};

const validateEffectSignature = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
  declaration: ts.FunctionLikeDeclaration,
  proof: SourceEffectProof,
): EffectSignature => {
  if (
    hasModifier(declaration, ts.SyntaxKind.AsyncKeyword) ||
    declaration.asteriskToken !== undefined
  )
    report(sourceFile, declaration, "async and generator functions are unsupported");
  const declared = effectTypeSignature(program, sourceFile, declaration);

  if (proof.resultSort !== declared.successSort)
    report(sourceFile, declaration, `proof resultSort must be ${declared.successSort}`);

  const resultVariable = proof.program.variables.filter(
    (variable) => variable.id === proof.resultVariableId,
  );

  const tagVariable = proof.program.variables.filter(
    (variable) => variable.id === proof.tagVariableId,
  );

  const failureTagVariable = proof.program.variables.filter(
    (variable) => variable.id === proof.failureTagVariableId,
  );

  if (resultVariable.length !== 1 || resultVariable[0]?.sort !== declared.successSort)
    report(sourceFile, declaration, "source effect success variable has the wrong sort");

  if (tagVariable.length !== 1 || tagVariable[0]?.sort !== "String")
    report(sourceFile, declaration, "source effect outcome tag must be a String variable");

  if (failureTagVariable.length !== 1 || failureTagVariable[0]?.sort !== "String")
    report(sourceFile, declaration, "source effect failure tag must be a String variable");

  if (
    proof.resultVariableId === proof.tagVariableId ||
    proof.resultVariableId === proof.failureTagVariableId ||
    proof.tagVariableId === proof.failureTagVariableId
  )
    report(sourceFile, declaration, "source effect outcome variables must be distinct");

  const inputs = proof.program.variables.filter(
    (variable) =>
      variable.id !== proof.resultVariableId &&
      variable.id !== proof.tagVariableId &&
      variable.id !== proof.failureTagVariableId,
  );

  if (inputs.length !== declaration.parameters.length)
    throw new SourceCompileError(
      `${sourceFile.fileName}: source effect has ${declaration.parameters.length} parameters, but the proof declares ${inputs.length} input domains`,
    );
  const inputMap = new Map<string, InputVariable>();
  const parameterNames = new Map<number, string>();
  const seen = new Set<string>();

  for (const [index, parameter] of declaration.parameters.entries()) {
    const name = parameterName(sourceFile, parameter);

    if (
      seen.has(name) ||
      name === "result" ||
      name === "successValue" ||
      name === "outcomeTag" ||
      name === "failureTag"
    )
      report(sourceFile, parameter, "duplicate or reserved parameter name");
    seen.add(name);
    const variable = inputs[index];

    if (variable === undefined)
      return report(sourceFile, parameter, `missing input domain for parameter "${name}"`);
    inputMap.set(name, inputTerm(sourceFile, parameter, variable, name));
    parameterNames.set(variable.id, name);
  }

  return {
    inputs: inputMap,
    parameterNames,
    resultSort: declared.successSort,
    errorTags: declared.errorTags,
  };
};

const failPayload = (sort: "Int" | "Bool"): IntTerm | BoolTerm =>
  sort === "Int"
    ? { sort: "Int", expression: { kind: "IntLiteral", value: "0" }, minimum: 0n, maximum: 0n }
    : { sort: "Bool", expression: { kind: "BoolLiteral", value: false } };

const effectConditional = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  condition: BoolTerm,
  yes: EffectTerm,
  no: EffectTerm,
): EffectTerm => {
  if (yes.payload.sort !== no.payload.sort)
    return report(sourceFile, node, "conditional Effect branches have incompatible success sorts");
  const payload = mergeConditional(sourceFile, node, condition, yes.payload, no.payload);

  return {
    isSuccess: {
      kind: "If",
      sort: "Bool",
      condition: condition.expression,
      whenTrue: yes.isSuccess,
      whenFalse: no.isSuccess,
    },
    tag: {
      kind: "If",
      sort: "String",
      condition: condition.expression,
      whenTrue: yes.tag,
      whenFalse: no.tag,
    },
    payload,
    failures: new Set([...yes.failures, ...no.failures]),
  };
};

const lowerEffectExpression = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
  node: ts.Expression,
  environment: EffectEnvironment,
  signature: EffectSignature,
  methods: ReturnType<typeof effectMethodSymbols>,
): EffectTerm => {
  const checker = program.getTypeChecker();

  if (ts.isParenthesizedExpression(node))
    return lowerEffectExpression(
      program,
      sourceFile,
      node.expression,
      environment,
      signature,
      methods,
    );

  if (ts.isIdentifier(node)) {
    const value = environment.get(node.text);

    if (value !== undefined && "tag" in value) return value;

    return report(
      sourceFile,
      node,
      "Effect return must be Effect.succeed/Effect.fail or a conditional of supported outcomes",
    );
  }

  if (ts.isConditionalExpression(node)) {
    const condition = requireBool(
      sourceFile,
      node.condition,
      compileExpression(sourceFile, node.condition, effectExpressionInputs(environment)),
    );

    return effectConditional(
      sourceFile,
      node,
      condition,
      lowerEffectExpression(program, sourceFile, node.whenTrue, environment, signature, methods),
      lowerEffectExpression(program, sourceFile, node.whenFalse, environment, signature, methods),
    );
  }

  if (ts.isCallExpression(node)) {
    const callTarget = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;

    const method = canonicalSymbol(checker, checker.getSymbolAtLocation(callTarget));

    if (node.arguments.length !== 1 || node.arguments[0] === undefined)
      return report(
        sourceFile,
        node,
        "Effect.succeed and Effect.fail require exactly one supported payload",
      );

    if (method !== undefined && methods.succeed.has(method)) {
      const payload = compileExpression(
        sourceFile,
        node.arguments[0],
        effectExpressionInputs(environment),
      );

      if (payload.sort !== signature.resultSort)
        return report(
          sourceFile,
          node.arguments[0],
          "Effect.succeed payload sort does not match the declared success type",
        );

      return {
        isSuccess: { kind: "BoolLiteral", value: true },
        tag: { kind: "StringLiteral", value: "" },
        payload,
        failures: new Set(),
      };
    }

    if (method !== undefined && methods.fail.has(method)) {
      const argument = node.arguments[0];

      if (!ts.isStringLiteral(argument))
        return report(
          sourceFile,
          argument,
          "Effect.fail payload must be a direct string literal tag",
        );

      if (!signature.errorTags.includes(argument.text))
        return report(
          sourceFile,
          argument,
          `Effect.fail tag ${JSON.stringify(argument.text)} is absent from the finite error type`,
        );

      return {
        isSuccess: { kind: "BoolLiteral", value: false },
        tag: { kind: "StringLiteral", value: argument.text },
        payload: failPayload(signature.resultSort),
        failures: new Set([argument.text]),
      };
    }

    return report(
      sourceFile,
      node,
      "only the actual imported Effect.succeed and Effect.fail functions are supported",
    );
  }

  return report(
    sourceFile,
    node,
    `${ts.SyntaxKind[node.kind]} is unsupported in an Effect outcome`,
  );
};

const lowerEffectStatements = (
  program: ts.Program,
  sourceFile: ts.SourceFile,
  statements: ts.NodeArray<ts.Statement>,
  environment: Map<string, EffectValue>,
  signature: EffectSignature,
  methods: ReturnType<typeof effectMethodSymbols>,
  fallback?: EffectTerm,
): EffectTerm | undefined => {
  const lowerFrom = (index: number, scope: Map<string, EffectValue>): EffectTerm | undefined => {
    if (index >= statements.length) return fallback;
    const statement = statements[index];

    if (statement === undefined) return fallback;
    const rest = (): EffectTerm | undefined => lowerFrom(index + 1, new Map(scope));

    if (ts.isVariableStatement(statement)) {
      if (
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
        statement.declarationList.declarations.length !== 1
      )
        return report(sourceFile, statement, "only single immutable const locals are supported");
      const declaration = statement.declarationList.declarations[0];

      if (
        declaration === undefined ||
        !ts.isIdentifier(declaration.name) ||
        declaration.initializer === undefined ||
        scope.has(declaration.name.text)
      )
        return report(
          sourceFile,
          statement,
          "const locals require a new named identifier and initializer",
        );
      let value: EffectValue;

      try {
        value = lowerEffectExpression(
          program,
          sourceFile,
          declaration.initializer,
          scope,
          signature,
          methods,
        );
      } catch (error) {
        if (!(error instanceof SourceCompileError)) throw error;
        const plain = effectExpressionInputs(scope);
        value = compileExpression(sourceFile, declaration.initializer, plain);
      }

      scope.set(declaration.name.text, value);

      return lowerFrom(index + 1, scope);
    }

    if (ts.isReturnStatement(statement)) {
      if (statement.expression === undefined)
        return report(sourceFile, statement, "return requires an Effect expression");

      return lowerEffectExpression(
        program,
        sourceFile,
        statement.expression,
        scope,
        signature,
        methods,
      );
    }

    if (ts.isBlock(statement))
      return lowerEffectStatements(
        program,
        sourceFile,
        statement.statements,
        new Map(scope),
        signature,
        methods,
        rest(),
      );

    if (ts.isIfStatement(statement)) {
      const plain = effectExpressionInputs(scope);

      const condition = requireBool(
        sourceFile,
        statement.expression,
        compileExpression(sourceFile, statement.expression, plain),
      );

      const branch = (
        node: ts.Statement | undefined,
        branchEnv: Map<string, EffectValue>,
      ): EffectTerm | undefined => {
        if (node === undefined) return rest();

        const branchStatements = ts.isBlock(node)
          ? node.statements
          : ts.factory.createNodeArray([node]);

        return lowerEffectStatements(
          program,
          sourceFile,
          branchStatements,
          branchEnv,
          signature,
          methods,
          rest(),
        );
      };

      const yes = branch(statement.thenStatement, new Map(scope));
      const no = branch(statement.elseStatement, new Map(scope));

      if (yes === undefined || no === undefined)
        return report(sourceFile, statement, "function has a missing Effect return path");

      return effectConditional(sourceFile, statement, condition, yes, no);
    }

    return report(
      sourceFile,
      statement,
      "Effect functions support only immutable locals, returns, and finite conditionals; loops and other statements are unsupported",
    );
  };

  return lowerFrom(0, environment);
};

export const compileSourceEffectProof = (
  proof: SourceEffectProof,
  proofModulePath: string,
  proofExportName: string,
): VerificationProgram => {
  if (!isSourceEffectProof(proof)) throw new SourceCompileError("forged source effect proof");
  const absoluteProofPath = realpathSync(resolve(proofModulePath));
  const loadedProof = loadSourceProgram(absoluteProofPath);
  const absolutePath = realpathSync(resolve(dirname(absoluteProofPath), proof.sourceFile));
  assertSourceModuleMatches(
    loadedProof.program,
    loadedProof.sourceFile,
    proofExportName,
    absolutePath,
  );
  const loadedSource = loadSourceProgram(absolutePath);
  const declaration = findTarget(loadedSource.sourceFile, proof.functionName);

  const signature = validateEffectSignature(
    loadedSource.program,
    loadedSource.sourceFile,
    declaration,
    proof,
  );

  const body = functionBody(loadedSource.sourceFile, declaration);
  const methods = effectMethodSymbols(loadedSource.program, loadedSource.sourceFile);

  if (methods.succeed.size === 0)
    throw new SourceCompileError("cannot resolve actual Effect.succeed import");

  const effectInputs = new Map(
    [...signature.inputs].map(([name, input]) => [name, input] as const),
  );

  const loweredResult = ts.isBlock(body)
    ? lowerEffectStatements(
        loadedSource.program,
        loadedSource.sourceFile,
        body.statements,
        effectInputs,
        signature,
        methods,
      )
    : lowerEffectExpression(
        loadedSource.program,
        loadedSource.sourceFile,
        body,
        effectInputs,
        signature,
        methods,
      );

  if (loweredResult === undefined)
    return report(loadedSource.sourceFile, body, "function has an incomplete Effect return path");
  const lowered = loweredResult;

  for (const tag of lowered.failures)
    if (!signature.errorTags.includes(tag))
      report(
        loadedSource.sourceFile,
        body,
        `failure tag ${JSON.stringify(tag)} is not declared in the Effect error type`,
      );

  const tagVariable = {
    kind: "Variable" as const,
    id: proof.tagVariableId,
    sort: "String" as const,
  };

  const tagEquality: BoolExpr = {
    kind: "Equal",
    sort: "String",
    left: tagVariable,
    right: {
      kind: "If",
      sort: "String",
      condition: lowered.isSuccess,
      whenTrue: { kind: "StringLiteral", value: "Success" },
      whenFalse: { kind: "StringLiteral", value: "Failure" },
    },
  };

  const failureTagVariable = {
    kind: "Variable" as const,
    id: proof.failureTagVariableId,
    sort: "String" as const,
  };

  const failureTagEquality: BoolExpr = {
    kind: "Equal",
    sort: "String",
    left: failureTagVariable,
    right: lowered.tag,
  };

  const successTag: BoolExpr = {
    kind: "Equal",
    sort: "String",
    left: tagVariable,
    right: { kind: "StringLiteral", value: "Success" },
  };

  const payloadEquality: BoolExpr =
    signature.resultSort === "Int"
      ? {
          kind: "Equal",
          sort: "Int",
          left: { kind: "Variable", id: proof.resultVariableId, sort: "Int" },
          right: requireInt(loadedSource.sourceFile, body, lowered.payload).expression,
        }
      : {
          kind: "Equal",
          sort: "Bool",
          left: { kind: "Variable", id: proof.resultVariableId, sort: "Bool" },
          right: requireBool(loadedSource.sourceFile, body, lowered.payload).expression,
        };

  const activePayload: BoolExpr = {
    kind: "Or",
    operands: [{ kind: "Not", operand: successTag }, payloadEquality],
  };

  const allowedTags: BoolExpr = {
    kind: "Or",
    operands: ["Success", "Failure"].map((value) => ({
      kind: "Equal",
      sort: "String" as const,
      left: tagVariable,
      right: { kind: "StringLiteral" as const, value },
    })),
  };

  const allowedFailureTag: BoolExpr =
    signature.errorTags.length === 0
      ? { kind: "BoolLiteral", value: false }
      : {
          kind: "Or",
          operands: signature.errorTags.map((value) => ({
            kind: "Equal",
            sort: "String" as const,
            left: failureTagVariable,
            right: { kind: "StringLiteral" as const, value },
          })),
        };

  const allowedFailureTags: BoolExpr = {
    kind: "Or",
    operands: [successTag, allowedFailureTag],
  };

  const variableNames = new Map(
    proof.program.variables.map((variable) => [
      variable.id,
      signature.parameterNames.get(variable.id) ?? variable.name,
    ]),
  );

  const variables = proof.program.variables.map((variable) => {
    const parameterName = signature.parameterNames.get(variable.id);

    if (parameterName !== undefined) return { ...variable, name: parameterName };

    if (variable.id !== proof.resultVariableId || signature.resultSort === "Bool") return variable;
    const payload = lowered.payload;

    if (payload.sort !== "Int") throw new SourceCompileError("success payload sort mismatch");

    return {
      ...variable,
      domain: `SafeInt[${payload.minimum}, ${payload.maximum}]`,
      minimum: Number(payload.minimum),
      maximum: Number(payload.maximum),
    };
  });

  const assertions = proof.program.assertions.map((assertion) => ({
    ...assertion,
    label:
      proof.assertionLabel?.trim() ||
      formatExpr(assertion.expression, (id) => variableNames.get(id) ?? `v${id}`),
  }));

  return Object.freeze({
    ...proof.program,
    variables: Object.freeze(variables),
    assumptions: Object.freeze([
      ...proof.program.assumptions,
      tagEquality,
      failureTagEquality,
      allowedTags,
      allowedFailureTags,
      activePayload,
    ]),
    assertions: Object.freeze(assertions),
  });
};
