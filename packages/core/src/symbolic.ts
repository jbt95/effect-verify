import type { BoolExpr, Expr, IntExpr, StringExpr } from "./expr.js";

export type Numeric = number;

export type SymbolicValue = Numeric | boolean | string;

declare const SymTypeId: unique symbol;

export interface Sym<A extends SymbolicValue> {
  readonly [SymTypeId]: A;
  readonly expression: A extends boolean ? BoolExpr : A extends string ? StringExpr : IntExpr;
}

export type IntSym = Sym<Numeric>;

export type BoolSym = Sym<boolean>;

export type StringSym = Sym<string>;

class SymValue<A extends SymbolicValue> implements Sym<A> {
  declare readonly [SymTypeId]: A;
  constructor(
    readonly expression: A extends boolean ? BoolExpr : A extends string ? StringExpr : IntExpr,
  ) {}
}

const intSym = (expression: IntExpr): IntSym => new SymValue<Numeric>(expression);

const boolSym = (expression: BoolExpr): BoolSym => new SymValue<boolean>(expression);

const stringSym = (expression: StringExpr): StringSym => new SymValue<string>(expression);

const stringExpr = (expression: Expr): expression is StringExpr =>
  expression.kind === "StringLiteral" ||
  (expression.kind === "Variable" && expression.sort === "String") ||
  (expression.kind === "If" && expression.sort === "String");

const isBoolExpr = (expression: Expr): expression is BoolExpr => {
  switch (expression.kind) {
    case "BoolLiteral":
    case "Not":
    case "And":
    case "Or":
    case "Lt":
    case "Lte":
    case "Gt":
    case "Gte":
      return true;
    case "Equal":
    case "NotEqual":
      return true;
    case "Variable":
    case "If":
      return expression.sort === "Bool";
    case "StringLiteral":
    case "IntLiteral":
    case "Add":
    case "Sub":
    case "Mul":
    case "Div":
    case "Mod":
      return false;
  }
};

export const expressionOf = <A extends SymbolicValue>(
  value: Sym<A>,
): A extends boolean ? BoolExpr : A extends string ? StringExpr : IntExpr => value.expression;

export const intVariable = (id: number): IntSym => intSym({ kind: "Variable", id, sort: "Int" });

export const boolVariable = (id: number): BoolSym =>
  boolSym({ kind: "Variable", id, sort: "Bool" });

export const stringVariable = (id: number): StringSym =>
  stringSym({ kind: "Variable", id, sort: "String" });

const asInt = (value: IntSym): IntExpr => value.expression;

const asBool = (value: BoolSym): BoolExpr => value.expression;

export function literal(value: number): IntSym;
export function literal(value: boolean): BoolSym;
export function literal(value: string): StringSym;
export function literal(value: number | boolean | string): IntSym | BoolSym | StringSym {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- primitive union discrimination for Sym.literal
  if (typeof value === "string") return stringSym({ kind: "StringLiteral", value });

  if (value === true || value === false) return boolSym({ kind: "BoolLiteral", value });

  if (!Number.isSafeInteger(value)) throw new RangeError("Integer literals must be safe integers");

  return intSym({ kind: "IntLiteral", value: String(value) });
}

const equality = (
  kind: "Equal" | "NotEqual",
  left: IntSym | BoolSym | StringSym,
  right: IntSym | BoolSym | StringSym,
): BoolSym => {
  if (isBoolExpr(left.expression) && isBoolExpr(right.expression))
    return boolSym({ kind, sort: "Bool", left: left.expression, right: right.expression });

  if (stringExpr(left.expression) && stringExpr(right.expression))
    return boolSym({ kind, sort: "String", left: left.expression, right: right.expression });

  if (
    !isBoolExpr(left.expression) &&
    !isBoolExpr(right.expression) &&
    !stringExpr(left.expression) &&
    !stringExpr(right.expression)
  )
    return boolSym({ kind, sort: "Int", left: left.expression, right: right.expression });
  throw new TypeError(
    `${kind === "Equal" ? "Equality" : "Inequality"} operands must have the same symbolic sort`,
  );
};

