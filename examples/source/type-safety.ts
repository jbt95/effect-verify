import { Sym, Verify } from "@effect-verifier/core";

type SourceFunctions = typeof import("./functions.ts");

export const sourceFunctionTypeChecks = (): void => {
  // @ts-expect-error function names must identify a numeric export.
  Verify.sourceFunction<SourceFunctions, "missing">({
    name: "missing-function",
    sourceFile: "./functions.ts",
    functionName: "missing",
    inputs: [],
    assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
  });

  Verify.sourceFunction<SourceFunctions, "clamp">({
    name: "wrong-clamp-arity",
    sourceFile: "./functions.ts",
    functionName: "clamp",
    // @ts-expect-error clamp accepts exactly one input domain.
    inputs: [Verify.integer(), Verify.integer()],
    assertion: (_inputs, result) => Sym.gte(result, Sym.literal(0)),
  });
};
