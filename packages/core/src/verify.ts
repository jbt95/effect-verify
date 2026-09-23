import { Cause, Context, Effect, Exit } from "effect";
import type { BoolExpr } from "./expr.js";
import { formatExpr } from "./expr.js";
import type { Domain, DomainValue, IntegerOptions, BitDomainOptions } from "./domain.js";
import { booleanDomain, integerDomain, signedDomain, unsignedDomain } from "./domain.js";
import { ProofCompileError } from "./errors.js";
import type {
  Assertion,
  SourceProof,
  SourceEffectProof,
  VerificationBackend,
  VerificationProgram,
} from "./program.js";
import type { BoolSym, IntSym, StringSym } from "./symbolic.js";
import {
  boolVariable,
  expressionOf,
  intVariable,
  literal,
  stringVariable,
  Sym,
} from "./symbolic.js";

interface BuildOptions {
  readonly name?: string;
}

class ProofBuilder {
  private readonly variableRecords: Array<VerificationProgram["variables"][number]> = [];
  private readonly assumptionRecords: Array<BoolExpr> = [];
  private readonly assertionRecords: Array<Assertion> = [];
  private readonly names = new Set<string>();
  private nextVariableId = 0;

  allocateBoolean(options: BuildOptions): BoolSym {
    const variable = this.registerVariable("Bool", "Bool", null, null, options);

    return boolVariable(variable.id);
  }

  allocateString(options: BuildOptions): StringSym {
    return stringVariable(this.registerVariable("String", "String", null, null, options).id);
  }

  allocateInteger(domain: Domain<DomainValue>, options: BuildOptions): IntSym {
    const variable = this.registerVariable(
      "Int",
      domain.label,
      domain.minimum,
      domain.maximum,
      options,
    );

    const value = intVariable(variable.id);

    if (domain.minimum !== null) {
      this.assumptionRecords.push(expressionOf(Sym.gte(value, literal(domain.minimum))));
    }

    if (domain.maximum !== null) {
      this.assumptionRecords.push(expressionOf(Sym.lte(value, literal(domain.maximum))));
    }

    return value;
  }

  addAssumption(condition: BoolSym): void {
    this.assumptionRecords.push(expressionOf(condition));
  }

  addAssertion(condition: BoolSym, label?: string): void {
    const expression = expressionOf(condition);
    const id = this.assertionRecords.length;

    const resolvedLabel =
      label?.trim() ||
      formatExpr(
        expression,
        (variableId) =>
          this.variableRecords.find((variable) => variable.id === variableId)?.name ??
          `v${variableId}`,
      );

    this.assertionRecords.push(Object.freeze({ id, label: resolvedLabel, expression }));
  }

  toProgram(proof: string): VerificationProgram {
    return Object.freeze({
      proof,
      variables: Object.freeze([...this.variableRecords]),
      assumptions: Object.freeze([...this.assumptionRecords]),
      assertions: Object.freeze([...this.assertionRecords]),
    });
  }

  private registerVariable(
    sort: "Bool" | "Int" | "String",
    domain: string,
    minimum: number | null,
    maximum: number | null,
    options: BuildOptions,
  ): VerificationProgram["variables"][number] {
    const id = this.nextVariableId;
    const requestedName = options.name?.trim();
    const name = requestedName || `input${id}`;

    if (this.names.has(name)) {
      throw new Error(`Duplicate symbolic input name: ${name}`);
    }

    this.names.add(name);
    this.nextVariableId += 1;
    const variable = Object.freeze({ id, name, sort, domain, minimum, maximum });
    this.variableRecords.push(variable);

    return variable;
  }
}

const BuilderTag = Context.GenericTag<ProofBuilder>("@effect-verifier/core/ProofBuilder");

export interface Proof<E = never> {
  readonly kind: "Proof";
  readonly name: string;
  readonly program: Effect.Effect<void, E, ProofBuilder>;
}

export interface InputOptions {
  readonly name?: string;
}

type FunctionArguments<Function> = Function extends (...arguments_: infer Arguments) => infer Result
  ? [Result] extends [number] | [boolean]
    ? Arguments extends ReadonlyArray<number | boolean>
      ? Arguments
      : never
    : never
  : never;

type IsSupportedSourceFunction<Function> =
  FunctionArguments<Function> extends infer Arguments extends ReadonlyArray<number | boolean>
    ? number extends Arguments["length"]
      ? false
      : Arguments extends Required<Arguments>
        ? true
        : false
    : false;

