// Acceptance test no. 1: real Perth Road papers for 30 September 2026 (spec section 10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rand as R, litres as L } from "../src/units.js";
import { reconcileCashUp, CashUpInput } from "../src/cashup.js";
import { pumpsVsPos, tankReconciliation, deliveryCheck, PumpReading } from "../src/fuel.js";

const line = (label: string, amount: string) => ({ label, amount: R(amount) });
const reb = (customer: string, l: string | undefined, amount: string) =>
  ({ label: customer, customer, amount: R(amount), litres: l === undefined ? undefined : L(l) });

const day: CashUpInput = {
  shiftNo: 482,
  submittingCashier: { name: "Suzan" }, // POS cashier no. not on her staff record (open question)
  pos: { cashierNo: "2173", cashierName: "Penelope. T", salesTotal: R("358,606.60"), safeDropTotal: R("9,880.00"),
    payoutTotal: R("2,556.24"), payoutCount: 32, localAccountTotal: R("161,676.77") },
  safeDrops: ["2000", "2000", "3000", "2000", "880"].map(R),
  coins: 0,
  cardBatches: [line("939", "20,786.53"), line("861", "15,283.07"), line("940", "14,616.71"),
    line("862", "22,514.74"), line("816", "59,005.71"), line("63", "37,258.38")],
  vouchers: [],
  totalCard: [line("TSN 2047", "1,346.00")],
  localAccountSheetTotal: R("161,676.71"),
  unpaids: [
    { label: "City to City", amount: R("9,450.34"), kind: "account" },
    { label: "JHB Water", amount: R("2,204.53"), kind: "customer" },
    { label: "Zamalangeni (4x oil)", amount: R("299.96"), kind: "account" },
    { label: "Raid (coolant)", amount: R("149.99"), kind: "customer" },
    { label: "Joshua overfill", amount: R("67.59"), kind: "staff-overfill" },
    { label: "City to City", amount: R("1,964.08"), kind: "account" },
    { label: "Kevin overfill", amount: R("103.00"), kind: "staff-overfill" },
    { label: "Gift of the Givers", amount: R("9,000.00"), kind: "customer" },
  ],
  unpaidPaid: [line("JHB Theatre", "1,921.40"), line("JHB Theatre", "2,681.25"),
    line("JHB Theatre", "2,114.65"), line("JHB Theatre", "2,840.62")],
  payouts: {
    customerRebates: [
      reb("Bliss", "37.56", "30.04"), reb("Gift of the Givers", "39.56", "79.12"), reb("JHB Water", "63.77", "127.54"),
      reb("Ambulance", "38.74", "77.48"), reb("Leano", "56.15", "44.92"), reb("UJ", "34.55", "51.82"),
      reb("AD", "60.91", "91.36"), reb("Ambulance", "61.30", "122.60"), reb("JHB Theatre", "44.49", "35.59"),
      reb("CSBC", "48.40", "29.04"), reb("Macro Med", "38.63", "23.17"), reb("UJ", "44.41", "35.52"),
      reb("Doves", "60.39", "60.39"), reb("Forensic", "62.91", "125.82"), reb("Prasa", "68.71", "41.22"),
      reb("GHHS", "34.57", "20.74"), reb("Fits", "52.21", "31.32"), reb("UJ", "63.62", "50.89"),
      reb("Ambulance", "33.59", "67.18"), reb("Alert", "58.00", "34.80"), reb("Plasser", "250.00", "500.00"),
      reb("UJ", "54.92", "43.93"), reb("Ambulance", undefined, "124.64"), reb("Fits", "31.11", "18.66"),
      reb("EMS", "21.30", "31.95"), reb("Gift of the Givers", "260.34", "520.68"), reb("Blink", "41.94", "83.88"),
    ],
    taxiRebates: [reb("Taxi", "11.15", "8.92"), reb("Taxi", "11.16", "8.92"), reb("Taxi", "9.29", "7.43"),
      reb("Taxi", "11.15", "8.84"), reb("Taxi", "22.29", "17.83")],
    bowserRebates: [], expenses: [],
  },
  rebateRates: { "Taxi|*": 80 }, // R0.80/L, confirmed by every taxi line; other rates still to be supplied
};

