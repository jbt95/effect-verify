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
