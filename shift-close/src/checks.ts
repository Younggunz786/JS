// Extra checks found necessary from real Perth Road packs (Sep 2026).
import { Cents } from "./units.js";

/** The written Page 7 result must equal the calculated one, in amount AND direction. */
export function statedResultCheck(calculatedShortOver: Cents, stated: { amount: Cents; direction?: "short" | "over" }) {
  const calcDir = calculatedShortOver > 0 ? "short" : calculatedShortOver < 0 ? "over" : undefined;
  const amountOk = Math.abs(calculatedShortOver) === stated.amount;
  const directionOk = stated.direction === undefined || calcDir === undefined || stated.direction === calcDir;
  return { ok: amountOk && directionOk, amountOk, directionOk, calcDir, difference: Math.abs(calculatedShortOver) - stated.amount };
}

/** Each pump's opening reading must equal the previous shift's closing reading. */
export function pumpContinuity(prevClosing: Record<number, number>, opening: Record<number, number>) {
  const breaks = Object.keys(opening).map(Number)
    .filter((p) => prevClosing[p] !== undefined && prevClosing[p] !== opening[p])
    .map((p) => ({ pump: p, previousClosing: prevClosing[p], opening: opening[p], gap: opening[p] - prevClosing[p] }));
  return { ok: breaks.length === 0, breaks };
}

/** Total Card: what the POS recorded vs what the card terminal charged. */
export function totalCardCheck(a: { posAmount: Cents; cardAmount: Cents }) {
  const difference = a.posAmount - a.cardAmount;
  return { ok: difference === 0, difference };
}
