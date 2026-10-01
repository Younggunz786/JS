// One entry point for the app: turn a stored shift record into every result and alert.
// All money is integer cents; all volumes integer centilitres (litres x 100).
import { Cents, Centilitres, sum, showRand, showLitres } from "./units.js";
import { reconcileCashUp } from "./cashup.js";
import { pumpsVsPos, tankReconciliation, dropCheck, deliveryCheck, dipHeightDifference, maxOrder, Grade } from "./fuel.js";
import { pumpContinuity, statedResultCheck } from "./checks.js";

export interface ShiftDoc {
  date: string; period: "day" | "night";
  cashierName?: string; cashierPosNo?: string; posShiftNo?: string;
  pumps: Record<string, { open?: number | null; close?: number | null }>;
  pos: {
    sales?: Cents | null; cash?: Cents | null; cards?: Cents | null; localAccounts?: Cents | null;
    safeDrops?: Cents | null; payouts?: Cents | null; payoutCount?: number | null;
    cashierNo?: string; cashierName?: string;
    litres?: Partial<Record<Grade, Centilitres | null>>;
    discountsAuto?: Cents | null; discountsManual?: Cents | null;
  };
  /** The short/over written on the paper Page 7 (parallel run): checked against the calculation. */
  stated?: { amount?: Cents | null; direction?: "short" | "over" | "" };
  drops: { amt: Cents; slip?: Cents | null }[];
  coins?: Cents | null;
  batches: { ref?: string; amt: Cents }[];
  vouchers: { ref?: string; amt: Cents }[];
  totalCard: { ref?: string; grade?: Grade; litres?: Centilitres | null; amt: Cents; cardAmt?: Cents | null }[];
  localSheet?: Cents | null;
  /** Local account sale lines. When present, their sum is the account sheet total (a total is never typed). */
  accounts?: { account: string; reg?: string; km?: number | null; litres?: Centilitres | null; amt: Cents | null }[];
  unpaids: { who: string; kind?: "customer" | "account" | "staff-overfill"; amt: Cents; note?: string }[];
  unpaidPaid: { who: string; amt: Cents }[];
  payouts: { type: "customer" | "taxi" | "bowser" | "expense"; who?: string; grade?: Grade | ""; litres?: Centilitres | null; amt: Cents }[];
  tanks?: {
    open?: Record<string, Centilitres | null>; close?: Record<string, Centilitres | null>;
    /** Closing gauge height and manual stick dip, in mm (5.6). */
    dip?: Record<string, { gaugeMm?: number | null; stickMm?: number | null }>;
    /** Water reported by the gauge at close, in mm. */
    water?: Record<string, number | null>;
  };
  deliveries?: { tank: string; truck: Centilitres; gauge?: Centilitres | null }[];
  /** Delivery note / BOL per grade: loaded at 20°C and the volume recorded as returned (5.4). */
  deliveryNotes?: { ref?: string; grade: Grade; bol: Centilitres | null; returned?: Centilitres | null }[];
}

export interface Settings {
  pumps: Record<string, Grade>;
  tanks: Record<string, { grade: Grade; capacity: number }>;
  rates: Record<string, number>;          // cents per litre, key "customer|grade" or "customer|*"
  taxiRate: number;                       // cents per litre
  totalCardRebate: Partial<Record<Grade, number>>; // thousandths of a rand per litre (R4.585 = 4585)
  tol: {
    cashAmber: Cents; cashRed: Cents; pumpPct: number; tankPct: number; dropPct: number;
    dropAmberPct?: number; dipAmberMm?: number; dipRedMm?: number; tankLowAmberPct?: number; tankLowRedPct?: number;
  };
  staff: { name: string; posNo?: string }[];
  /** Order up to this % of gauge capacity (5.5). */
  safeFillPct?: number;
}

/** Tolerances added after v0.4, with the spec section 6 starting values. */
export const TOL_DEFAULTS = { dropAmberPct: 0.5, dipAmberMm: 10, dipRedMm: 25, tankLowAmberPct: 25, tankLowRedPct: 15 };
const tolOf = (s: Settings) => ({ ...TOL_DEFAULTS, ...Object.fromEntries(Object.entries(s.tol).filter(([, v]) => typeof v === "number")) }) as Settings["tol"] & typeof TOL_DEFAULTS;

