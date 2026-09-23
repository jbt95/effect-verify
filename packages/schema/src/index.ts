import { Data, Effect, Option, Schema } from "effect";
import * as SchemaAST from "effect/SchemaAST";
import type { Domain, IntegerOptions } from "@effect-verifier/core";
import { Sym, Verify } from "@effect-verifier/core";
import type { BoolSym, IntSym, StringSym } from "@effect-verifier/core";

export class UnsupportedSchemaError extends Data.TaggedError("UnsupportedSchemaError")<{
  readonly message: string;
}> {}

export type SymbolicValue<A> = A extends boolean
  ? BoolSym
  : A extends number
    ? IntSym
    : A extends string
      ? StringSym
      : A extends ReadonlyArray<infer _Item>
        ? { readonly [Index in keyof A]: SymbolicValue<A[Index]> }
        : A extends object
          ? { readonly [Key in keyof A]: SymbolicValue<A[Key]> }
          : never;

type BuilderRequirements =
  ReturnType<typeof Verify.any> extends Effect.Effect<
    infer _Value,
    infer _Error,
    infer Requirements
  >
    ? Requirements
    : never;

type Plan =
  | { readonly kind: "boolean" }
  | { readonly kind: "integer"; readonly domain: Domain<number> }
  | { readonly kind: "literal"; readonly value: number | boolean | string }
  | { readonly kind: "numericChoice"; readonly values: ReadonlyArray<number> }
  | { readonly kind: "booleanChoice"; readonly values: ReadonlyArray<boolean> }
  | { readonly kind: "stringChoice"; readonly values: ReadonlyArray<string> }
  | { readonly kind: "record"; readonly fields: ReadonlyArray<RecordField> }
  | { readonly kind: "tuple"; readonly elements: ReadonlyArray<Plan> };

interface RecordField {
  readonly key: PropertyKey;
  readonly name: string;
  readonly plan: Plan;
}

interface PlanRecord {
  readonly [key: PropertyKey]: PlanValue;
}

type PlanValue = BoolSym | IntSym | StringSym | ReadonlyArray<PlanValue> | PlanRecord;