type SourceFunctionName<Module> = {
  [Name in keyof Module]: Name extends string
    ? IsSupportedSourceFunction<Module[Name]> extends true
      ? Name
      : never
    : never;
}[keyof Module];

type SourceFunctionArguments<Module, Name extends SourceFunctionName<Module>> =
  FunctionArguments<Module[Name]> extends infer Arguments extends ReadonlyArray<number | boolean>
    ? Arguments
    : never;

type SourceFunctionResult<Module, Name extends SourceFunctionName<Module>> = Module[Name] extends (
  ...arguments_: never[]
) => infer Result
  ? Result
  : never;

type EffectFunctionArguments<Function> = Function extends (
  ...arguments_: infer Arguments
) => Effect.Effect<unknown, unknown, never>
  ? Arguments extends ReadonlyArray<number | boolean>
    ? Arguments
    : never
  : never;

type EffectFunctionSuccess<Function> = Function extends (
  ...arguments_: never[]
) => Effect.Effect<infer A, unknown, never>
  ? A
  : never;

type EffectFunctionError<Function> = Function extends (
  ...arguments_: never[]
) => Effect.Effect<unknown, infer E, never>
  ? E
  : never;

type IsSupportedEffectSuccess<Value> = [Value] extends [number]
  ? true
  : [Value] extends [boolean]
    ? true
    : false;

type IsFiniteStringUnion<Value> = [Value] extends [string]
  ? string extends Value
    ? false
    : true
  : false;

type SourceEffectFunctionName<Module> = {
  [Name in keyof Module]: Name extends string
    ? EffectFunctionArguments<Module[Name]> extends infer Args extends ReadonlyArray<
        number | boolean
      >
      ? number extends Args["length"]
        ? never
        : Args extends Required<Args>
          ? IsSupportedEffectSuccess<EffectFunctionSuccess<Module[Name]>> extends true
            ? IsFiniteStringUnion<EffectFunctionError<Module[Name]>> extends true
              ? Name
              : never
            : never
          : never
      : never
    : never;
}[keyof Module];

type SourceEffectArguments<Module, Name extends SourceEffectFunctionName<Module>> =
  EffectFunctionArguments<Module[Name]> extends infer Args extends ReadonlyArray<number | boolean>
    ? Args
    : never;

type SourceEffectSuccess<
  Module,
  Name extends SourceEffectFunctionName<Module>,
> = EffectFunctionSuccess<Module[Name]>;

type EffectSymbol<Value> = Value extends boolean ? BoolSym : IntSym;

type EffectInputs<Arguments extends ReadonlyArray<number | boolean>> = {
  readonly [Index in keyof Arguments]: Arguments[Index] extends boolean ? BoolSym : IntSym;
};

export type SourceEffectProofOptions<Module, Name extends SourceEffectFunctionName<Module>> = {
  readonly name: string;
  readonly sourceFile: string;
  readonly functionName: Name;
  readonly inputs: InputDomains<SourceEffectArguments<Module, Name>>;
  readonly success: (
    inputs: EffectInputs<SourceEffectArguments<Module, Name>>,
    value: EffectSymbol<SourceEffectSuccess<Module, Name>>,
  ) => BoolSym;
  readonly failure: (
    inputs: EffectInputs<SourceEffectArguments<Module, Name>>,
    tag: StringSym,
  ) => BoolSym;
  readonly assertionLabel?: string;
} & (SourceEffectSuccess<Module, Name> extends boolean
  ? { readonly resultSort: "Bool" }
  : { readonly resultSort?: "Int" });

type InputDomains<Arguments extends ReadonlyArray<number | boolean>> = {
  readonly [Index in keyof Arguments]: Domain<Arguments[Index]>;
};

type SymbolicInputs<Arguments extends ReadonlyArray<number | boolean>> = {
  readonly [Index in keyof Arguments]: Arguments[Index] extends boolean ? BoolSym : IntSym;
};

type SourceResultSymbol<Result> = Result extends boolean ? BoolSym : IntSym;

