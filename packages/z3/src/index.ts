import { Effect } from "effect";
import { init, killThreads } from "z3-solver";
import type { Arith, Bool, Context, Model, Solver, init as initType } from "z3-solver";
import { formatExpr } from "@effect-verifier/core";
import { VerificationBackendError } from "@effect-verifier/core";
import type {
  AssertionOutcome,
  BoolExpr,
  Counterexample,
  FailedAssertion,
  IntExpr,
  StringExpr,
  Variable,
  VerificationBackend,
  VerificationProgram,
  VerificationResult,
  VerifiedAssertion,
} from "@effect-verifier/core";

export interface Z3Backend extends VerificationBackend {
  readonly close: () => Effect.Effect<void, VerificationBackendError>;
}

type Z3Api = Awaited<ReturnType<typeof initType>>;

type Z3Value<Name extends string> =
  | { readonly sort: "Bool"; readonly term: Bool<Name> }
  | { readonly sort: "Int"; readonly term: Arith<Name> }
  | { readonly sort: "String"; readonly term: ReturnType<Context<Name>["String"]["const"]> };

type LogicalExpr = Extract<BoolExpr, { readonly kind: "And" | "Or" }>;

type EqualityExpr = Extract<BoolExpr, { readonly kind: "Equal" | "NotEqual" }>;

type ComparisonNode = Extract<BoolExpr, { readonly kind: "Lt" | "Lte" | "Gt" | "Gte" }>;

type ArithmeticNode = Extract<IntExpr, { readonly kind: "Add" | "Sub" | "Mul" | "Div" | "Mod" }>;

const isFailedAssertion = (outcome: AssertionOutcome): outcome is FailedAssertion =>
  outcome.kind === "AssertionFailed";

const isVerifiedAssertion = (outcome: AssertionOutcome): outcome is VerifiedAssertion =>
  outcome.kind === "AssertionVerified";

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const collectIntDivisors = (expression: IntExpr, output: Array<IntExpr>): void => {
  switch (expression.kind) {
    case "IntLiteral":
    case "Variable":
      return;
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
    case "Mod":
      collectIntDivisors(expression.left, output);
      collectIntDivisors(expression.right, output);

      if (expression.kind === "Div" || expression.kind === "Mod") output.push(expression.right);

      return;
    case "If":
      collectBoolDivisors(expression.condition, output);
      collectIntDivisors(expression.whenTrue, output);
      collectIntDivisors(expression.whenFalse, output);

      return;
  }
};

const collectBoolDivisors = (expression: BoolExpr, output: Array<IntExpr>): void => {
  switch (expression.kind) {
    case "BoolLiteral":
    case "Variable":
      return;
    case "Not":
      collectBoolDivisors(expression.operand, output);

      return;
    case "And":
    case "Or":
      for (const operand of expression.operands) collectBoolDivisors(operand, output);

      return;
    case "Equal":
    case "NotEqual":
      if (expression.sort === "Bool") {
        collectBoolDivisors(expression.left, output);
        collectBoolDivisors(expression.right, output);
      } else if (expression.sort === "Int") {
        collectIntDivisors(expression.left, output);
        collectIntDivisors(expression.right, output);
      }

      return;
    case "Lt":
    case "Lte":
    case "Gt":
    case "Gte":
      collectIntDivisors(expression.left, output);
      collectIntDivisors(expression.right, output);

      return;
    case "If":
      collectBoolDivisors(expression.condition, output);
      collectBoolDivisors(expression.whenTrue, output);
      collectBoolDivisors(expression.whenFalse, output);

      return;
  }
};

const isStringModelValue = (value: unknown): value is { asString: () => string } =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validate untrusted Z3 model values.
  typeof value === "object" &&
  value !== null &&
  "asString" in value &&
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- validate the model API method.
  typeof value.asString === "function";

const decodeInteger = (value: string): string => {
  if (/^\d+$/.test(value)) return value;
  const negative = /^\(- (\d+)\)$/.exec(value);

  if (negative?.[1] !== undefined) return `-${negative[1]}`;
  throw new Error(`Z3 returned a non-integer model value: ${value}`);
};

const assertNever = (value: never): never => {
  throw new Error(`Unsupported symbolic expression: ${String(value)}`);
};

class Z3BackendImpl implements Z3Backend {
  private closed = false;
  private tail: Promise<void> = Promise.resolve();
  private readonly context: Context<"effect-verify">;

  constructor(private readonly api: Z3Api) {
    this.context = new this.api.Context("effect-verify");
  }