export function eq(left: IntSym, right: IntSym): BoolSym;
export function eq(left: BoolSym, right: BoolSym): BoolSym;
export function eq(left: StringSym, right: StringSym): BoolSym;
export function eq(
  left: IntSym | BoolSym | StringSym,
  right: IntSym | BoolSym | StringSym,
): BoolSym {
  return equality("Equal", left, right);
}

export function neq(left: IntSym, right: IntSym): BoolSym;
export function neq(left: BoolSym, right: BoolSym): BoolSym;
export function neq(left: StringSym, right: StringSym): BoolSym;
export function neq(
  left: IntSym | BoolSym | StringSym,
  right: IntSym | BoolSym | StringSym,
): BoolSym {
  return equality("NotEqual", left, right);
}

export const add = (left: IntSym, right: IntSym): IntSym =>
  intSym({ kind: "Add", left: asInt(left), right: asInt(right) });

export const sub = (left: IntSym, right: IntSym): IntSym =>
  intSym({ kind: "Sub", left: asInt(left), right: asInt(right) });

export const mul = (left: IntSym, right: IntSym): IntSym =>
  intSym({ kind: "Mul", left: asInt(left), right: asInt(right) });

export const div = (left: IntSym, right: IntSym): IntSym =>
  intSym({ kind: "Div", left: asInt(left), right: asInt(right) });

export const mod = (left: IntSym, right: IntSym): IntSym =>
  intSym({ kind: "Mod", left: asInt(left), right: asInt(right) });

export const lt = (left: IntSym, right: IntSym): BoolSym =>
  boolSym({ kind: "Lt", left: asInt(left), right: asInt(right) });

export const lte = (left: IntSym, right: IntSym): BoolSym =>
  boolSym({ kind: "Lte", left: asInt(left), right: asInt(right) });

export const gt = (left: IntSym, right: IntSym): BoolSym =>
  boolSym({ kind: "Gt", left: asInt(left), right: asInt(right) });

export const gte = (left: IntSym, right: IntSym): BoolSym =>
  boolSym({ kind: "Gte", left: asInt(left), right: asInt(right) });

export const and = (...values: ReadonlyArray<BoolSym>): BoolSym =>
  boolSym({ kind: "And", operands: Object.freeze(values.map(asBool)) });

export const or = (...values: ReadonlyArray<BoolSym>): BoolSym =>
  boolSym({ kind: "Or", operands: Object.freeze(values.map(asBool)) });

export const not = (value: BoolSym): BoolSym => boolSym({ kind: "Not", operand: asBool(value) });

export function ifThenElse(condition: BoolSym, whenTrue: IntSym, whenFalse: IntSym): IntSym;
export function ifThenElse(condition: BoolSym, whenTrue: BoolSym, whenFalse: BoolSym): BoolSym;
export function ifThenElse(
  condition: BoolSym,
  whenTrue: StringSym,
  whenFalse: StringSym,
): StringSym;
export function ifThenElse(
  condition: BoolSym,
  whenTrue: IntSym | BoolSym | StringSym,
  whenFalse: IntSym | BoolSym | StringSym,
): IntSym | BoolSym | StringSym {
  if (isBoolExpr(whenTrue.expression) && isBoolExpr(whenFalse.expression))
    return boolSym({
      kind: "If",
      sort: "Bool",
      condition: asBool(condition),
      whenTrue: whenTrue.expression,
      whenFalse: whenFalse.expression,
    });

  if (stringExpr(whenTrue.expression) && stringExpr(whenFalse.expression))
    return stringSym({
      kind: "If",
      sort: "String",
      condition: asBool(condition),
      whenTrue: whenTrue.expression,
      whenFalse: whenFalse.expression,
    });

  if (
    !isBoolExpr(whenTrue.expression) &&
    !isBoolExpr(whenFalse.expression) &&
    !stringExpr(whenTrue.expression) &&
    !stringExpr(whenFalse.expression)
  )
    return intSym({
      kind: "If",
      sort: "Int",
      condition: asBool(condition),
      whenTrue: whenTrue.expression,
      whenFalse: whenFalse.expression,
    });
  throw new TypeError("Conditional branches must have the same symbolic sort");
}

export const Sym = Object.freeze({
  literal,
  eq,
  neq,
  add,
  sub,
  mul,
  div,
  mod,
  lt,
  lte,
  gt,
  gte,
  and,
  or,
  not,
  ifThenElse,
});
