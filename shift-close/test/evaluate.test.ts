// The app's single entry point, run on the real 30 Sep records it will be seeded with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rand as R, litres as L } from "../src/units.js";
import { evaluateShift, evaluateFuelDay } from "../src/evaluate.js";
import { settings, day30, night30 } from "../seed/seed.js";

test("Day 30 Sep: short R0.88, POS login flagged, ULP 95 tank loss, Tank 5 delivery flagged", () => {
  const r = evaluateShift(day30, settings, null);
  assert.equal(r.cash.shortOver, R("0.88"));
  assert.ok(r.alerts.some((a) => a.level === "red" && a.text.startsWith("POS login")));
  assert.ok(r.alerts.some((a) => a.text.startsWith("Local accounts")));
  assert.ok(r.alerts.some((a) => a.text.includes("Taxi") && a.level === "amber"));
  const u95 = r.fuel.tanks.find((t) => t.grade === "ULP95")!;
  assert.equal(u95.variance, L("-52.87"));  // 19594 - (17554 + 4804 - 2711.13)
  assert.ok(r.fuel.deliveries.some((d) => d.tank === 5 && d.flagged));
  assert.equal(r.missing.length, 0);
});

test("Night 30 Sep: short R2.56, pumps continue from day, POS login matches", () => {
  const r = evaluateShift(night30, settings, day30);
  assert.equal(r.cash.shortOver, R("2.56"));
  assert.equal(r.continuity!.ok, true);
  assert.ok(!r.alerts.some((a) => a.text.startsWith("POS login")));
  const d = r.fuel.tanks.find((t) => t.grade === "D50")!;
  assert.equal(d.variance, L("-65.56"));
});

test("A pump opening that does not match the previous closing is red", () => {
  const bad = { ...night30, pumps: { ...night30.pumps, "3": { open: 2925568, close: 2926403 } } };
  const r = evaluateShift(bad, settings, day30);
  assert.ok(r.alerts.some((a) => a.level === "red" && a.text.startsWith("Pump 3: opening")));
});

test("Total Card rebate at R4.585/L is accepted; anything else is red", () => {
  const ok = { ...night30, totalCard: [{ ref: "TSN 2033", grade: "D50" as const, litres: L(1000), amt: R("34570.00"), cardAmt: R("29985.00") }] };
  assert.equal(evaluateShift(ok, settings, null).totalCard[0].ok, true);
  const bad = { ...ok, totalCard: [{ ...ok.totalCard[0], cardAmt: R("29000.00") }] };
  const r = evaluateShift(bad, settings, null);
  assert.equal(r.totalCard[0].ok, false);
  assert.ok(r.alerts.some((a) => a.text.startsWith("Total Card TSN 2033")));
});

test("Deposita slip that differs from the drop is red", () => {
  const d = { ...night30, drops: [{ amt: R("520"), slip: R("730") }, ...night30.drops.slice(1)] };
  assert.ok(evaluateShift(d, settings, null).alerts.some((a) => a.level === "red" && a.text.startsWith("Safe drop 1")));
});

test("Fuel day 30 Sep matches the hand reconciliation: D50 +37.64, ULP95 -56.87 (red), ULP93 +1.48", () => {
  const r = evaluateFuelDay(day30, night30, settings);
  const g = Object.fromEntries(r.grades.map((x) => [x.grade, x]));
  assert.equal(g.D50.tank!.variance, L("37.64"));
  assert.equal(g.ULP95.tank!.variance, L("-56.87"));
  assert.equal(g.ULP93.tank!.variance, L("1.48"));
  assert.equal(g.ULP95.pumpDiff, L("13.87"));
  assert.ok(r.alerts.some((a) => a.level === "red" && a.text.startsWith("ULP 95 tanks")));
  assert.ok(r.alerts.some((a) => a.level === "red" && a.text.startsWith("ULP 95: pumps")));
  assert.ok(!r.alerts.some((a) => a.level === "red" && a.text.startsWith("Diesel 50 tanks")));
  assert.ok(!r.alerts.some((a) => a.text.startsWith("ULP 93")));
});
