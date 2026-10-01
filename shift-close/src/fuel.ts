// Fuel reconciliation: spec sections 5.2-5.6. All volumes in centilitres.
import { Centilitres, sum } from "./units.js";

export type Grade = "D50" | "ULP95" | "ULP93";

export interface PumpReading { pump: number; grade: Grade; opening: number; closing: number } // whole-litre meters

/** 5.2 Pumps vs POS per grade. Meters read whole litres: allow +/-1 L per pump as rounding. */
export function pumpsVsPos(readings: PumpReading[], posLitres: Record<Grade, Centilitres>) {
  const grades = [...new Set(readings.map((r) => r.grade))];
  return grades.map((grade) => {
    const rs = readings.filter((r) => r.grade === grade);
    for (const r of rs) {
      if (!Number.isInteger(r.opening) || !Number.isInteger(r.closing)) throw new Error(`Pump ${r.pump}: meter readings must be whole litres`);
      if (r.closing < r.opening) throw new Error(`Pump ${r.pump}: closing ${r.closing} is below opening ${r.opening}`);
    }
    const meterLitres = sum(rs.map((r) => (r.closing - r.opening) * 100));
    const difference = meterLitres - posLitres[grade];
    const rounding = rs.length * 100;
    return { grade, pumps: rs.length, meterLitres, posLitres: posLitres[grade], difference,
      withinRounding: Math.abs(difference) <= rounding };
  });
}

/** 5.3 Tank reconciliation for one grade (or tank group) over a fuel day. Uses gauge TC volumes. */
export function tankReconciliation(a: { openingTC: Centilitres; delivered: Centilitres; posSold: Centilitres; closingTC: Centilitres }) {
  const expectedClosing = a.openingTC + a.delivered - a.posSold;
  const variance = a.closingTC - expectedClosing; // negative = loss
  const pctOfSales = a.posSold === 0 ? 0 : (variance / a.posSold) * 100;
  return { expectedClosing, variance, pctOfSales };
}

/** 5.4 Delivery check. */
export function deliveryCheck(a: {
  bolLoaded20C: Centilitres; truckMeter20C: Centilitres; returnedRecorded: Centilitres;
  gaugeTCBefore?: Centilitres; gaugeTCAfter?: Centilitres; soldDuringDelivery?: Centilitres; soldIsEstimate?: boolean;
}) {
  const notDelivered = a.bolLoaded20C - a.truckMeter20C;
  const unexplained = notDelivered - a.returnedRecorded;
  let tankReceived: number | undefined, variance: number | undefined;
  if (a.gaugeTCBefore !== undefined && a.gaugeTCAfter !== undefined) {
    tankReceived = a.gaugeTCAfter - a.gaugeTCBefore + (a.soldDuringDelivery ?? 0);
    variance = tankReceived - a.truckMeter20C;
  }
  return { notDelivered, unexplained, tankReceived, variance, varianceIsEstimate: !!a.soldIsEstimate };
}

/** 5.5 Order check: the most a tank (group) can safely take on arrival. */
export function maxOrder(a: { capacity: Centilitres; safeFillPct: number; currentTC: Centilitres; forecastSalesUntilArrival: Centilitres }) {
  const safeLevel = Math.floor((a.capacity * a.safeFillPct) / 100);
  return Math.max(0, safeLevel - a.currentTC + a.forecastSalesUntilArrival);
}

/** 5.6 Manual stick dip vs gauge height, in mm. */
export const dipHeightDifference = (stickMm: number, gaugeMm: number) => Math.round((stickMm - gaugeMm) * 10) / 10;

/** Gauge "inventory increase" (TC net) vs truck meter (20°C) for one tank drop. */
export function dropCheck(a: { tank: number; truckMeter20C: Centilitres; gaugeTCIncrease: Centilitres }) {
  const difference = a.gaugeTCIncrease - a.truckMeter20C;
  const pct = (difference / a.truckMeter20C) * 100;
  return { tank: a.tank, difference, pct, flagged: Math.abs(pct) > 1 };
}
