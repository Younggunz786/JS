// Real Perth Road data for 30 Sep 2026, in the app's stored format. Used by tests and to seed the pilot.
import type { ShiftDoc, Settings } from "../src/evaluate.js";
const c = (r: number) => Math.round(r * 100);           // rand -> cents
const l = (x: number) => Math.round(x * 100);           // litres -> centilitres

export const settings: Settings = {
  pumps: { "1": "ULP95", "2": "D50", "3": "D50", "4": "ULP95", "5": "D50", "6": "ULP93", "7": "D50", "8": "ULP95", "9": "ULP95", "10": "D50" },
  tanks: { "1": { grade: "D50", capacity: 22730 }, "2": { grade: "ULP95", capacity: 22730 }, "3": { grade: "D50", capacity: 13640 }, "4": { grade: "ULP93", capacity: 8590 }, "5": { grade: "D50", capacity: 13640 } },
  rates: {},
  taxiRate: 80,
  totalCardRebate: { D50: 4585 },
  tol: { cashAmber: 0, cashRed: 500, pumpPct: 0.25, tankPct: 0.3, dropPct: 1 },
  staff: [{ name: "Pontsho", posNo: "8656" }, { name: "Suzan" }, { name: "Mthabi", posNo: "5294" }, { name: "Penelope", posNo: "2173" }],
};

const pumps = (o: number[], cl: number[]) => Object.fromEntries(o.map((v, i) => [String(i + 1), { open: v, close: cl[i] }]));
const dayOpen = [2236971, 7798616, 2922556, 1866796, 4613822, 2106981, 4002158, 1905461, 2746867, 3784419];
const dayClose = [2237889, 7800719, 2925268, 1867207, 4616071, 2107090, 4003025, 1906070, 2747653, 3785180];
const nightClose = [2238197, 7801437, 2926403, 1867370, 4617113, 2107246, 4003489, 1906152, 2747908, 3785253];
const tc = (a: number[]) => Object.fromEntries(a.map((v, i) => [String(i + 1), l(v)]));
const t0600 = tc([13303, 17554, 8310, 5219, 9092]), t1814 = tc([17987, 19594, 11596, 5109, 11683]), t0603 = tc([16329, 18783, 10862, 4955, 10590]);
const reb = (who: string, litres: number | null, amt: number) => ({ type: "customer" as const, who, litres: litres === null ? null : l(litres), amt: c(amt) });
const taxi = (litres: number, amt: number) => ({ type: "taxi" as const, who: "Taxi", litres: l(litres), amt: c(amt) });