const night: CashUpInput = {
  shiftNo: 483,
  submittingCashier: { name: "Pontsho", posCashierNo: "8656" },
  pos: { cashierNo: "8656", cashierName: "Ponsho", salesTotal: R("135,812.30"), safeDropTotal: R("7,180.00"),
    payoutTotal: R("325.24"), payoutCount: 12, localAccountTotal: R("71,439.43") },
  safeDrops: ["3000", "2600", "1470", "110"].map(R),
  coins: 0,
  cardBatches: [line("863", "9,208.61"), line("941", "1,304.84"), line("64", "5,111.40"),
    line("817", "22,479.42"), line("942", "13,717.81"), line("65", "2,360.36")],
  vouchers: [], totalCard: [],
  localAccountSheetTotal: R("71,439.43"),
  unpaids: [{ label: "JHB Theatre", amount: R("2,682.63"), kind: "customer" }],
  unpaidPaid: [],
  payouts: {
    customerRebates: [reb("Ampath", "26.90", "16.14"), reb("Ampath", "23.26", "13.95"), reb("JHB Theatre", "77.60", "155.20"),
      reb("UJ", "31.55", "25.24"), reb("National Health", "49.97", "29.98")],
    taxiRebates: [reb("Taxi", "11.15", "8.92"), reb("Taxi", "18.57", "14.85"), reb("Taxi", "23.41", "18.72"),
      reb("Taxi", "9.31", "7.44"), reb("Taxi", "22.30", "17.84"), reb("Taxi", "11.15", "8.92"), reb("Taxi", "10.05", "8.04")],
    bowserRebates: [], expenses: [],
  },
  rebateRates: { "Taxi|*": 80 },
};

const status = (r: ReturnType<typeof reconcileCashUp>, name: string) => r.checks.find((c) => c.name === name)?.status;

test("Day shift 482 reproduces Page 7: short R0.88", () => {
  const r = reconcileCashUp(day);
  assert.equal(r.accounted, R("358,605.72"));
  assert.equal(r.shortOver, R("0.88"));
  assert.equal(r.label, "Short R0.88");
  assert.equal(r.components.unpaids, R("23,239.49"));
  assert.equal(r.components.cardBatches, R("169,465.14"));
});

test("Day shift 482 cross-checks", () => {
  const r = reconcileCashUp(day);
  assert.equal(status(r, "Safe drops"), "match");
  assert.equal(status(r, "Payouts"), "match");
  assert.equal(status(r, "Payout count"), "match");
  const acc = r.checks.find((c) => c.name === "Local accounts")!;
  assert.equal(acc.status, "mismatch");
  assert.equal(acc.difference, R("-0.06"));
  assert.equal(status(r, "POS login"), "mismatch"); // Penelope's login on Suzan's shift
  const taxi = r.checks.filter((c) => c.name === "Rebate rate: Taxi");
  assert.equal(taxi.length, 5);
  // 4 of 5 match R0.80/L. Line 4 (11.15 L paid R8.84) should be R8.92: either 8c underpaid
  // or the litres were 11.05 and miswritten. The app must flag it.
  assert.deepEqual(taxi.map((c) => c.status), ["match", "match", "match", "mismatch", "match"]);
  assert.equal(taxi[3].difference, R("-0.08"));
});

test("Night shift 483 reproduces Page 7: short R2.56", () => {
  const r = reconcileCashUp(night);
  assert.equal(r.accounted, R("135,809.74"));
  assert.equal(r.shortOver, R("2.56"));
  assert.equal(status(r, "Safe drops"), "match");
  assert.equal(status(r, "Payouts"), "match");
  assert.equal(status(r, "Local accounts"), "match");
  assert.ok(r.checks.filter((c) => c.name === "Rebate rate: Taxi").every((c) => c.status === "match"));
  assert.equal(status(r, "POS login"), "match"); // "Ponsho" on POS is Pontsho's login 8656
});

