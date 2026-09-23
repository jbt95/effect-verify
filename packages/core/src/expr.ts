export type Sort = "Bool" | "Int" | "String";

export interface BoolLiteralExpr {
  readonly kind: "BoolLiteral";
  readonly value: boolean;
}

export interface IntLiteralExpr {
  readonly kind: "IntLiteral";
  readonly value: string;
}

export interface StringLiteralExpr {
  readonly kind: "StringLiteral";
  readonly value: string;
}

export interface BoolVariableExpr {
  readonly kind: "Variable";
  readonly id: number;
  readonly sort: "Bool";
}

export interface IntVariableExpr {
  readonly kind: "Variable";
  readonly id: number;
  readonly sort: "Int";
}

export interface StringVariableExpr {
  readonly kind: "Variable";
  readonly id: number;
  readonly sort: "String";
}

export interface NotExpr {
  readonly kind: "Not";
  readonly operand: BoolExpr;
}

export interface AndExpr {
  readonly kind: "And";
  readonly operands: ReadonlyArray<BoolExpr>;
}

export interface OrExpr {
  readonly kind: "Or";
  readonly operands: ReadonlyArray<BoolExpr>;
}

export interface EqualIntExpr {
  readonly kind: "Equal";
  readonly sort: "Int";
  readonly left: IntExpr;
  readonly right: IntExpr;
}

export interface EqualBoolExpr {
  readonly kind: "Equal";
  readonly sort: "Bool";
  readonly left: BoolExpr;
  readonly right: BoolExpr;
}

export interface EqualStringExpr {
  readonly kind: "Equal";
  readonly sort: "String";
  readonly left: StringExpr;
  readonly right: StringExpr;
}

export interface NotEqualIntExpr {
  readonly kind: "NotEqual";
  readonly sort: "Int";
  readonly left: IntExpr;
  readonly right: IntExpr;
}

export interface NotEqualBoolExpr {
  readonly kind: "NotEqual";
  readonly sort: "Bool";
  readonly left: BoolExpr;
  readonly right: BoolExpr;
}

export interface NotEqualStringExpr {
  readonly kind: "NotEqual";
  readonly sort: "String";
  readonly left: StringExpr;
  readonly right: StringExpr;
}

export interface ArithmeticExpr {
  readonly kind: "Add" | "Sub" | "Mul" | "Div" | "Mod";
  readonly left: IntExpr;
  readonly right: IntExpr;
}

export interface ComparisonExpr {
  readonly kind: "Lt" | "Lte" | "Gt" | "Gte";
  readonly left: IntExpr;
  readonly right: IntExpr;
}

export interface IfIntExpr {
  readonly kind: "If";
  readonly sort: "Int";
  readonly condition: BoolExpr;
  readonly whenTrue: IntExpr;
  readonly whenFalse: IntExpr;
}

export interface IfBoolExpr {
  readonly kind: "If";
  readonly sort: "Bool";
  readonly condition: BoolExpr;
  readonly whenTrue: BoolExpr;
  readonly whenFalse: BoolExpr;
}

export interface IfStringExpr {
  readonly kind: "If";
  readonly sort: "String";
  readonly condition: BoolExpr;
  readonly whenTrue: StringExpr;
  readonly whenFalse: StringExpr;
}

export type IntExpr = IntLiteralExpr | IntVariableExpr | ArithmeticExpr | IfIntExpr;

export type StringExpr = StringLiteralExpr | StringVariableExpr | IfStringExpr;

export type BoolExpr =
  | BoolLiteralExpr
  | BoolVariableExpr
  | NotExpr
  | AndExpr
  | OrExpr
  | EqualIntExpr
  | EqualBoolExpr
  | EqualStringExpr
  | NotEqualIntExpr
  | NotEqualBoolExpr
  | NotEqualStringExpr
  | ComparisonExpr
  | IfBoolExpr;

export type Expr = IntExpr | BoolExpr | StringExpr;

const assertNever = (value: never): never => {
  throw new Error(`Unsupported expression node: ${String(value)}`);
};

export const formatExpr = (
  expression: Expr,
  variableName: (id: number) => string = (id) => `v${id}`,
): string => {
  switch (expression.kind) {
    case "BoolLiteral":
      return String(expression.value);
    case "IntLiteral":
      return expression.value;
    case "StringLiteral":
      return JSON.stringify(expression.value);
    case "Variable":
      return variableName(expression.id);
    case "Not":
      return `!(${formatExpr(expression.operand, variableName)})`;
    case "And":
      return `(${expression.operands.map((item) => formatExpr(item, variableName)).join(" && ")})`;
    case "Or":
      return `(${expression.operands.map((item) => formatExpr(item, variableName)).join(" || ")})`;
    case "Equal":
      return `(${formatExpr(expression.left, variableName)} == ${formatExpr(expression.right, variableName)})`;
    case "NotEqual":
      return `(${formatExpr(expression.left, variableName)} != ${formatExpr(expression.right, variableName)})`;
    case "Add":
      return `(${formatExpr(expression.left, variableName)} + ${formatExpr(expression.right, variableName)})`;
    case "Sub":
      return `(${formatExpr(expression.left, variableName)} - ${formatExpr(expression.right, variableName)})`;
    case "Mul":
      return `(${formatExpr(expression.left, variableName)} * ${formatExpr(expression.right, variableName)})`;
    case "Div":
      return `(${formatExpr(expression.left, variableName)} / ${formatExpr(expression.right, variableName)})`;
    case "Mod":
      return `(${formatExpr(expression.left, variableName)} % ${formatExpr(expression.right, variableName)})`;
    case "Lt":
      return `(${formatExpr(expression.left, variableName)} < ${formatExpr(expression.right, variableName)})`;
    case "Lte":
      return `(${formatExpr(expression.left, variableName)} <= ${formatExpr(expression.right, variableName)})`;
    case "Gt":
      return `(${formatExpr(expression.left, variableName)} > ${formatExpr(expression.right, variableName)})`;
    case "Gte":
      return `(${formatExpr(expression.left, variableName)} >= ${formatExpr(expression.right, variableName)})`;
    case "If":
      return `(if ${formatExpr(expression.condition, variableName)} then ${formatExpr(expression.whenTrue, variableName)} else ${formatExpr(expression.whenFalse, variableName)})`;
    default:
      return assertNever(expression);
  }
};
