export const arithmetic = (value: number): number => value * value - 1;

export const conditional = (value: number, offset: number): number =>
  value < 0 ? -offset : value + offset;

export const logical = (value: number): number =>
  (value < 0 && value !== -1) || value > 1 ? 1 : 0;

export const booleanInput = (value: boolean): boolean => !value;

export const mixedInputs = (enabled: boolean, value: number): boolean =>
  enabled ? value > 0 : value === 0;

export const booleanReturnFromNumber = (value: number): boolean => value >= 0;

export const numberReturnFromBoolean = (value: boolean): number => (value ? 1 : 0);

export const localReturns = (value: number): number => {
  const adjusted = value + 1;

  if (value < 0) {
    return adjusted;
  } else {
    return adjusted * 2;
  }
};

export const booleanLocalReturns = (enabled: boolean): boolean => {
  const result = !enabled;

  if (enabled) return false;
  else return result;
};

// @ts-expect-error TS2366: the missing ending return is deliberate. This file is parsed
// as source text by the frontend, which must reject the incomplete return path itself.
export const incompleteReturns = (value: number): number => {
  if (value < 0) return value;
};

export const unsupportedStatement = (value: number): number => {
  value;

  return value;
};

export const mutableLocal = (value: number): number => {
  let result = value;

  return result;
};

export const shadowedLocal = (value: number): number => {
  const result = value;

  if (value < 0) {
    const result = 0;

    return result;
  } else return result;
};

export const countedEarlyReturn = (limit: number): number => {
  if (limit < 0) return 0;

  for (let index = 0; index < 3; index++) {
    if (index === limit) return index + 10;
  }

  return 13;
};

export const counted32 = (): number => {
  for (let index = 0; index < 32; index += 1) {
    if (index === 31) return index + 1;
  }

  return 32;
};

export const counted33 = (): number => {
  for (let index = 0; index < 33; index += 1) {
    if (index === 32) return index;
  }

  return 33;
};

export const dynamicLoopBound = (limit: number): number => {
  for (let index = 0; index < limit; index++) return index;

  return 0;
};

export const mutatedLoopVariable = (): number => {
  for (let index = 0; index < 2; index++) {
    index++;
  }

  return 0;
};

export const zeroStepLoop = (): number => {
  for (let index = 0; index < 2; index += 0) return index;

  return 0;
};

export const wrongDirectionLoop = (): number => {
  for (let index = 0; index < 2; index--) return index;

  return 0;
};

// Thirty sequential conditionals. Each `if` has no `else`, so both of its arms reuse
// the same continuation. That is the shape that made frontend compilation exponential.
export const deepConditionalChain = (value: number): number => {
  if (value > 0) return value + 1;

  if (value > 1) return value + 2;

  if (value > 2) return value + 3;

  if (value > 3) return value + 4;

  if (value > 4) return value + 5;

  if (value > 5) return value + 6;

  if (value > 6) return value + 7;

  if (value > 7) return value + 8;

  if (value > 8) return value + 9;

  if (value > 9) return value + 10;

  if (value > 10) return value + 11;

  if (value > 11) return value + 12;

  if (value > 12) return value + 13;

  if (value > 13) return value + 14;

  if (value > 14) return value + 15;

  if (value > 15) return value + 16;

  if (value > 16) return value + 17;

  if (value > 17) return value + 18;

  if (value > 18) return value + 19;

  if (value > 19) return value + 20;

  if (value > 20) return value + 21;

  if (value > 21) return value + 22;

  if (value > 22) return value + 23;

  if (value > 23) return value + 24;

  if (value > 24) return value + 25;

  if (value > 25) return value + 26;

  if (value > 26) return value + 27;

  if (value > 27) return value + 28;

  if (value > 28) return value + 29;

  if (value > 29) return value + 30;

  return value;
};