export type SourceFunctionProofOptions<Module, Name extends SourceFunctionName<Module>> = {
  readonly name: string;
  readonly sourceFile: string;
  readonly functionName: Name;
  readonly inputs: InputDomains<SourceFunctionArguments<Module, Name>>;
  readonly assertion: (
    inputs: SymbolicInputs<SourceFunctionArguments<Module, Name>>,
    result: SourceResultSymbol<SourceFunctionResult<Module, Name>>,
  ) => BoolSym;
  readonly assertionLabel?: string;
} & (SourceFunctionResult<Module, Name> extends boolean
  ? { readonly resultSort: "Bool" }
  : { readonly resultSort?: "Int" });

const isSymbolicInputTuple = <Arguments extends ReadonlyArray<number | boolean>>(
  inputs: ReadonlyArray<IntSym | BoolSym>,
  expectedLength: number,
): inputs is SymbolicInputs<Arguments> => inputs.length === expectedLength;

const proofInstances = new WeakSet<object>();

const sourceProofInstances = new WeakSet<object>();

const sourceEffectProofInstances = new WeakSet<object>();

export const anyString = (
  options: InputOptions = {},
): Effect.Effect<StringSym, never, ProofBuilder> =>
  Effect.flatMap(BuilderTag, (builder) => Effect.sync(() => builder.allocateString(options)));

export function any(
  domain: Domain<number>,
  options?: InputOptions,
): Effect.Effect<IntSym, never, ProofBuilder>;
export function any(
  domain: Domain<boolean>,
  options?: InputOptions,
): Effect.Effect<BoolSym, never, ProofBuilder>;
export function any(
  domain: Domain<number> | Domain<boolean>,
  options: InputOptions = {},
): Effect.Effect<IntSym | BoolSym, never, ProofBuilder> {
  return Effect.flatMap(BuilderTag, (builder) =>
    Effect.sync(() =>
      domain.sort === "Bool"
        ? builder.allocateBoolean(options)
        : builder.allocateInteger(domain, options),
    ),
  );
}

export const assume = (condition: BoolSym): Effect.Effect<void, never, ProofBuilder> =>
  Effect.flatMap(BuilderTag, (builder) => Effect.sync(() => builder.addAssumption(condition)));

export const assert = (
  condition: BoolSym,
  label?: string,
): Effect.Effect<void, never, ProofBuilder> =>
  Effect.flatMap(BuilderTag, (builder) =>
    Effect.sync(() => builder.addAssertion(condition, label)),
  );

export const sourceFunction = <Module, Name extends SourceFunctionName<Module>>(
  options: SourceFunctionProofOptions<Module, Name>,
): SourceProof => {
  const { name, sourceFile, functionName } = options;

  if (name.trim().length === 0) throw new Error("Source proof name must not be empty");

  if (sourceFile.trim().length === 0) throw new Error("Source file must not be empty");

  if (functionName.trim().length === 0) throw new Error("Source function name must not be empty");

  const builder = new ProofBuilder();

  const inputSymbols = options.inputs.map((domain, index) =>
    domain.sort === "Bool"
      ? builder.allocateBoolean({ name: `input${index}` })
      : builder.allocateInteger(domain, { name: `input${index}` }),
  );

  if (
    !isSymbolicInputTuple<SourceFunctionArguments<Module, Name>>(
      inputSymbols,
      options.inputs.length,
    )
  ) {
    throw new Error("Source input tuple has an unexpected length");
  }

  const resultSort = options.resultSort ?? "Int";

  const result =
    resultSort === "Bool"
      ? builder.allocateBoolean({ name: "result" })
      : builder.allocateInteger(integerDomain(), { name: "result" });

  // SAFETY: each resultSort branch allocates exactly the matching symbolic variable sort.
  const resultExpression =
    resultSort === "Bool" ? expressionOf(result as BoolSym) : expressionOf(result as IntSym);

  if (resultExpression.kind !== "Variable") {
    throw new Error("Source proof result must be a symbolic variable");
  }

  const assertionLabel = options.assertionLabel?.trim() || undefined;

  // SAFETY: input domains are positionally typed and one symbol is allocated for each domain.
  const assertionInputs = Object.freeze(inputSymbols) as SymbolicInputs<
    SourceFunctionArguments<Module, Name>
  >;

  // SAFETY: the result symbol sort was selected from the required generic resultSort option.
  const assertionResult = result as SourceResultSymbol<SourceFunctionResult<Module, Name>>;
  builder.addAssertion(options.assertion(assertionInputs, assertionResult), assertionLabel);

  const sourceProof: SourceProof = Object.freeze({
    kind: "SourceProof",
    name,
    sourceFile,
    functionName,
    resultVariableId: resultExpression.id,
    resultSort,
    assertionLabel,
    program: builder.toProgram(name),
  });

  sourceProofInstances.add(sourceProof);

  return sourceProof;
};

