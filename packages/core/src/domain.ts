export type DomainValue = number | boolean;

declare const DomainTypeId: unique symbol;

export interface Domain<A extends DomainValue> {
  readonly [DomainTypeId]: A;
  readonly sort: A extends boolean ? "Bool" : "Int";
  readonly label: string;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

class DomainValueImpl<A extends DomainValue> implements Domain<A> {
  declare readonly [DomainTypeId]: A;

  constructor(
    readonly sort: A extends boolean ? "Bool" : "Int",
    readonly label: string,
    readonly minimum: number | null,
    readonly maximum: number | null,
  ) {
    Object.freeze(this);
  }
}

export interface IntegerOptions {
  readonly min?: number;
  readonly max?: number;
}

export interface BitDomainOptions {
  readonly bits: number;
}

const validateBound = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }

  return value;
};

export const booleanDomain = (): Domain<boolean> =>
  new DomainValueImpl<boolean>("Bool", "Bool", null, null);

const optionalBound = (value: number | undefined, name: string): number | null =>
  value === undefined ? null : validateBound(value, name);

const validateRange = (minimum: number | null, maximum: number | null): void => {
  if (minimum !== null && maximum !== null && minimum > maximum) {
    throw new RangeError("Integer domain min must be less than or equal to max");
  }
};

const formatBound = (value: number | null, unbounded: string): string =>
  value === null ? unbounded : String(value);

const integerDomainLabel = (minimum: number | null, maximum: number | null): string => {
  if (minimum === null && maximum === null) return "Int";

  return `Int[${formatBound(minimum, "-∞")}, ${formatBound(maximum, "∞")}]`;
};

export const integerDomain = (options: IntegerOptions = {}): Domain<number> => {
  const minimum = optionalBound(options.min, "min");
  const maximum = optionalBound(options.max, "max");
  validateRange(minimum, maximum);

  return new DomainValueImpl<number>("Int", integerDomainLabel(minimum, maximum), minimum, maximum);
};

const validateBits = (bits: number): number => {
  if (!Number.isInteger(bits) || bits < 1 || bits > 53) {
    throw new RangeError("Integer bit width must be an integer from 1 to 53");
  }

  return bits;
};

export const unsignedDomain = ({ bits: rawBits }: BitDomainOptions): Domain<number> => {
  const bits = validateBits(rawBits);

  return new DomainValueImpl<number>("Int", `UInt${bits}`, 0, 2 ** bits - 1);
};

export const signedDomain = ({ bits: rawBits }: BitDomainOptions): Domain<number> => {
  const bits = validateBits(rawBits);
  const halfRange = 2 ** (bits - 1);

  return new DomainValueImpl<number>("Int", `Int${bits}`, -halfRange, halfRange - 1);
};