/** The account sheet total: the sum of account lines when any are entered, else the typed sheet total. */
export function localSheetTotal(doc: ShiftDoc): Cents | null {
  const lines = (doc.accounts || []).filter((a) => typeof a.amt === "number");
  if (lines.length) return sum(lines.map((a) => a.amt as number));
  return typeof doc.localSheet === "number" ? doc.localSheet : null;
}

export type Level = "red" | "amber" | "info";
export interface Alert { level: Level; area: "cash" | "fuel" | "paperwork"; text: string }

const GRADE_NAME: Record<Grade, string> = { D50: "Diesel 50", ULP95: "ULP 95", ULP93: "ULP 93" };
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const norm = (s = "") => s.trim().toLowerCase();

export function evaluateShift(doc: ShiftDoc, s: Settings, prev?: ShiftDoc | null) {
  const alerts: Alert[] = [];
  const tol = tolOf(s);
  doc = { ...doc, localSheet: localSheetTotal(doc) };
  const missing: string[] = [];
  const pos = doc.pos || {};
  if (num(pos.sales) === null) missing.push("POS sales total");

  // ---- Cash-up (Page 7) ----
  const rateFor = (who = "", grade = "") => {
    const k = Object.keys(s.rates).find((key) => {
      const [c, g] = key.split("|");
      return norm(c) === norm(who) && (g === grade || g === "*");
    });
    return k ? s.rates[k] : undefined;
  };
  const staffRec = s.staff.find((x) => norm(x.name) === norm(doc.cashierName));
  const asRebate = (p: ShiftDoc["payouts"][number]) => ({
    label: p.who || p.type, customer: p.type === "taxi" ? "Taxi" : (p.who || ""), amount: p.amt,
    litres: num(p.litres) ?? undefined, grade: p.grade || undefined,
  });
  const rates: Record<string, number> = { "Taxi|*": s.taxiRate };
  for (const p of doc.payouts) {
    if (p.type === "customer" || p.type === "bowser") {
      const r = rateFor(p.who, p.grade || "");
      if (r !== undefined) rates[`${p.who}|${p.grade || "*"}`] = r;
    }
  }
  const cash = reconcileCashUp({
    shiftNo: Number(doc.posShiftNo) || 0,
    submittingCashier: { name: doc.cashierName || "", posCashierNo: staffRec?.posNo ?? doc.cashierPosNo },
    pos: {
      cashierNo: pos.cashierNo || "", cashierName: pos.cashierName || "",
      salesTotal: num(pos.sales) ?? 0, safeDropTotal: num(pos.safeDrops) ?? 0,
      payoutTotal: num(pos.payouts) ?? 0, payoutCount: num(pos.payoutCount) ?? 0,
      localAccountTotal: num(pos.localAccounts) ?? num(doc.localSheet) ?? 0,
    },
    safeDrops: doc.drops.map((d) => d.amt), coins: num(doc.coins) ?? 0,
    cardBatches: doc.batches.map((b) => ({ label: b.ref || "batch", amount: b.amt })),
    vouchers: doc.vouchers.map((b) => ({ label: b.ref || "voucher", amount: b.amt })),
    totalCard: doc.totalCard.map((b) => ({ label: b.ref || "Total Card", amount: b.amt })),
    localAccountSheetTotal: num(doc.localSheet) ?? undefined,
    unpaids: doc.unpaids.map((u) => ({ label: u.who, amount: u.amt, kind: u.kind || "customer" })),
    unpaidPaid: doc.unpaidPaid.map((u) => ({ label: u.who, amount: u.amt })),
    payouts: {
      customerRebates: doc.payouts.filter((p) => p.type === "customer").map(asRebate),
      taxiRebates: doc.payouts.filter((p) => p.type === "taxi").map(asRebate),
      bowserRebates: doc.payouts.filter((p) => p.type === "bowser").map(asRebate),
      expenses: doc.payouts.filter((p) => p.type === "expense").map((p) => ({ label: p.who || "expense", amount: p.amt })),
    },
    rebateRates: rates,
  });

  // Checks that need POS figures only make sense when those were entered.
  const checks = cash.checks.filter((c) => {
    if (c.name === "Safe drops") return num(pos.safeDrops) !== null;
    if (c.name.startsWith("Payout")) return num(pos.payouts) !== null && (c.name !== "Payout count" || num(pos.payoutCount) !== null);
    if (c.name === "Local accounts") return num(pos.localAccounts) !== null;
    if (c.name === "POS login") return !!pos.cashierNo && !!(staffRec?.posNo ?? doc.cashierPosNo);
    return true;
  });

  // POS login that belongs to a different staff member
  if (pos.cashierNo) {
    const owner = s.staff.find((x) => x.posNo === pos.cashierNo);
    if (owner && norm(owner.name) !== norm(doc.cashierName) && !checks.some((c) => c.name === "POS login"))
      alerts.push({ level: "red", area: "cash", text: `POS login ${pos.cashierNo} belongs to ${owner.name}, but this shift was worked by ${doc.cashierName || "someone else"}` });
  }

  // Cash side vs card side (they add up to the total short/over when local accounts agree).
  let cashSide: Cents | null = null, cardSide: Cents | null = null;
  if (num(pos.cash) !== null) cashSide = (pos.cash as number) - cash.components.safeDrops - cash.components.coins;
  if (num(pos.cards) !== null)
    cardSide = (pos.cards as number) - (cash.components.cardBatches + cash.components.vouchers + cash.components.totalCard + cash.components.unpaids - cash.components.unpaidPaid);

  if (num(pos.sales) !== null) {
    const a = Math.abs(cash.shortOver);
    if (a > s.tol.cashRed) alerts.push({ level: "red", area: "cash", text: `Cash-up: ${cash.label}` });
    else if (a > s.tol.cashAmber) alerts.push({ level: "amber", area: "cash", text: `Cash-up: ${cash.label}` });
    if (cashSide !== null && cardSide !== null && Math.abs(cashSide) >= 10000 && Math.abs(cardSide) >= 10000 && Math.sign(cashSide) !== Math.sign(cardSide))
      alerts.push({ level: "info", area: "cash", text: `Cash ${cashSide > 0 ? "short" : "over"} ${showRand(Math.abs(cashSide))} offset by cards ${cardSide > 0 ? "short" : "over"} ${showRand(Math.abs(cardSide))}. If this is not how unpaids were rung up, check for sales on the wrong payment type.` });
  }
  for (const c of checks) if (c.status === "mismatch") alerts.push({ level: c.name.startsWith("Rebate") ? "amber" : "red", area: "cash", text: `${c.name}: ${c.detail}` });

  // Deposita slip vs drop amount
  doc.drops.forEach((d, i) => {
    if (num(d.slip) !== null && d.slip !== d.amt)
      alerts.push({ level: "red", area: "cash", text: `Safe drop ${i + 1}: drop R${(d.amt / 100).toFixed(2)} but Deposita slip says R${((d.slip as number) / 100).toFixed(2)}` });
  });

  // Total Card rebate check
  const tc = doc.totalCard.map((t, i) => {
    const rate = t.grade ? s.totalCardRebate[t.grade] : undefined;
    if (num(t.cardAmt) === null || num(t.litres) === null || rate === undefined) return { i, ok: null as boolean | null };
    const rebate = t.amt - (t.cardAmt as number);
    const expected = Math.round(((t.litres as number) * rate) / 1000);
    const ok = Math.abs(rebate - expected) <= 1;
    if (!ok) alerts.push({ level: "red", area: "cash", text: `Total Card ${t.ref || i + 1}: rebate ${showRand(rebate)} but agreed rate gives ${showRand(expected)}` });
    return { i, ok, rebate, expected };
  });

  // ---- Fuel ----
  const readings = Object.entries(doc.pumps || {})
    .filter(([, r]) => num(r?.open) !== null && num(r?.close) !== null)
    .map(([p, r]) => ({ pump: Number(p), grade: s.pumps[p], opening: r.open as number, closing: r.close as number }));
  const missingPumps = Object.keys(s.pumps).filter((p) => !readings.some((r) => r.pump === Number(p)));
  if (missingPumps.length) missing.push(`pump readings (${missingPumps.join(", ")})`);
  for (const r of readings) if (r.closing < r.opening) alerts.push({ level: "red", area: "paperwork", text: `Pump ${r.pump}: closing ${r.closing} is below opening ${r.opening}` });
  const okReadings = readings.filter((r) => r.closing >= r.opening);

  const posL = pos.litres || {};
  const grades: { grade: Grade; meterLitres: number; posLitres: number | null; difference: number | null; withinRounding: boolean | null }[] = [];
  for (const g of ["D50", "ULP95", "ULP93"] as Grade[]) {
    const rs = okReadings.filter((r) => r.grade === g);
    if (!rs.length) continue;
    const pl = num(posL[g]);
    if (pl === null) {
      grades.push({ grade: g, meterLitres: sum(rs.map((r) => (r.closing - r.opening) * 100)), posLitres: null, difference: null, withinRounding: null });
      continue;
    }
    const [res] = pumpsVsPos(rs, { D50: 0, ULP95: 0, ULP93: 0, [g]: pl } as Record<Grade, number>);
    grades.push(res);
    const pct = pl ? Math.abs(res.difference) / pl * 100 : 0;
    if (!res.withinRounding)
      alerts.push({ level: "amber", area: "fuel",
        text: `${GRADE_NAME[g]}: pumps dispensed ${showLitres(res.meterLitres)}, POS sold ${showLitres(pl)} (${res.difference > 0 ? "+" : ""}${showLitres(res.difference)})` });
  }

  // Pump continuity with the previous shift
  let continuity = null as null | ReturnType<typeof pumpContinuity>;
  if (prev) {
    const pc: Record<number, number> = {}, op: Record<number, number> = {};
    for (const [p, r] of Object.entries(prev.pumps || {})) if (num(r?.close) !== null) pc[Number(p)] = r.close as number;
    for (const [p, r] of Object.entries(doc.pumps || {})) if (num(r?.open) !== null) op[Number(p)] = r.open as number;
    continuity = pumpContinuity(pc, op);
    for (const b of continuity.breaks)
      alerts.push({ level: "red", area: "paperwork", text: `Pump ${b.pump}: opening ${b.opening} does not match previous closing ${b.previousClosing} (${b.gap > 0 ? "+" : ""}${b.gap} L)` });
  }

  // Tanks: per grade, opening + delivered - POS sold vs closing (gauge TC)
  const tanks: { grade: Grade; opening: number; delivered: number; sold: number; expectedClosing: number; closing: number; variance: number; pctOfSales: number }[] = [];
  const to = doc.tanks?.open || {}, tcl = doc.tanks?.close || {};
  for (const g of ["D50", "ULP95", "ULP93"] as Grade[]) {
    const ids = Object.keys(s.tanks).filter((t) => s.tanks[t].grade === g);
    if (!ids.length || ids.some((t) => num(to[t]) === null || num(tcl[t]) === null) || num(posL[g]) === null) continue;
    const opening = sum(ids.map((t) => to[t] as number)), closing = sum(ids.map((t) => tcl[t] as number));
    const delivered = sum((doc.deliveries || []).filter((d) => ids.includes(String(d.tank))).map((d) => d.truck));
    const r = tankReconciliation({ openingTC: opening, delivered, posSold: posL[g] as number, closingTC: closing });
    tanks.push({ grade: g, opening, delivered, sold: posL[g] as number, closing, ...r });
    const a = Math.abs(r.pctOfSales);
    if (a > s.tol.tankPct && Math.abs(r.variance) > ids.length * 500)
      alerts.push({ level: "amber", area: "fuel",
        text: `${GRADE_NAME[g]} tanks this shift: ${r.variance < 0 ? "loss" : "gain"} of ${showLitres(Math.abs(r.variance))} (${r.pctOfSales.toFixed(2)}% of sales)` });
  }
  if (!tanks.length) missing.push("tank gauge readings (opening and closing)");

  const drops = (doc.deliveries || []).filter((d) => num(d.gauge) !== null && d.truck > 0).map((d) => {
    const r = dropCheck({ tank: Number(d.tank), truckMeter20C: d.truck, gaugeTCIncrease: d.gauge as number });
    if (Math.abs(r.pct) > tol.dropAmberPct)
      alerts.push({ level: Math.abs(r.pct) > tol.dropPct ? "red" : "amber", area: "fuel", text: `Delivery to tank ${d.tank}: gauge rose ${showLitres(d.gauge as number)}, truck meter ${showLitres(d.truck)} (${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%)` });
    return r;
  });

  // 5.4 Delivery note: loaded - delivered must equal the volume recorded as returned.
  const deliveryNotes: { grade: Grade; loaded: number; delivered: number; returned: number; notDelivered: number; unexplained: number }[] = [];
  for (const g of ["D50", "ULP95", "ULP93"] as Grade[]) {
    const notes = (doc.deliveryNotes || []).filter((n) => n.grade === g && num(n.bol) !== null);
    if (!notes.length) continue;
    const ids = Object.keys(s.tanks).filter((t) => s.tanks[t].grade === g);
    const delivered = sum((doc.deliveries || []).filter((d) => ids.includes(String(d.tank)) && num(d.truck) !== null).map((d) => d.truck));
    const loaded = sum(notes.map((n) => n.bol as number)), returned = sum(notes.map((n) => num(n.returned) ?? 0));
    const r = deliveryCheck({ bolLoaded20C: loaded, truckMeter20C: delivered, returnedRecorded: returned });
    deliveryNotes.push({ grade: g, loaded, delivered, returned, notDelivered: r.notDelivered, unexplained: r.unexplained });
    if (r.unexplained > 0)
      alerts.push({ level: "red", area: "fuel", text: `${GRADE_NAME[g]} delivery: ${showLitres(r.unexplained)} loaded but neither delivered nor recorded as returned` });
    else if (r.unexplained < 0)
      alerts.push({ level: "red", area: "fuel", text: `${GRADE_NAME[g]} delivery: truck meters and returns add up to ${showLitres(-r.unexplained)} more than the BOL loaded` });
    else if (r.notDelivered > 0)
      alerts.push({ level: "info", area: "fuel", text: `${GRADE_NAME[g]} delivery: ${showLitres(r.notDelivered)} not delivered, matched to the recorded return` });
  }

  // 5.6 Manual stick dip vs gauge height (mm), tank level and water at close.
  const dips: { tank: string; gaugeMm: number; stickMm: number; difference: number }[] = [];
  for (const t of Object.keys(s.tanks)) {
    const dp = doc.tanks?.dip?.[t];
    const gm = num(dp?.gaugeMm), sm = num(dp?.stickMm);
    if (gm !== null && sm !== null) {
      const difference = dipHeightDifference(sm, gm);
      dips.push({ tank: t, gaugeMm: gm, stickMm: sm, difference });
      const a = Math.abs(difference);
      if (a > tol.dipAmberMm)
        alerts.push({ level: a > tol.dipRedMm ? "red" : "amber", area: "fuel", text: `Tank ${t}: stick dip ${sm} mm vs gauge ${gm} mm (${difference > 0 ? "+" : ""}${difference} mm)` });
    }
    const w = num(doc.tanks?.water?.[t]);
    if (w !== null && w > 0) alerts.push({ level: "red", area: "fuel", text: `Tank ${t}: ${w} mm of water on the gauge` });
    const c = num(doc.tanks?.close?.[t]);
    if (c !== null && s.tanks[t].capacity > 0) {
      const pct = (c / (s.tanks[t].capacity * 100)) * 100;
      if (pct < tol.tankLowAmberPct)
        alerts.push({ level: pct < tol.tankLowRedPct ? "red" : "amber", area: "fuel", text: `Tank ${t} (${GRADE_NAME[s.tanks[t].grade]}) is at ${pct.toFixed(0)}% (${showLitres(c)})` });
    }
  }

  // Written Page 7 result vs calculated (parallel run).
  let stated = null as null | ReturnType<typeof statedResultCheck>;
  if (num(doc.stated?.amount) !== null && num(pos.sales) !== null) {
    const dir = doc.stated?.direction || undefined;
    stated = statedResultCheck(cash.shortOver, { amount: doc.stated!.amount as number, direction: dir });
    if (!stated.ok) {
      const written = `${dir ? dir + " " : ""}${showRand(doc.stated!.amount as number)}`;
      alerts.push({ level: "red", area: "paperwork", text: `Page 7 written as ${written}, but the calculation gives ${cash.label.charAt(0).toLowerCase() + cash.label.slice(1)}` });
    }
  }

  if ((num(pos.discountsManual) ?? 0) > 0)
    alerts.push({ level: "amber", area: "cash", text: `Manual discounts on the POS: ${showRand(pos.discountsManual as number)}. Discounts are normally automatic.` });

  for (const u of doc.unpaids) if (u.kind === "staff-overfill") alerts.push({ level: "info", area: "cash", text: `Staff overfill: ${u.who} ${showRand(u.amt)}` });

  const order: Record<Level, number> = { red: 0, amber: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return {
    cash: { ...cash, checks, cashSide, cardSide }, totalCard: tc,
    fuel: { grades, tanks, deliveries: drops, deliveryNotes, dips }, continuity, stated, alerts, missing,
    worst: alerts.find((a) => a.level !== "info")?.level ?? "ok",
  };
}

/** The fuel day (06:00 to 06:00): day + night shifts together. This is the official fuel check;
 *  shift-level fuel figures are affected by when meters, gauge and POS are each read. */
export function evaluateFuelDay(day: ShiftDoc, night: ShiftDoc, s: Settings) {
  const alerts: Alert[] = [];
  const grades: { grade: Grade; meter: number | null; pos: number | null; pumpDiff: number | null; tank: ReturnType<typeof tankReconciliation> & { opening: number; delivered: number; closing: number } | null }[] = [];
  for (const g of ["D50", "ULP95", "ULP93"] as Grade[]) {
    const pumpsG = Object.keys(s.pumps).filter((p) => s.pumps[p] === g);
    let meter: number | null = 0;
    for (const p of pumpsG) {
      const o = num(day.pumps?.[p]?.open), c = num(night.pumps?.[p]?.close);
      if (o === null || c === null) { meter = null; break; }
      meter += (c - o) * 100;
    }
    const pd = num(day.pos?.litres?.[g]), pn = num(night.pos?.litres?.[g]);
    const posL = pd !== null && pn !== null ? pd + pn : null;
    const pumpDiff = meter !== null && posL !== null ? meter - posL : null;
    if (pumpDiff !== null && posL) {
      const pct = Math.abs(pumpDiff) / posL * 100;
      if (Math.abs(pumpDiff) > pumpsG.length * 100)
        alerts.push({ level: pct > s.tol.pumpPct ? "red" : "amber", area: "fuel",
          text: `${GRADE_NAME[g]}: pumps dispensed ${showLitres(meter as number)}, POS sold ${showLitres(posL)} (${pumpDiff > 0 ? "+" : ""}${showLitres(pumpDiff)})` });
    }
    const ids = Object.keys(s.tanks).filter((t) => s.tanks[t].grade === g);
    const to = day.tanks?.open || {}, tcl = night.tanks?.close || {};
    let tank = null as (typeof grades)[number]["tank"];
    if (ids.length && ids.every((t) => num(to[t]) !== null && num(tcl[t]) !== null) && posL !== null) {
      const opening = sum(ids.map((t) => to[t] as number)), closing = sum(ids.map((t) => tcl[t] as number));
      const delivered = sum([...(day.deliveries || []), ...(night.deliveries || [])].filter((d) => ids.includes(String(d.tank))).map((d) => d.truck));
      tank = { opening, delivered, closing, ...tankReconciliation({ openingTC: opening, delivered, posSold: posL, closingTC: closing }) };
      const a = Math.abs(tank.pctOfSales);
      // Gauge readings are whole litres per tank: ignore differences below 5 L per tank.
      if (a > s.tol.tankPct && Math.abs(tank.variance) > ids.length * 500)
        alerts.push({ level: a > 0.5 ? "red" : "amber", area: "fuel",
          text: `${GRADE_NAME[g]} tanks, 24 h: ${tank.variance < 0 ? "loss" : "gain"} of ${showLitres(Math.abs(tank.variance))} (${tank.pctOfSales.toFixed(2)}% of sales)` });
    }
    grades.push({ grade: g, meter, pos: posL, pumpDiff, tank });
  }
  const order: Record<Level, number> = { red: 0, amber: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return { grades, alerts };
}

/** Consecutive fuel days of loss at the end of a series (oldest first). null = no figure that day, which breaks the run. */
export function lossStreak(variances: (Centilitres | null)[], ignoreBelow: Centilitres = 0) {
  let n = 0;
  for (let i = variances.length - 1; i >= 0; i--) {
    const v = variances[i];
    if (v === null || v >= -ignoreBelow) break;
    n++;
  }
  return n;
}

/** 5.5 Order check per grade group: how much can be ordered now without passing the safe-fill level. */
export function orderRoom(s: Settings, closingTC: Record<string, Centilitres | null | undefined>, forecast: Partial<Record<Grade, Centilitres>> = {}) {
  const pct = s.safeFillPct ?? 90;
  return (["D50", "ULP95", "ULP93"] as Grade[]).flatMap((g) => {
    const ids = Object.keys(s.tanks).filter((t) => s.tanks[t].grade === g);
    if (!ids.length || ids.some((t) => num(closingTC[t]) === null)) return [];
    const capacity = sum(ids.map((t) => s.tanks[t].capacity * 100));
    const current = sum(ids.map((t) => closingTC[t] as number));
    const f = forecast[g] ?? 0;
    return [{ grade: g, tanks: ids, capacity, current, pctFull: (current / capacity) * 100, safeLevel: Math.floor((capacity * pct) / 100),
      forecast: f, room: maxOrder({ capacity, safeFillPct: pct, currentTC: current, forecastSalesUntilArrival: f }) }];
  });
}