export const sourceEffectFunction = <Module, Name extends SourceEffectFunctionName<Module>>(
  options: SourceEffectProofOptions<Module, Name>,
): SourceEffectProof => {
  const { name, sourceFile, functionName } = options;

  if (
    name.trim().length === 0 ||
    sourceFile.trim().length === 0 ||
    String(functionName).trim().length === 0
  ) {
    throw new Error("Source effect proof identity must not be empty");
  }

  const builder = new ProofBuilder();

  const inputSymbols = options.inputs.map((domain, index) =>
    domain.sort === "Bool"
      ? builder.allocateBoolean({ name: `input${index}` })
      : builder.allocateInteger(domain, { name: `input${index}` }),
  );

  if (
    !isSymbolicInputTuple<SourceEffectArguments<Module, Name>>(inputSymbols, options.inputs.length)
  ) {
    throw new Error("Source effect input tuple has an unexpected length");
  }

  const resultSort = options.resultSort ?? "Int";

  const result =
    resultSort === "Bool"
      ? builder.allocateBoolean({ name: "successValue" })
      : builder.allocateInteger(integerDomain(), { name: "successValue" });

  // SAFETY: each resultSort branch allocates exactly the matching symbolic variable sort.
  const resultExpression =
    resultSort === "Bool" ? expressionOf(result as BoolSym) : expressionOf(result as IntSym);

  if (resultExpression.kind !== "Variable")
    throw new Error("Source effect success must be a symbolic variable");
  const tag = builder.allocateString({ name: "outcomeTag" });
  const tagExpression = expressionOf(tag);
  const failureTag = builder.allocateString({ name: "failureTag" });
  const failureTagExpression = expressionOf(failureTag);

  if (tagExpression.kind !== "Variable" || failureTagExpression.kind !== "Variable")
    throw new Error("Source effect tags must be symbolic variables");

  // SAFETY: the selected branch allocated the value matching the declared success sort.
  const successValue = resultSort === "Bool" ? (result as BoolSym) : (result as IntSym);

  // SAFETY: isSymbolicInputTuple above verifies the positional tuple length and the generic maps its sorts.
  const assertionInputs = Object.freeze(inputSymbols) as EffectInputs<
    SourceEffectArguments<Module, Name>
  >;

  const failurePredicate = options.failure(assertionInputs, failureTag);

  // SAFETY: SourceEffectFunctionName restricts success to one of the supported Bool/Int sorts.
  const successPredicate = options.success(
    assertionInputs,
    successValue as EffectSymbol<SourceEffectSuccess<Module, Name>>,
  );

  const outcomeIsSuccess = Sym.eq(tag, literal("Success"));
  const guarded = Sym.ifThenElse(outcomeIsSuccess, successPredicate, failurePredicate);
  builder.addAssertion(guarded, options.assertionLabel);

  const proofValue: SourceEffectProof = Object.freeze({
    kind: "SourceEffectProof",
    name,
    sourceFile,
    functionName,
    resultVariableId: resultExpression.id,
    resultSort,
    tagVariableId: tagExpression.id,
    failureTagVariableId: failureTagExpression.id,
    assertionLabel: options.assertionLabel?.trim() || undefined,
    program: builder.toProgram(name),
  });

  sourceEffectProofInstances.add(proofValue);

  return proofValue;
};

export const isSourceEffectProof = (value: unknown): value is SourceEffectProof =>
  value instanceof Object && sourceEffectProofInstances.has(value);

export const isSourceProof = (value: unknown): value is SourceProof | SourceEffectProof =>
  value instanceof Object &&
  (sourceProofInstances.has(value) || sourceEffectProofInstances.has(value));

