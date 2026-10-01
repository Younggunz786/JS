// All money is held as integer cents and all volumes as integer centilitres
// (hundredths of a litre). Integers never drift, so rounding can never
// create a variance.

export type Cents = number;
export type Centilitres = number;

function parseFixed2(input: string | number, label: string): number {
  const text = String(input).replace(/[R,\s]/g, "");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new Error(`Invalid ${label}: "${input}"`);
  const whole = Number(m[2]);
  const frac = Number((m[3] ?? "0").padEnd(2, "0"));
  const value = whole * 100 + frac;
  return m[1] ? -value : value;
}

/** "R1,346.00" | "1346" | 1346.5 -> cents */
export const rand = (v: string | number): Cents => parseFixed2(v, "amount");

/** "12,122.64" | 4804 -> centilitres */
export const litres = (v: string | number): Centilitres => parseFixed2(v, "volume");

export const sum = (xs: readonly number[]): number => {
  for (const x of xs) if (!Number.isInteger(x)) throw new Error(`Non-integer value ${x}`);
  return xs.reduce((a, b) => a + b, 0);
};

const fmt = (v: number) => {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
};
export const showRand = (c: Cents) => (c < 0 ? `-R${fmt(-c)}` : `R${fmt(c)}`);
export const showLitres = (cl: Centilitres) => `${fmt(cl)} L`;
