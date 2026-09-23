import { Effect } from "effect";

export const positiveOrDenied = (value: number): Effect.Effect<number, "Denied", never> =>
  value > 0 ? Effect.succeed(value) : Effect.fail("Denied");

export const enabledOrDenied = (enabled: boolean): Effect.Effect<boolean, "Denied", never> =>
  enabled ? Effect.succeed(true) : Effect.fail("Denied");