/** Checks declared source-input domains without loading or invoking the target function. */
export const isValidSourceInputs = (
  proofValue: SourceProof | SourceEffectProof,
  candidate: unknown,
): candidate is ReadonlyArray<number | boolean> => {
  if (
    !(sourceProofInstances.has(proofValue) || sourceEffectProofInstances.has(proofValue)) ||
    !Array.isArray(candidate)
  )
    return false;

  const { variables } = proofValue.program;

  if (!Array.isArray(variables)) return false;

  const results = variables.filter((variable) => variable.id === proofValue.resultVariableId);

  if (
    results.length !== 1 ||
    results[0]?.sort !== proofValue.resultSort ||
    !Number.isSafeInteger(proofValue.resultVariableId)
  ) {
    return false;
  }

  if (proofValue.kind === "SourceEffectProof") {
    const tags = variables.filter((variable) => variable.id === proofValue.tagVariableId);

    const failureTags = variables.filter(
      (variable) => variable.id === proofValue.failureTagVariableId,
    );

    const reservedIds = [
      proofValue.resultVariableId,
      proofValue.tagVariableId,
      proofValue.failureTagVariableId,
    ];

    if (
      tags.length !== 1 ||
      tags[0]?.sort !== "String" ||
      failureTags.length !== 1 ||
      failureTags[0]?.sort !== "String" ||
      reservedIds.some((id) => !Number.isSafeInteger(id)) ||
      new Set(reservedIds).size !== reservedIds.length
    )
      return false;
  }

  const inputs = variables.filter(
    (variable) =>
      variable.id !== proofValue.resultVariableId &&
      (proofValue.kind !== "SourceEffectProof" ||
        (variable.id !== proofValue.tagVariableId &&
          variable.id !== proofValue.failureTagVariableId)),
  );

  if (candidate.length !== inputs.length) return false;

  for (let index = 0; index < inputs.length; index += 1) {
    if (!Object.hasOwn(candidate, index)) return false;

    const input = inputs[index];

    if (
      input === undefined ||
      !Number.isSafeInteger(input.id) ||
      (input.sort !== "Bool" && input.sort !== "Int")
    ) {
      return false;
    }

    const value: unknown = candidate[index];

    if (input.sort === "Bool") {
      // oxlint-disable anti-slop/no-runtime-typeof -- primitive validation is this type guard's contract
      if (input.minimum !== null || input.maximum !== null || typeof value !== "boolean") {
        return false;
      }

      continue;
    }

    if (
      !Number.isSafeInteger(input.minimum) ||
      !Number.isSafeInteger(input.maximum) ||
      input.minimum > input.maximum ||
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- primitive validation is this type guard's contract
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < input.minimum ||
      value > input.maximum
    ) {
      return false;
    }
  }

  return true;
};

export const isProof = (value: unknown): value is Proof<unknown> =>
  value instanceof Object && proofInstances.has(value);

export function proof<E>(program: Effect.Effect<void, E, ProofBuilder>): Proof<E>;
export function proof<E>(name: string, program: Effect.Effect<void, E, ProofBuilder>): Proof<E>;
export function proof<E>(
  nameOrProgram: string | Effect.Effect<void, E, ProofBuilder>,
  maybeProgram?: Effect.Effect<void, E, ProofBuilder>,
): Proof<E> {
  const hasUnnamedProgram = Effect.isEffect(nameOrProgram);
  const name = hasUnnamedProgram ? "anonymous" : nameOrProgram;
  const program = hasUnnamedProgram ? nameOrProgram : maybeProgram;

  if (program === undefined) throw new Error("Verify.proof requires an Effect program");

  if (name.trim().length === 0) throw new Error("Proof name must not be empty");

  const proofValue: Proof<E> = Object.freeze({ kind: "Proof", name, program });
  proofInstances.add(proofValue);

  return proofValue;
}

export const compileProof = <E>(
  proofValue: Proof<E>,
): Effect.Effect<VerificationProgram, ProofCompileError> =>
  Effect.try({
    try: () => {
      const builder = new ProofBuilder();
      const program = Effect.provideService(proofValue.program, BuilderTag, builder);
      const exit = Effect.runSyncExit(program);

      if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause));

      return builder.toProgram(proofValue.name);
    },
    catch: (cause) =>
      new ProofCompileError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

export const verifyProof = <E>(proofValue: Proof<E>, backend: VerificationBackend) =>
  Effect.flatMap(compileProof(proofValue), backend.verify);

export const boolean = booleanDomain;

export const integer = integerDomain;

export const uint = (options: BitDomainOptions) => unsignedDomain(options);

export const int = (options: BitDomainOptions) => signedDomain(options);

export const Verify = Object.freeze({
  boolean,
  integer: (options: IntegerOptions = {}) => integer(options),
  uint,
  int,
  any,
  anyString,
  assume,
  assert,
  proof,
  sourceFunction,
  sourceEffectFunction,
});
