import { Effect as EffectAPI } from "effect";

const Effect = EffectAPI;

export const integerOutcome = (
  value: number,
): EffectAPI.Effect<number, "Denied" | "Missing", never> =>
  value > 0 ? Effect.succeed(value) : value === 0 ? Effect.fail("Denied") : Effect.fail("Missing");

export const booleanOutcome = (enabled: boolean): EffectAPI.Effect<boolean, "Denied", never> =>
  enabled ? Effect.succeed(true) : Effect.fail("Denied");

export const directFailure = (): EffectAPI.Effect<number, "Denied", never> => Effect.fail("Denied");

export const successNamedFailure = (): EffectAPI.Effect<number, "Success", never> =>
  Effect.fail("Success");

export const directSuccess = (value: number): EffectAPI.Effect<number, never, never> =>
  Effect.succeed(value);

export const directBooleanSuccess = (): EffectAPI.Effect<boolean, never, never> =>
  Effect.succeed(true);

export const localOutcome = (value: number): EffectAPI.Effect<number, "Denied", never> => {
  const bounded = value + 1;

  if (value < 0) return Effect.fail("Denied");

  return Effect.succeed(bounded);
};

export const unknownFailure = (): EffectAPI.Effect<number, string, never> => Effect.fail("Denied");

export const objectFailure = (): EffectAPI.Effect<number, { readonly tag: "Denied" }, never> =>
  Effect.fail({ tag: "Denied" });

export const arbitraryFailure = (tag: string): EffectAPI.Effect<number, string, never> =>
  Effect.fail(tag);

export const unsupportedMethod = (): EffectAPI.Effect<number, never, never> => Effect.sync(() => 1);

export const unsupportedMap = (value: number): EffectAPI.Effect<number, "Denied", never> =>
  Effect.map(Effect.succeed(value), (item) => item);

export const unsupportedFlatMap = (value: number): EffectAPI.Effect<number, "Denied", never> =>
  Effect.flatMap(Effect.succeed(value), (item) => Effect.succeed(item));

export const unsupportedGen = (): EffectAPI.Effect<number, "Denied", never> =>
  Effect.gen(function* () {
    yield* Effect.fail("Denied");

    return 1;
  });

export const unsupportedTryPromise = (): EffectAPI.Effect<number, "Denied", never> =>
  Effect.tryPromise({ try: async () => 1, catch: () => "Denied" });

export const requiredEnvironment = (): EffectAPI.Effect<
  number,
  "Denied",
  { readonly service: string }
> => Effect.fail("Denied");

export const wrongSuccessSort = (): EffectAPI.Effect<number, "Denied", never> =>
  Effect.succeed(true);

export const wrongFailureTag = (): EffectAPI.Effect<number, "Denied", never> =>
  Effect.fail("Other");

export const recordFailure = (): EffectAPI.Effect<number, "Denied", never> =>
  Effect.fail({ tag: "Denied" });

export const dynamicFailure = (): EffectAPI.Effect<number, "Denied", never> => {
  const tag: string = "Denied";

  return Effect.fail(tag);
};

const wrappedSucceed = (payload: number): EffectAPI.Effect<number> => Effect.succeed(payload);

export const forgedSucceed = (value: number): EffectAPI.Effect<number, never, never> =>
  wrappedSucceed(value);
