export const clamp = (value: number): number => (value < 0 ? 0 : value);

export const decrement = (value: number): number => value - 1;

export function double(value: number): number {
  return value * 2;
}

export const divide = (left: number, right: number): number => left / right;

export const increment = (value: number): number => value + 1;

export const balanceAfterTransfer = (
  balance: number,
  amount: number,
  fee: number,
  limit: number,
): number =>
  amount <= 0
    ? balance
    : amount > limit
      ? balance
      : amount + fee > balance
        ? balance
        : balance - amount - fee;

export const priceAfterDiscount = (price: number, discount: number, maxDiscount: number): number =>
  discount > 0 && discount <= price && discount <= maxDiscount ? price - discount : price;