  readonly verify: VerificationBackend["verify"] = (program) => {
    if (this.closed) {
      return Effect.fail(new VerificationBackendError({ message: "Z3 backend is already closed" }));
    }

    return Effect.tryPromise({
      try: () => this.runExclusive(program),
      catch: (cause) => new VerificationBackendError({ message: errorMessage(cause) }),
    });
  };

  readonly close = (): Effect.Effect<void, VerificationBackendError> => {
    if (this.closed) return Effect.void;
    this.closed = true;

    return Effect.tryPromise({
      try: async () => {
        await this.tail;
        await killThreads(this.api.em);
      },
      catch: (cause) => new VerificationBackendError({ message: errorMessage(cause) }),
    });
  };

  private runExclusive(program: VerificationProgram): Promise<VerificationResult> {
    if (this.closed) return Promise.reject(new Error("Z3 backend is already closed"));
    const result = this.tail.then(() => this.solve(program));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async solve(program: VerificationProgram): Promise<VerificationResult> {
    if (program.assertions.length === 0) throw new Error("Proof contains no assertions");
    const context = this.context;
    const solver = new context.Solver();
    const values = this.registerVariables(program, context, solver);

    const variableNames = new Map(
      program.variables.map((variable) => [variable.id, variable.name]),
    );

    await this.checkAssumptions(program, context, solver, values);

    const outcomes: Array<AssertionOutcome> = [];

    for (const assertion of program.assertions) {
      outcomes.push(
        await this.checkAssertion(program, assertion, context, solver, values, variableNames),
      );
    }

    const failed = outcomes.filter(isFailedAssertion);

    if (failed.length > 0) {
      const failures: Array<Counterexample> = [];

      for (const outcome of failed) failures.push(outcome.counterexample);

      return Object.freeze({
        kind: "Failed",
        proof: program.proof,
        assertions: Object.freeze(outcomes),
        failures: Object.freeze(failures),
      });
    }

    return Object.freeze({
      kind: "Verified",
      proof: program.proof,
      assertions: Object.freeze(outcomes.filter(isVerifiedAssertion)),
    });
  }

  private registerVariables<Name extends string>(
    program: VerificationProgram,
    context: Context<Name>,
    solver: Solver<Name>,
  ): Map<number, Z3Value<Name>> {
    const values = new Map<number, Z3Value<Name>>();

    for (const variable of program.variables) {
      if (values.has(variable.id)) {
        throw new Error(`Duplicate symbolic variable id: ${variable.id}`);
      }

      this.registerVariable(variable, context, solver, values);
    }

    return values;
  }

  private registerVariable<Name extends string>(
    variable: Variable,
    context: Context<Name>,
    solver: Solver<Name>,
    values: Map<number, Z3Value<Name>>,
  ): void {
    switch (variable.sort) {
      case "String":
        if (variable.minimum !== null || variable.maximum !== null)
          throw new Error(`String input ${variable.name} cannot have integer bounds`);
        values.set(variable.id, { sort: "String", term: context.String.const(`v${variable.id}`) });

        return;
      case "Bool":
        if (variable.minimum !== null || variable.maximum !== null) {
          throw new Error(`Boolean input ${variable.name} cannot have integer bounds`);
        }

        values.set(variable.id, { sort: "Bool", term: context.Bool.const(`v${variable.id}`) });

        return;
      case "Int":
        break;
      default:
        throw new Error(`Unsupported symbolic variable sort: ${String(variable.sort)}`);
    }

    this.validateIntegerBounds(variable);
    const term = context.Int.const(`v${variable.id}`);
    values.set(variable.id, { sort: "Int", term });

    if (variable.minimum !== null) solver.add(term.ge(variable.minimum));

    if (variable.maximum !== null) solver.add(term.le(variable.maximum));
  }

  private validateIntegerBounds(variable: Variable): void {
    if (variable.minimum !== null && !Number.isSafeInteger(variable.minimum)) {
      throw new Error(`Invalid lower bound for ${variable.name}`);
    }

    if (variable.maximum !== null && !Number.isSafeInteger(variable.maximum)) {
      throw new Error(`Invalid upper bound for ${variable.name}`);
    }

    if (
      variable.minimum !== null &&
      variable.maximum !== null &&
      variable.minimum > variable.maximum
    ) {
      throw new Error(`Inconsistent bounds for ${variable.name}`);
    }
  }

  private async checkAssumptions<Name extends string>(
    program: VerificationProgram,
    context: Context<Name>,
    solver: Solver<Name>,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Promise<void> {
    const divisors: Array<IntExpr> = [];

    for (const assumption of program.assumptions) {
      collectBoolDivisors(assumption, divisors);
    }

    if (divisors.length > 0) {
      throw new Error("Division and modulo expressions in assumptions are not supported");
    }

    for (const assumption of program.assumptions) {
      solver.add(this.compileBool(context, assumption, values));
    }

    const status = await solver.check();

    switch (status) {
      case "sat":
        return;
      case "unsat":
        throw new Error(
          "Proof assumptions are inconsistent; no meaningful proof can be established",
        );
      case "unknown":
        throw new Error(
          `Z3 could not determine whether proof assumptions are satisfiable: ${solver.reasonUnknown()}`,
        );
      default:
        return assertNever(status);
    }
  }

  private async checkAssertionDivisors<Name extends string>(
    assertion: VerificationProgram["assertions"][number],
    context: Context<Name>,
    solver: Solver<Name>,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Promise<void> {
    const divisors: Array<IntExpr> = [];
    collectBoolDivisors(assertion.expression, divisors);

    if (divisors.length === 0) return;

    solver.push();

    try {
      const zeroDivisors = [...new Set(divisors)].map((divisor) =>
        this.compileInt(context, divisor, values).eq(0),
      );

      solver.add(context.Or(...zeroDivisors));
      const status = await solver.check();

      switch (status) {
        case "unsat":
          return;
        case "sat":
          throw new Error(
            `Division or modulo in assertion "${assertion.label}" may use a zero divisor`,
          );
        case "unknown":
          throw new Error(
            `Z3 could not establish a non-zero divisor in assertion "${assertion.label}"`,
          );
        default:
          assertNever(status);
      }
    } finally {
      solver.pop();
    }
  }

  private async checkAssertion<Name extends string>(
    program: VerificationProgram,
    assertion: VerificationProgram["assertions"][number],
    context: Context<Name>,
    solver: Solver<Name>,
    values: ReadonlyMap<number, Z3Value<Name>>,
    variableNames: ReadonlyMap<number, string>,
  ): Promise<AssertionOutcome> {
    await this.checkAssertionDivisors(assertion, context, solver, values);
    solver.push();

    try {
      solver.add(context.Not(this.compileBool(context, assertion.expression, values)));
      const status = await solver.check();

      switch (status) {
        case "unsat":
          return Object.freeze({
            kind: "AssertionVerified",
            label: assertion.label,
            expression: this.format(variableNames, assertion.expression),
          });
        case "unknown":
          throw new Error(
            `Z3 returned unknown for assertion "${assertion.label}": ${solver.reasonUnknown()}`,
          );
        case "sat": {
          const counterexample = this.decodeCounterexample(
            program,
            assertion.label,
            assertion.expression,
            solver.model(),
            values,
            variableNames,
          );

          return Object.freeze({
            kind: "AssertionFailed",
            label: assertion.label,
            expression: counterexample.expression,
            counterexample,
          });
        }

        default:
          return assertNever(status);
      }
    } finally {
      solver.pop();
    }
  }

  private format(variableNames: ReadonlyMap<number, string>, expression: BoolExpr): string {
    return formatExpr(expression, (id) => variableNames.get(id) ?? `v${id}`);
  }

  private compileBool<Name extends string>(
    context: Context<Name>,
    expression: BoolExpr,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Bool<Name> {
    switch (expression.kind) {
      case "BoolLiteral":
        return context.Bool.val(expression.value);
      case "Variable": {
        const value = values.get(expression.id);

        if (value === undefined || value.sort !== "Bool") {
          throw new Error(`Unknown or non-boolean symbolic variable id: ${expression.id}`);
        }

        return value.term;
      }

      case "Not":
        return context.Not(this.compileBool(context, expression.operand, values));
      case "And":
      case "Or":
        return this.compileLogical(context, expression, values);
      case "Equal":
      case "NotEqual":
        return this.compileEquality(context, expression, values);
      case "Lt":
      case "Lte":
      case "Gt":
      case "Gte":
        return this.compileComparison(context, expression, values);
      case "If":
        return context.If(
          this.compileBool(context, expression.condition, values),
          this.compileBool(context, expression.whenTrue, values),
          this.compileBool(context, expression.whenFalse, values),
        );
      default:
        return assertNever(expression);
    }
  }

  private compileLogical<Name extends string>(
    context: Context<Name>,
    expression: LogicalExpr,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Bool<Name> {
    const operands = expression.operands.map((item) => this.compileBool(context, item, values));

    return expression.kind === "And" ? context.And(...operands) : context.Or(...operands);
  }

  private compileEquality<Name extends string>(
    context: Context<Name>,
    expression: EqualityExpr,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Bool<Name> {
    if (expression.sort === "Bool") {
      const left = this.compileBool(context, expression.left, values);
      const right = this.compileBool(context, expression.right, values);

      return expression.kind === "Equal" ? left.eq(right) : left.neq(right);
    }

    if (expression.sort === "String") {
      const left = this.compileString(context, expression.left, values);
      const right = this.compileString(context, expression.right, values);

      return expression.kind === "Equal" ? left.eq(right) : left.neq(right);
    }

    const left = this.compileInt(context, expression.left, values);
    const right = this.compileInt(context, expression.right, values);

    return expression.kind === "Equal" ? left.eq(right) : left.neq(right);
  }

  private compileComparison<Name extends string>(
    context: Context<Name>,
    expression: ComparisonNode,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Bool<Name> {
    const left = this.compileInt(context, expression.left, values);
    const right = this.compileInt(context, expression.right, values);

    switch (expression.kind) {
      case "Lt":
        return left.lt(right);
      case "Lte":
        return left.le(right);
      case "Gt":
        return left.gt(right);
      case "Gte":
        return left.ge(right);
      default:
        throw new Error(`Unsupported comparison operation: ${expression.kind}`);
    }
  }

  private compileInt<Name extends string>(
    context: Context<Name>,
    expression: IntExpr,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Arith<Name> {
    switch (expression.kind) {
      case "IntLiteral":
        return context.Int.val(expression.value);
      case "Variable": {
        const value = values.get(expression.id);

        if (value === undefined || value.sort !== "Int") {
          throw new Error(`Unknown or non-integer symbolic variable id: ${expression.id}`);
        }

        return value.term;
      }

      case "Add":
      case "Sub":
      case "Mul":
      case "Div":
      case "Mod":
        return this.compileArithmetic(context, expression, values);
      case "If":
        return context.If(
          this.compileBool(context, expression.condition, values),
          this.compileInt(context, expression.whenTrue, values),
          this.compileInt(context, expression.whenFalse, values),
        );
      default:
        return assertNever(expression);
    }
  }

  private compileString<Name extends string>(
    context: Context<Name>,
    expression: StringExpr,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): ReturnType<Context<Name>["String"]["const"]> {
    switch (expression.kind) {
      case "StringLiteral":
        return context.String.val(expression.value);
      case "Variable": {
        const value = values.get(expression.id);

        if (value === undefined || value.sort !== "String")
          throw new Error(`Unknown or non-string symbolic variable id: ${expression.id}`);

        return value.term;
      }

      case "If":
        return context.If(
          this.compileBool(context, expression.condition, values),
          this.compileString(context, expression.whenTrue, values),
          this.compileString(context, expression.whenFalse, values),
        );
      default:
        return assertNever(expression);
    }
  }

  private compileArithmetic<Name extends string>(
    context: Context<Name>,
    expression: ArithmeticNode,
    values: ReadonlyMap<number, Z3Value<Name>>,
  ): Arith<Name> {
    const left = this.compileInt(context, expression.left, values);
    const right = this.compileInt(context, expression.right, values);

    switch (expression.kind) {
      case "Add":
        return left.add(right);
      case "Sub":
        return left.sub(right);
      case "Mul":
        return left.mul(right);
      case "Div":
        return left.div(right);
      case "Mod":
        return left.mod(right);
      default:
        throw new Error(`Unsupported arithmetic operation: ${expression.kind}`);
    }
  }

  private decodeCounterexample<Name extends string>(
    program: VerificationProgram,
    label: string,
    expression: BoolExpr,
    model: Model<Name>,
    values: ReadonlyMap<number, Z3Value<Name>>,
    variableNames: ReadonlyMap<number, string>,
  ): Counterexample {
    const inputs = program.variables.map((variable) => {
      const value = values.get(variable.id);

      if (value === undefined) throw new Error(`Missing model value for ${variable.name}`);

      let decoded: string;

      switch (value.sort) {
        case "Bool":
          decoded = model.eval(value.term, true).toString();
          break;
        case "String": {
          const modelValue = model.eval(value.term, true);

          if (!isStringModelValue(modelValue))
            throw new Error(`Z3 returned a non-string model value for ${variable.name}`);

          decoded = modelValue.asString();

          break;
        }

        case "Int":
          decoded = decodeInteger(model.eval(value.term, true).toString());
          break;
      }

      return Object.freeze({ name: variable.name, value: decoded, domain: variable.domain });
    });

    return Object.freeze({
      assertion: label,
      expression: formatExpr(expression, (id) => variableNames.get(id) ?? `v${id}`),
      inputs: Object.freeze(inputs),
    });
  }
}

export const makeZ3Backend = (): Effect.Effect<Z3Backend, VerificationBackendError> =>
  Effect.map(
    Effect.tryPromise({
      try: () => init(),
      catch: (cause) => new VerificationBackendError({ message: errorMessage(cause) }),
    }),
    (api) => new Z3BackendImpl(api),
  );