const D = "D50", U95 = "ULP95", U93 = "ULP93";
const pumps = (rows: [number, "D50" | "ULP95" | "ULP93", number, number][]): PumpReading[] =>
  rows.map(([pump, grade, opening, closing]) => ({ pump, grade, opening, closing }));
const dayPumps = pumps([[1, U95, 2236971, 2237889], [2, D, 7798616, 7800719], [3, D, 2922556, 2925268],
  [4, U95, 1866796, 1867207], [5, D, 4613822, 4616071], [6, U93, 2106981, 2107090], [7, D, 4002158, 4003025],
  [8, U95, 1905461, 1906070], [9, U95, 2746867, 2747653], [10, D, 3784419, 3785180]]);
const nightPumps = pumps([[1, U95, 2237889, 2238197], [2, D, 7800719, 7801437], [3, D, 2925268, 2926403],
  [4, U95, 1867207, 1867370], [5, D, 4616071, 4617113], [6, U93, 2107090, 2107246], [7, D, 4003025, 4003489],
  [8, U95, 1906070, 1906152], [9, U95, 2747653, 2747908], [10, D, 3785180, 3785253]]);

test("Pump readings: day 11,525 L, night 4,396 L", () => {
  const total = (rs: PumpReading[]) => rs.reduce((a, r) => a + r.closing - r.opening, 0);
  assert.equal(total(dayPumps), 11525);
  assert.equal(total(nightPumps), 4396);
});

test("Pumps vs POS over 24 h: only ULP 95 outside rounding (+13.87 L)", () => {
  const all = pumps(dayPumps.map((d, i) => [d.pump, d.grade, d.opening, nightPumps[i].closing]));
  const res = pumpsVsPos(all, { D50: L("12,122.64"), ULP95: L("3,518.13"), ULP93: L("265.48") });
  const by = Object.fromEntries(res.map((r) => [r.grade, r]));
  assert.equal(by.D50.difference, L("1.36")); assert.ok(by.D50.withinRounding);
  assert.equal(by.ULP93.difference, L("-0.48")); assert.ok(by.ULP93.withinRounding);
  assert.equal(by.ULP95.difference, L("13.87")); assert.equal(by.ULP95.withinRounding, false);
});

test("Tank reconciliation 06:00 30 Sep to 06:00 1 Oct", () => {
  const diesel = tankReconciliation({ openingTC: L(13303 + 8310 + 9092), delivered: L(19161), posSold: L("12,122.64"), closingTC: L(16329 + 10862 + 10590) });
  assert.equal(diesel.expectedClosing, L("37,743.36"));
  assert.equal(diesel.variance, L("37.64"));
  const u95 = tankReconciliation({ openingTC: L(17554), delivered: L(4804), posSold: L("3,518.13"), closingTC: L(18783) });
  assert.equal(u95.variance, L("-56.87"));
  const u93 = tankReconciliation({ openingTC: L(5219), delivered: 0, posSold: L("265.48"), closingTC: L(4955) });
  assert.equal(u93.variance, L("1.48"));
});

test("Delivery 3017884981: undelivered fuel fully explained by the return", () => {
  const u95 = deliveryCheck({ bolLoaded20C: L(4040 + 4042), truckMeter20C: L(4804), returnedRecorded: L(3278) });
  assert.equal(u95.notDelivered, L(3278)); assert.equal(u95.unexplained, 0);
  const d50 = deliveryCheck({ bolLoaded20C: L(5031 + 5029 + 10057), truckMeter20C: L(5320 + 4753 + 9088), returnedRecorded: L(956) });
  assert.equal(d50.notDelivered, L(956)); assert.equal(d50.unexplained, 0);
});

test("Bad input is refused, not guessed", () => {
  assert.throws(() => R("12.345"));
  assert.throws(() => R("abc"));
  assert.throws(() => pumpsVsPos(pumps([[1, U95, 100, 90]]), { D50: 0, ULP95: 0, ULP93: 0 }));
});
