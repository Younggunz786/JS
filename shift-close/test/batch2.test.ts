// Acceptance test no. 2: second batch of real Perth Road papers (22, 26, 29, 30 Sep and 1 Oct 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rand as R, litres as L } from "../src/units.js";
import { tankReconciliation, dropCheck } from "../src/fuel.js";
import { slipConsistent, slipSequenceConsistent, PosSlip } from "../src/posslip.js";

// Gauge TC volumes (L): 06:02 30 Sep, 18:14 30 Sep, 06:03 1 Oct
const open = { D: 13303 + 8310 + 9092, U95: 17554, U93: 5219 };
const mid = { D: 17987 + 11596 + 11683, U95: 19594, U93: 5109 };
const close = { D: 16329 + 10862 + 10590, U95: 18783, U93: 4955 };
// Pump meter litres per shift (from the shift sheets)
const day = { D: 8692, U95: 2724, U93: 109 }, night = { D: 3432, U95: 808, U93: 156 };

test("30 Sep split by shift: the ULP 95 loss is all on the delivery (day) shift", () => {
  const v = (o: number, del: number, sold: number, c: number) =>
    tankReconciliation({ openingTC: L(o), delivered: L(del), posSold: L(sold), closingTC: L(c) }).variance;
  assert.equal(v(open.U95, 4804, day.U95, mid.U95), L(-40));
  assert.equal(v(mid.U95, 0, night.U95, close.U95), L(-3));
  assert.equal(v(open.D, 19161, day.D, mid.D), L(92));
  assert.equal(v(mid.D, 0, night.D, close.D), L(-53));
  assert.equal(v(open.U93, 0, day.U93, mid.U93), L(-1));
  assert.equal(v(mid.U93, 0, night.U93, close.U93), L(2));
});

test("Gauge vs truck meter per drop: Tank 5 reads ~4.5% high, Tanks 1 and 2 read ~1% low", () => {
  const drops = [
    { d: "29 Sep", tank: 1, truck: 8014, gauge: 7963 },
    { d: "29 Sep", tank: 5, truck: 2004, gauge: 2096 },
    { d: "30 Sep", tank: 2, truck: 4804, gauge: 4757 },
    { d: "30 Sep", tank: 3, truck: 5320, gauge: 5431 },
    { d: "30 Sep", tank: 5, truck: 4753, gauge: 4965 },
    { d: "30 Sep", tank: 1, truck: 9088, gauge: 8989 },
  ].map((x) => ({ ...x, r: dropCheck({ tank: x.tank, truckMeter20C: L(x.truck), gaugeTCIncrease: L(x.gauge) }) }));
  const t5 = drops.filter((x) => x.tank === 5);
  assert.ok(t5.every((x) => x.r.pct > 4 && x.r.pct < 5));
  assert.ok(drops.filter((x) => x.tank === 1).every((x) => x.r.pct < 0));
  assert.equal(drops.find((x) => x.tank === 2)!.r.difference, L(-47));
});

const slip = (shiftNo: number, cashierNo: string, t: Record<string, string>, total: string, sales: string, pay: string): PosSlip => ({
  shiftNo, cashierNo, tenders: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, R(v)])),
  totalPayment: R(total), salesTotal: R(sales), payOut: R(pay), businessTotal: R(total) });

const s483 = [
  slip(483, "8656", { cash: "1000.21", fuel: "10198.93" }, "11199.14", "11199.14", "0"),
  slip(483, "8656", { cash: "3093.49", fuel: "30561.03", acc: "35281.41" }, "68935.93", "68974.94", "39.01"),
  slip(483, "8656", { cash: "4178.78", fuel: "55454.72", acc: "71439.43" }, "131072.93", "131337.21", "264.28"),
  slip(483, "8656", { cash: "7261.43", fuel: "56786.20", acc: "71439.43" }, "135487.06", "135812.30", "325.24"),
];
const s482final = slip(482, "2173", { cash: "13223.74", bank: "71835.77", fuel: "107968.08", totalCard: "1346.00", acc: "161676.77" }, "356050.36", "358606.60", "2556.24");
const s484 = [
  slip(484, "5294", { cash: "1006.50", bank: "3817.36", fuel: "18797.08", acc: "1000.00" }, "24620.94", "24755.37", "134.43"),
  slip(484, "5294", { cash: "5511.06", bank: "16478.28", fuel: "67372.51", acc: "42079.47" }, "131441.32", "133164.59", "1723.27"),
  slip(484, "5294", { cash: "7007.56", bank: "27992.73", fuel: "82752.42", acc: "76991.93" }, "194744.64", "196909.39", "2164.75"),
];

test("Every POS balancing slip adds up, and interim slips only ever go up", () => {
  for (const s of [...s483, s482final, ...s484]) assert.ok(slipConsistent(s).ok, JSON.stringify(slipConsistent(s).problems));
  assert.ok(slipSequenceConsistent(s483).ok);
  assert.ok(slipSequenceConsistent(s484).ok);
});

test("A tampered slip is caught", () => {
  const bad = { ...s483[3], tenders: { ...s483[3].tenders, cash: R("7161.43") } };
  assert.equal(slipConsistent(bad).ok, false);
  assert.equal(slipSequenceConsistent([s483[2], { ...s483[3], salesTotal: R("130000.00") }]).ok, false);
});