interface NumericLimits {
  readonly isInteger: boolean;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

const IntegerSchemaId = Symbol.for("effect/SchemaId/Int");

const GreaterThanOrEqualToSchemaId = Symbol.for("effect/SchemaId/GreaterThanOrEqualTo");

const LessThanOrEqualToSchemaId = Symbol.for("effect/SchemaId/LessThanOrEqualTo");

const GreaterThanSchemaId = Symbol.for("effect/SchemaId/GreaterThan");

const LessThanSchemaId = Symbol.for("effect/SchemaId/LessThan");

const unsupported = (ast: SchemaAST.AST, reason: string): never => {
  throw new UnsupportedSchemaError({
    message: `Unsupported Effect Schema node ${ast._tag}: ${reason}`,
  });
};

const readNumberAnnotation = (ast: SchemaAST.Refinement, key: string): number => {
  const annotation = SchemaAST.getJSONSchemaAnnotation(ast);

  if (Option.isNone(annotation))
    return unsupported(ast, `missing numeric ${key} refinement metadata`);
  const descriptor = Object.getOwnPropertyDescriptor(annotation.value, key);

  if (descriptor === undefined || !Number.isSafeInteger(descriptor.value)) {
    return unsupported(ast, `numeric ${key} refinement must use a safe integer`);
  }

  return Number(descriptor.value);
};

const applyMinimum = (current: number | null, next: number): number =>
  current === null ? next : Math.max(current, next);

const applyMaximum = (current: number | null, next: number): number =>
  current === null ? next : Math.min(current, next);

const refinementLimits = (ast: SchemaAST.Refinement, base: NumericLimits): NumericLimits => {
  const id = ast.annotations[SchemaAST.SchemaIdAnnotationId];

  if (id === IntegerSchemaId) return { ...base, isInteger: true };

  if (id === GreaterThanOrEqualToSchemaId) {
    return {
      ...base,
      minimum: applyMinimum(base.minimum, readNumberAnnotation(ast, "minimum")),
    };
  }

  if (id === LessThanOrEqualToSchemaId)
    return { ...base, maximum: applyMaximum(base.maximum, readNumberAnnotation(ast, "maximum")) };

  if (id === GreaterThanSchemaId || id === LessThanSchemaId) {
    const key = id === GreaterThanSchemaId ? "exclusiveMinimum" : "exclusiveMaximum";
    const bound = readNumberAnnotation(ast, key);
    const adjusted = bound + (id === GreaterThanSchemaId ? 1 : -1);

    if (!Number.isSafeInteger(adjusted))
      return unsupported(ast, `exclusive ${key} overflows safe integer bounds`);

    return id === GreaterThanSchemaId
      ? { ...base, minimum: applyMinimum(base.minimum, adjusted) }
      : { ...base, maximum: applyMaximum(base.maximum, adjusted) };
  }

  return unsupported(
    ast,
    "only Schema.int, greaterThan, lessThan, greaterThanOrEqualTo, and lessThanOrEqualTo are modeled",
  );
};

const numericLimits = (ast: SchemaAST.AST): NumericLimits => {
  if (SchemaAST.isNumberKeyword(ast)) {
    return { isInteger: false, minimum: null, maximum: null };
  }

  if (!SchemaAST.isRefinement(ast)) return unsupported(ast, "expected an integer schema");

  return refinementLimits(ast, numericLimits(ast.from));
};

const integerPlan = (ast: SchemaAST.AST): Plan => {
  const limits = numericLimits(ast);

  if (!limits.isInteger)
    return unsupported(ast, "Schema.Number is floating-point and is not modeled; use Schema.Int");
  const minimum = limits.minimum === null ? {} : { min: limits.minimum };

  if (limits.minimum !== null && limits.maximum !== null && limits.minimum > limits.maximum)
    return unsupported(ast, "integer refinements have an empty range");

  const options: IntegerOptions =
    limits.maximum === null ? minimum : { ...minimum, max: limits.maximum };

  return { kind: "integer", domain: Verify.integer(options) };
};

const isBooleanLiteral = (value: SchemaAST.LiteralValue): value is boolean =>
  value === true || value === false;

const isIntegerLiteral = (value: SchemaAST.LiteralValue): value is number =>
  Number.isSafeInteger(value);

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- Effect LiteralValue is a primitive union.
const isStringLiteral = (value: SchemaAST.LiteralValue): value is string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Effect LiteralValue is a primitive union.
  typeof value === "string";

const literalValue = (ast: SchemaAST.Literal): number | boolean | string => {
  if (isBooleanLiteral(ast.literal) || isStringLiteral(ast.literal)) return ast.literal;

  if (isIntegerLiteral(ast.literal)) return ast.literal;

  return unsupported(ast, "only boolean, string, and safe-integer literals are modeled");
};

const booleanUnionPlan = (values: ReadonlyArray<boolean>): Plan => {
  const unique = [...new Set(values)];
  const first = unique[0];

  if (unique.length === 1 && first !== undefined) return { kind: "literal", value: first };

  return { kind: "booleanChoice", values: unique };
};

const stringUnionPlan = (values: ReadonlyArray<string>): Plan => {
  const unique = [...new Set(values)];
  const first = unique[0];

  if (unique.length === 1 && first !== undefined) return { kind: "literal", value: first };

  return { kind: "stringChoice", values: unique };
};

const integerUnionPlan = (values: ReadonlyArray<number>): Plan => {
  const unique = [...new Set(values)];
  const first = unique[0];

  if (unique.length === 1 && first !== undefined) return { kind: "literal", value: first };

  return { kind: "numericChoice", values: unique };
};

const unionPlan = (ast: SchemaAST.AST): Plan | undefined => {
  if (!SchemaAST.isUnion(ast)) return undefined;

  if (ast.types.length === 0) return unsupported(ast, "literal unions must be nonempty");

  const literals = ast.types.map((member) => {
    if (!SchemaAST.isLiteral(member)) {
      return unsupported(member, "only unions of boolean, integer, or string literals are modeled");
    }

    return literalValue(member);
  });

  const booleans = literals.filter(isBooleanLiteral);

  if (booleans.length === literals.length) return booleanUnionPlan(booleans);

  const integers = literals.filter(isIntegerLiteral);

  if (integers.length === literals.length) return integerUnionPlan(integers);
  const strings = literals.filter((value): value is string => isStringLiteral(value));

  if (strings.length === literals.length) return stringUnionPlan(strings);

  return unsupported(
    ast,
    "union alternatives must all have the same boolean, integer, or string sort",
  );
};

const booleanPlan = (ast: SchemaAST.AST): Plan | undefined =>
  SchemaAST.isBooleanKeyword(ast) ? { kind: "boolean" } : undefined;

const integerNodePlan = (ast: SchemaAST.AST): Plan | undefined =>
  SchemaAST.isNumberKeyword(ast) || SchemaAST.isRefinement(ast) ? integerPlan(ast) : undefined;

const literalPlan = (ast: SchemaAST.AST): Plan | undefined =>
  SchemaAST.isLiteral(ast) ? { kind: "literal", value: literalValue(ast) } : undefined;

const recordPlan = (ast: SchemaAST.AST): Plan | undefined => {
  if (!SchemaAST.isTypeLiteral(ast)) return undefined;

  if (ast.indexSignatures.length > 0) return unsupported(ast, "index signatures are not modeled");

  const fields = ast.propertySignatures.map((field) => {
    if (field.isOptional)
      return unsupported(ast, `optional field ${String(field.name)} is not modeled`);

    return {
      key: field.name,
      name: String(field.name),
      plan: planFromAst(field.type),
    };
  });

  return { kind: "record", fields };
};

const tuplePlan = (ast: SchemaAST.AST): Plan | undefined => {
  if (!SchemaAST.isTupleType(ast)) return undefined;

  if (ast.rest.length > 0) return unsupported(ast, "tuple rest elements are not modeled");

  if (ast.elements.some((element) => element.isOptional)) {
    return unsupported(ast, "optional tuple elements are not modeled");
  }

  return { kind: "tuple", elements: ast.elements.map((element) => planFromAst(element.type)) };
};

function planFromAst(ast: SchemaAST.AST): Plan {
  const plan =
    booleanPlan(ast) ??
    integerNodePlan(ast) ??
    literalPlan(ast) ??
    recordPlan(ast) ??
    tuplePlan(ast) ??
    unionPlan(ast);

  return plan ?? unsupported(ast, "this AST construct is outside the supported subset");
}

const effectForPlan = (
  plan: Plan,
  name: string,
): Effect.Effect<PlanValue, UnsupportedSchemaError, BuilderRequirements> => {
  switch (plan.kind) {
    case "boolean":
      return Verify.any(Verify.boolean(), { name });
    case "integer":
      return Verify.any(plan.domain, { name });
    case "literal":
      if (isStringLiteral(plan.value)) return Effect.succeed(Sym.literal(plan.value));

      if (isBooleanLiteral(plan.value)) return Effect.succeed(Sym.literal(plan.value));

      return Effect.succeed(Sym.literal(plan.value));
    case "numericChoice":
      return Effect.gen(function* () {
        let minimum = plan.values[0] ?? 0;
        let maximum = minimum;

        for (const value of plan.values) {
          minimum = Math.min(minimum, value);
          maximum = Math.max(maximum, value);
        }

        const symbolic = yield* Verify.any(Verify.integer({ min: minimum, max: maximum }), {
          name,
        });

        const allowed = plan.values.map((value) => Sym.eq(symbolic, Sym.literal(value)));
        yield* Verify.assume(Sym.or(...allowed));

        return symbolic;
      });
    case "stringChoice":
      return Effect.gen(function* () {
        const symbolic = yield* Verify.anyString({ name });
        yield* Verify.assume(
          Sym.or(...plan.values.map((value) => Sym.eq(symbolic, Sym.literal(value)))),
        );

        return symbolic;
      });
    case "booleanChoice":
      return Effect.gen(function* () {
        const symbolic = yield* Verify.any(Verify.boolean(), { name });
        const allowed = plan.values.map((value) => Sym.eq(symbolic, Sym.literal(value)));
        yield* Verify.assume(Sym.or(...allowed));

        return symbolic;
      });
    case "record":
      return Effect.gen(function* () {
        const result: { [key: PropertyKey]: PlanValue } = {};

        for (const field of plan.fields) {
          const value = yield* effectForPlan(field.plan, `${name}.${field.name}`);
          Object.defineProperty(result, field.key, {
            configurable: false,
            enumerable: true,
            value,
            writable: false,
          });
        }

        return Object.freeze(result);
      });
    case "tuple":
      return Effect.gen(function* () {
        const result: Array<PlanValue> = [];

        for (const [index, element] of plan.elements.entries()) {
          result.push(yield* effectForPlan(element, `${name}[${index}]`));
        }

        return Object.freeze(result);
      });
  }
};

export const anySchema = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  options: { readonly name?: string } = {},
): Effect.Effect<SymbolicValue<A>, UnsupportedSchemaError, BuilderRequirements> => {
  const name = options.name?.trim() || "input";

  return Effect.flatMap(
    Effect.try({
      try: () => planFromAst(schema.ast),
      catch: (cause) =>
        cause instanceof UnsupportedSchemaError
          ? cause
          : new UnsupportedSchemaError({
              message: cause instanceof Error ? cause.message : String(cause),
            }),
    }),
    (plan) =>
      Effect.map(effectForPlan(plan, name), (value) => {
        // SAFETY: planFromAst preserves the Schema AST's supported record/tuple/literal structure;
        // effectForPlan creates the corresponding symbolic leaf for each supported primitive.
        return value as SymbolicValue<A>;
      }),
  );
};

export const VerifyWithSchema = Object.freeze({ ...Verify, anySchema });

export { VerifyWithSchema as Verify };

export { Schema };
