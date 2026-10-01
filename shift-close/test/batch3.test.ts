// Acceptance test no. 3: 14 real shifts, 10-30 Sep 2026 (page-7 lines as written).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rand as R } from "../src/units.js";
import { reconcileCashUp, CashUpInput } from "../src/cashup.js";
import { statedResultCheck, pumpContinuity, totalCardCheck } from "../src/checks.js";

type Row = [string, string, string, string, string, string, string, string, string, string, string, string, ("short" | "over" | undefined)];
// label, sales, drops, coins, batches, vouchers, totalCard, localAcc, unpaids, unpaidPaid, payouts, stated, statedDir
const rows: Row[] = [
  ["10 Sep day 440", "358488.85", "8130", "2", "134948.98", "52163.67", "2271.25", "153110.38", "6397.26", "2402.33", "3863.71", "3.93", "short"],
  ["10 Sep night 441", "114542.76", "11420", "3", "24248.50", "5887.41", "0", "72628.95", "0", "0", "352.27", "2.63", "short"],
  ["11 Sep day 442", "377700.76", "17890", "5", "144091.66", "39877.89", "3922.85", "167815.53", "1773.42", "3076.42", "5393.55", "7.26", "short"],
  ["11 Sep night 443", "149488.93", "8910", "0", "80245.48", "12903.13", "6914.00", "38579.01", "1113.25", "0", "823.58", "0.48", "short"],
  ["12 Sep night 445", "78807.83", "3220", "0", "54931.92", "15231.58", "0", "4167.42", "0", "0", "1256.28", "0.63", "over"],
  ["13 Sep day 446", "168550.19", "13500", "0", "92888.38", "10537.36", "0", "50059.38", "0", "0", "1560.08", "4.99", undefined],
  ["13 Sep night 447", "114968.99", "7080", "2", "48013.98", "12769.07", "34570.00", "11452.80", "0", "0", "1081.77", "0.63", undefined],
  ["19 Sep night 461", "74199.73", "4210", "8", "64112.65", "0", "2342.81", "2184.02", "0", "0", "1341.13", "1.13", "short"],
  ["20 Sep day 462", "226370.25", "11850", "0", "102139.65", "0", "0", "62256.33", "48398.55", "0", "1762.41", "36.94", "over"],
  ["20 Sep night 463", "81577.62", "9190", "5", "55335.60", "0", "0", "4250.00", "12247.74", "0", "545.37", "3.61", "short"],
  ["23 Sep day 468", "231519.13", "5270", "2", "206686.45", "0", "0", "38118.85", "9059.55", "37822.63", "10207.64", "2.73", "over"],
  ["23 Sep night 469", "95075.99", "7130", "0", "68699.65", "0", "0", "10799.79", "7381.96", "0", "1058.02", "6.57", "short"],
];
// Expected after recalculation (positive = short)
const expected: Record<string, string> = {
  "10 Sep day 440": "3.93", "10 Sep night 441": "2.63", "11 Sep day 442": "7.28", "11 Sep night 443": "0.48",
  "12 Sep night 445": "0.63", "13 Sep day 446": "4.99", "13 Sep night 447": "-0.63", "19 Sep night 461": "1.12",
  "20 Sep day 462": "-36.69", "20 Sep night 463": "3.91", "23 Sep day 468": "-2.73", "23 Sep night 469": "6.57" };
const wrongAmount = ["11 Sep day 442", "19 Sep night 461", "20 Sep day 462", "20 Sep night 463"];
const wrongDirection = ["12 Sep night 445"];

const input = (r: Row): CashUpInput => ({
  shiftNo: 0, submittingCashier: { name: "-" },
  pos: { cashierNo: "-", cashierName: "-", salesTotal: R(r[1]), safeDropTotal: R(r[2]), payoutTotal: R(r[10]), payoutCount: 1, localAccountTotal: R(r[7]) },
  safeDrops: [R(r[2])], coins: R(r[3]), cardBatches: [{ label: "batches", amount: R(r[4]) }],
  vouchers: [{ label: "vouchers", amount: R(r[5]) }], totalCard: [{ label: "tc", amount: R(r[6]) }],
  unpaids: [{ label: "unpaids", amount: R(r[8]), kind: "customer" }], unpaidPaid: [{ label: "up", amount: R(r[9]) }],
  payouts: { customerRebates: [], taxiRebates: [], bowserRebates: [], expenses: [{ label: "payouts", amount: R(r[10]) }] },
});

test("12 real shifts: engine recomputes every Page 7 and catches 4 arithmetic slips and 1 wrong direction", () => {
  for (const r of rows) {
    const res = reconcileCashUp(input(r));
    assert.equal(res.shortOver, R(expected[r[0]]), r[0]);
    const chk = statedResultCheck(res.shortOver, { amount: R(r[11]), direction: r[12] });
    assert.equal(chk.amountOk, !wrongAmount.includes(r[0]), `${r[0]} amount`);
    assert.equal(chk.directionOk, !wrongDirection.includes(r[0]), `${r[0]} direction`);
  }
});

test("20 Sep: pump 3 closing written 2908843 but night opening is 2908543 (300 L break)", () => {
  const day20close = { 1: 2226847, 2: 7778499, 3: 2908843, 4: 1859486, 5: 4605621, 6: 2103430, 7: 3994073, 8: 1900082, 9: 2736925, 10: 3771092 };
  const night20open = { ...day20close, 3: 2908543 };
  const c = pumpContinuity(day20close, night20open);
  assert.equal(c.breaks.length, 1);
  assert.deepEqual(c.breaks[0], { pump: 3, previousClosing: 2908843, opening: 2908543, gap: -300 });
});

test("Total Card: POS amount vs card terminal amount", () => {
  assert.equal(totalCardCheck({ posAmount: R("34570.00"), cardAmount: R("29985.00") }).difference, R("4585.00")); // 13 Sep night
  assert.equal(totalCardCheck({ posAmount: R("6914.00"), cardAmount: R("5997.00") }).difference, R("917.00"));   // 11 Sep night
  assert.equal(totalCardCheck({ posAmount: R("2271.25"), cardAmount: R("1970.01") }).difference, R("301.24"));   // 10 Sep day
});
