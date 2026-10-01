// Cash-up reconciliation: replaces Page 7. See spec section 5.1.
import { Cents, sum, showRand } from "./units.js";

export interface Line { label: string; amount: Cents }
export interface RebateLine extends Line { customer: string; litres?: number /* centilitres */; grade?: string }
export interface UnpaidLine extends Line { kind: "customer" | "account" | "staff-overfill" }

export interface CashUpInput {
  shiftNo: number;
  /** Who submitted the shift, and the POS cashier number on their staff record (if any). */
  submittingCashier: { name: string; posCashierNo?: string };
  pos: {
    cashierNo: string;
    cashierName: string;
    salesTotal: Cents;
    safeDropTotal: Cents;   // POS safe drops (drops only, excluding float in/out)
    payoutTotal: Cents;
    payoutCount: number;
    localAccountTotal: Cents;
  };
  safeDrops: Cents[];
  coins: Cents;
  cardBatches: Line[];
  vouchers: Line[];
  totalCard: Line[];
  localAccountSheetTotal?: Cents;
  unpaids: UnpaidLine[];
  unpaidPaid: Line[];
  payouts: {
    customerRebates: RebateLine[];
    taxiRebates: RebateLine[];
    bowserRebates: RebateLine[];
    expenses: Line[];
  };
  /** Agreed rebate rate in cents per litre, keyed `${customer}|${grade}` or `${customer}|*`. */
  rebateRates?: Record<string, number>;
}

export type CheckStatus = "match" | "mismatch" | "not-checked";
export interface Check { name: string; status: CheckStatus; detail: string; difference?: Cents }

export interface CashUpResult {
  shiftNo: number;
  accounted: Cents;
  shortOver: Cents; // positive = short, negative = over
  label: string;
  components: Record<string, Cents>;
  checks: Check[];
}

const amounts = (ls: { amount: Cents }[]) => sum(ls.map((l) => l.amount));

export function reconcileCashUp(i: CashUpInput): CashUpResult {
  const p = i.payouts;
  const allPayouts = [...p.customerRebates, ...p.taxiRebates, ...p.bowserRebates, ...p.expenses];

  const components = {
    safeDrops: sum(i.safeDrops),
    coins: i.coins,
    cardBatches: amounts(i.cardBatches),
    vouchers: amounts(i.vouchers),
    totalCard: amounts(i.totalCard),
    localAccounts: i.pos.localAccountTotal,
    unpaids: amounts(i.unpaids),
    unpaidPaid: amounts(i.unpaidPaid),
    payouts: amounts(allPayouts),
  };

  const accounted =
    components.safeDrops + components.coins + components.cardBatches + components.vouchers +
    components.totalCard + components.localAccounts + components.unpaids -
    components.unpaidPaid + components.payouts;

  const shortOver = i.pos.salesTotal - accounted;
  const label = shortOver === 0 ? "Balanced" : shortOver > 0 ? `Short ${showRand(shortOver)}` : `Over ${showRand(-shortOver)}`;

  const checks: Check[] = [];
  const cmp = (name: string, a: Cents, b: Cents, what: string) => {
    const d = a - b;
    checks.push({ name, status: d === 0 ? "match" : "mismatch", difference: d,
      detail: d === 0 ? `${what} match (${showRand(a)})` : `${what} differ by ${showRand(d)} (${showRand(a)} vs ${showRand(b)})` });
  };

  cmp("Safe drops", components.safeDrops, i.pos.safeDropTotal, "Drop slips and POS safe drops");
  cmp("Payouts", components.payouts, i.pos.payoutTotal, "Payout sheets and POS pay-outs");
  if (allPayouts.length !== i.pos.payoutCount) {
    checks.push({ name: "Payout count", status: "mismatch", detail: `${allPayouts.length} payout lines vs ${i.pos.payoutCount} on POS` });
  } else {
    checks.push({ name: "Payout count", status: "match", detail: `${allPayouts.length} payout lines` });
  }
  if (i.localAccountSheetTotal === undefined) {
    checks.push({ name: "Local accounts", status: "not-checked", detail: "No account sheet total entered" });
  } else {
    cmp("Local accounts", i.localAccountSheetTotal, i.pos.localAccountTotal, "Account sheets and POS local accounts");
  }

  // Logins are matched by POS cashier number on the staff record, never by spelling of names.
  const same = i.submittingCashier.posCashierNo === i.pos.cashierNo;
  checks.push({ name: "POS login", status: same ? "match" : "mismatch",
    detail: same ? `POS login ${i.pos.cashierNo} belongs to ${i.submittingCashier.name}`
      : `POS login ${i.pos.cashierNo} ("${i.pos.cashierName}") but shift submitted by ${i.submittingCashier.name}` });

  for (const r of [...p.customerRebates, ...p.taxiRebates, ...p.bowserRebates]) {
    const rate = i.rebateRates?.[`${r.customer}|${r.grade ?? "*"}`] ?? i.rebateRates?.[`${r.customer}|*`];
    if (rate === undefined || r.litres === undefined) {
      checks.push({ name: `Rebate rate: ${r.customer}`, status: "not-checked",
        detail: r.litres === undefined ? "No litres recorded" : "No agreed rate on file" });
      continue;
    }
    // The POS truncates rebates to the cent (11.16 L x R0.80 = R8.928 -> R8.92), confirmed on 30 Sep.
    const expected = Math.floor((r.litres * rate) / 100); // centilitres x cents/L / 100
    const d = r.amount - expected;
    checks.push({ name: `Rebate rate: ${r.customer}`, status: d === 0 ? "match" : "mismatch", difference: d,
      detail: d === 0 ? `Paid ${showRand(r.amount)} at agreed rate` : `Paid ${showRand(r.amount)}, agreed rate gives ${showRand(expected)}` });
  }

  return { shiftNo: i.shiftNo, accounted, shortOver, label, components, checks };
}

