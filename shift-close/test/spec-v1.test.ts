// Spec v1 checks added in v0.5: delivery notes, dips, tank levels, written Page 7, discounts, streaks, order room.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rand as R, litres as L } from "../src/units.js";
import { evaluateShift, lossStreak, orderRoom, localSheetTotal } from "../src/evaluate.js";
import { settings, day30, night30 } from "../seed/seed.js";

test("Delivery note 3017884981: not-delivered fuel matches the recorded returns (info, not red)", () => {
  const r = evaluateShift(day30, settings, null);
  const u95 = r.fuel.deliveryNotes.find((d) => d.grade === "ULP95")!;
  assert.equal(u95.notDelivered, L(3278)); assert.equal(u95.unexplained, 0);
  const d50 = r.fuel.deliveryNotes.find((d) => d.grade === "D50")!;
  assert.equal(d50.notDelivered, L(956)); assert.equal(d50.unexplained, 0);
  assert.ok(!r.alerts.some((a) => a.level === "red" && a.text.includes("delivery:")));
  assert.ok(r.alerts.some((a) => a.level === "info" && a.text.startsWith("ULP 95 delivery: 3,278.00 L not delivered")));
});

test("Fuel not delivered with no return recorded is red", () => {
  const bad = { ...day30, deliveryNotes: [{ grade: "ULP95" as const, bol: L(8082), returned: 0 }] };
  const r = evaluateShift(bad, settings, null);
  assert.ok(r.alerts.some((a) => a.level === "red" && a.text === "ULP 95 delivery: 3,278.00 L loaded but neither delivered nor recorded as returned"));
});

test("Delivery gauge vs truck: Tank 5 (+4.5%) is red, Tank 3 (+2.1%) red, Tank 2 (-1.0%) amber band", () => {
  const r = evaluateShift(day30, settings, null);
  const lv = (t: string) => r.alerts.find((a) => a.text.startsWith(`Delivery to tank ${t}:`))?.level;
  assert.equal(lv("5"), "red"); assert.equal(lv("3"), "red");
  assert.equal(lv("2"), "amber"); // 47 / 4804 = 0.98%: between 0.5% and 1%
  assert.equal(lv("1"), "red");   // 99 / 9088 = 1.09%
});

test("Stick dip vs gauge height: 10 mm green, 18 mm amber, 30 mm red", () => {
  const dip = (stickMm: number) => ({ ...night30, tanks: { ...night30.tanks, dip: { "2": { gaugeMm: 1500, stickMm } } } });
  assert.ok(!evaluateShift(dip(1510), settings, day30).alerts.some((a) => a.text.startsWith("Tank 2: stick dip")));
  assert.equal(evaluateShift(dip(1482), settings, day30).alerts.find((a) => a.text.startsWith("Tank 2: stick dip"))!.level, "amber");
  assert.equal(evaluateShift(dip(1530), settings, day30).alerts.find((a) => a.text.startsWith("Tank 2: stick dip"))!.text, "Tank 2: stick dip 1530 mm vs gauge 1500 mm (+30 mm)");
});

test("Tank level below 25% is amber, below 15% red; any water is red", () => {
  const close = (v: number) => ({ ...night30, tanks: { ...night30.tanks, close: { ...night30.tanks!.close, "4": L(v) } } });
  const lv = (v: number) => evaluateShift(close(v), settings, day30).alerts.find((a) => a.text.startsWith("Tank 4 (ULP 93) is at"))?.level;
  assert.equal(lv(4955), undefined); assert.equal(lv(2000), "amber"); assert.equal(lv(1200), "red");
  const wet = { ...night30, tanks: { ...night30.tanks, water: { "3": 4 } } };
  assert.ok(evaluateShift(wet, settings, day30).alerts.some((a) => a.level === "red" && a.text === "Tank 3: 4 mm of water on the gauge"));
});

test("Written Page 7 result: correct passes, wrong amount or wrong direction is red", () => {
  const w = (amount: string, direction: "short" | "over") => evaluateShift({ ...night30, stated: { amount: R(amount), direction } }, settings, day30);
  assert.equal(w("2.56", "short").stated!.ok, true);
  assert.ok(!w("2.56", "short").alerts.some((a) => a.text.startsWith("Page 7")));
  assert.ok(w("2.65", "short").alerts.some((a) => a.level === "red" && a.text === "Page 7 written as short R2.65, but the calculation gives short R2.56"));
  assert.equal(w("2.56", "over").stated!.directionOk, false);
});

test("Manual discounts are amber; automatic discounts are not flagged", () => {
  const d = (m: number | null) => evaluateShift({ ...day30, pos: { ...day30.pos, discountsAuto: R("18189.00"), discountsManual: m } }, settings, null);
  assert.ok(!d(null).alerts.some((a) => a.text.startsWith("Manual discounts")));
  assert.ok(d(R("4208.00")).alerts.some((a) => a.level === "amber" && a.text.startsWith("Manual discounts on the POS: R4,208.00")));
});

test("Account lines replace the typed sheet total", () => {
  const lines = [{ account: "City to City", amt: R("100000.00") }, { account: "UJ", amt: R("61676.71") }];
  assert.equal(localSheetTotal({ ...day30, accounts: lines }), R("161676.71"));
  const r = evaluateShift({ ...day30, localSheet: null, accounts: lines }, settings, null);
  assert.equal(r.cash.checks.find((c) => c.name === "Local accounts")!.difference, R("-0.06"));
});

test("Loss streak counts consecutive losses at the end, ignoring tiny ones", () => {
  assert.equal(lossStreak([L(-10), L(-20), L(-30)]), 3);
  assert.equal(lossStreak([L(-10), L(5), L(-20), L(-30)]), 2);
  assert.equal(lossStreak([L(-10), null, L(-30)]), 1);
  assert.equal(lossStreak([L(-3)], L(5)), 0);
});

test("Order room at 90% safe fill from the 06:03 1 Oct gauge readings", () => {
  const r = orderRoom({ ...settings, safeFillPct: 90 }, night30.tanks!.close!);
  const by = Object.fromEntries(r.map((x) => [x.grade, x]));
  assert.equal(by.ULP95.room, L(Math.floor(22730 * 0.9 * 100) / 100 - 18783)); // 20,457 - 18,783
  assert.equal(by.D50.capacity, L(22730 + 13640 + 13640));
  assert.equal(by.D50.room, L(45009 - (16329 + 10862 + 10590)));
  assert.equal(orderRoom({ ...settings, safeFillPct: 90 }, night30.tanks!.close!, { ULP93: L(3000) }).find((x) => x.grade === "ULP93")!.room, L(7731 - 4955 + 3000));
});
