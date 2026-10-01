// Checks on POS "Balancing" slips (spec 5.1 cross-checks). Money in cents.
import { Cents, sum } from "./units.js";

export interface PosSlip {
  shiftNo: number; cashierNo: string; printedAt?: string;
  tenders: Record<string, Cents>; totalPayment: Cents; salesTotal: Cents; payOut: Cents; businessTotal: Cents;
}

/** A slip is internally consistent when tenders add up and tenders = sales - payouts. */
export function slipConsistent(s: PosSlip) {
  const tenderSum = sum(Object.values(s.tenders));
  const problems: string[] = [];
  if (tenderSum !== s.totalPayment) problems.push(`tenders add to ${tenderSum} but total payment is ${s.totalPayment}`);
  if (s.salesTotal - s.payOut !== s.businessTotal) problems.push(`sales - payouts = ${s.salesTotal - s.payOut} but business total is ${s.businessTotal}`);
  if (s.businessTotal !== s.totalPayment) problems.push(`business total ${s.businessTotal} vs total payment ${s.totalPayment}`);
  return { ok: problems.length === 0, problems };
}

/** Interim slips within one shift are cumulative: no total may go down, and shift/cashier must not change. */
export function slipSequenceConsistent(slips: PosSlip[]) {
  const problems: string[] = [];
  for (let i = 1; i < slips.length; i++) {
    const a = slips[i - 1], b = slips[i];
    if (a.shiftNo !== b.shiftNo || a.cashierNo !== b.cashierNo) problems.push(`slip ${i + 1}: shift or cashier changed`);
    if (b.salesTotal < a.salesTotal) problems.push(`slip ${i + 1}: sales went down`);
    if (b.payOut < a.payOut) problems.push(`slip ${i + 1}: payouts went down`);
    for (const [k, v] of Object.entries(a.tenders)) if ((b.tenders[k] ?? 0) < v) problems.push(`slip ${i + 1}: ${k} went down`);
  }
  return { ok: problems.length === 0, problems };
}