export const day30: ShiftDoc = {
  date: "2026-09-30", period: "day", cashierName: "Suzan", posShiftNo: "482",
  pumps: pumps(dayOpen, dayClose),
  pos: { sales: c(358606.60), cash: c(13223.74), cards: c(107968.08 + 71835.77 + 1346.00), localAccounts: c(161676.77),
    safeDrops: c(9880), payouts: c(2556.24), payoutCount: 32, cashierNo: "2173", cashierName: "Penelope. T",
    litres: { D50: l(8703.20), ULP95: l(2711.13), ULP93: l(109.66) } },
  drops: [2000, 2000, 3000, 2000, 880].map((a) => ({ amt: c(a) })), coins: 0,
  batches: [["939", 20786.53], ["861", 15283.07], ["940", 14616.71], ["862", 22514.74], ["816", 59005.71], ["63", 37258.38]].map(([ref, a]) => ({ ref: String(ref), amt: c(a as number) })),
  vouchers: [],
  totalCard: [{ ref: "TSN 2047", grade: "D50", litres: null, amt: c(1346.00), cardAmt: null }],
  localSheet: c(161676.71),
  unpaids: [
    { who: "City to City", kind: "account", amt: c(9450.34) }, { who: "JHB Water", kind: "customer", amt: c(2204.53) },
    { who: "Zamalangeni (4x oil)", kind: "account", amt: c(299.96) }, { who: "Raid (coolant)", kind: "customer", amt: c(149.99) },
    { who: "Joshua", kind: "staff-overfill", amt: c(67.59) }, { who: "City to City", kind: "account", amt: c(1964.08) },
    { who: "Kevin", kind: "staff-overfill", amt: c(103.00) }, { who: "Gift of the Givers", kind: "customer", amt: c(9000.00) }],
  unpaidPaid: [1921.40, 2681.25, 2114.65, 2840.62].map((a) => ({ who: "JHB Theatre", amt: c(a) })),
  payouts: [
    reb("Bliss", 37.56, 30.04), reb("Gift of the Givers", 39.56, 79.12), reb("JHB Water", 63.77, 127.54), reb("Ambulance", 38.74, 77.48),
    reb("Leano", 56.15, 44.92), reb("UJ", 34.55, 51.82), reb("AD", 60.91, 91.36), reb("Ambulance", 61.30, 122.60), reb("JHB Theatre", 44.49, 35.59),
    reb("CSBC", 48.40, 29.04), reb("Macro Med", 38.63, 23.17), reb("UJ", 44.41, 35.52), reb("Doves", 60.39, 60.39), reb("Forensic", 62.91, 125.82),
    reb("Prasa", 68.71, 41.22), reb("GHHS", 34.57, 20.74), reb("Fits", 52.21, 31.32), reb("UJ", 63.62, 50.89), reb("Ambulance", 33.59, 67.18),
    reb("Alert", 58.00, 34.80), reb("Plasser", 250.00, 500.00), reb("UJ", 54.92, 43.93), reb("Ambulance", null, 124.64), reb("Fits", 31.11, 18.66),
    reb("EMS", 21.30, 31.95), reb("Gift of the Givers", 260.34, 520.68), reb("Blink", 41.94, 83.88),
    taxi(11.15, 8.92), taxi(11.16, 8.92), taxi(9.29, 7.43), taxi(11.15, 8.84), taxi(22.29, 17.83)],
  tanks: { open: t0600, close: t1814 },
  deliveries: [{ tank: "2", truck: l(4804), gauge: l(4757) }, { tank: "3", truck: l(5320), gauge: l(5431) }, { tank: "5", truck: l(4753), gauge: l(4965) }, { tank: "1", truck: l(9088), gauge: l(8989) }],
  // Delivery 3017884981: BOL loaded at 20°C per grade and the volume recorded as returned.
  deliveryNotes: [{ ref: "3017884981", grade: "ULP95", bol: l(4040 + 4042), returned: l(3278) }, { ref: "3017884981", grade: "D50", bol: l(5031 + 5029 + 10057), returned: l(956) }],
};

export const night30: ShiftDoc = {
  date: "2026-09-30", period: "night", cashierName: "Pontsho", posShiftNo: "483",
  pumps: pumps(dayClose, nightClose),
  pos: { sales: c(135812.30), cash: c(7261.43), cards: c(56786.20), localAccounts: c(71439.43),
    safeDrops: c(7180), payouts: c(325.24), payoutCount: 12, cashierNo: "8656", cashierName: "Ponsho",
    litres: { D50: l(12122.64) - l(8703.20), ULP95: l(3518.13) - l(2711.13), ULP93: l(265.48) - l(109.66) } },
  drops: [3000, 2600, 1470, 110].map((a) => ({ amt: c(a) })), coins: 0,
  batches: [["863", 9208.61], ["941", 1304.84], ["64", 5111.40], ["817", 22479.42], ["942", 13717.81], ["65", 2360.36]].map(([ref, a]) => ({ ref: String(ref), amt: c(a as number) })),
  vouchers: [], totalCard: [], localSheet: c(71439.43),
  unpaids: [{ who: "JHB Theatre", kind: "customer", amt: c(2682.63) }], unpaidPaid: [],
  payouts: [reb("Ampath", 26.90, 16.14), reb("Ampath", 23.26, 13.95), reb("JHB Theatre", 77.60, 155.20), reb("UJ", 31.55, 25.24), reb("National Health", 49.97, 29.98),
    taxi(11.15, 8.92), taxi(18.57, 14.85), taxi(23.41, 18.72), taxi(9.31, 7.44), taxi(22.30, 17.84), taxi(11.15, 8.92), taxi(10.05, 8.04)],
  tanks: { open: t1814, close: t0603 },
  deliveries: [],
};
