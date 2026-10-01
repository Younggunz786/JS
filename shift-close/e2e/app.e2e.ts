// End-to-end: the built single-file app, driven in Chromium against a mock runtime seeded with the real 30 Sep records.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { chromium, Browser, Page } from "playwright";

const html = readFileSync("app/shift-close.html", "utf8");
const mock = readFileSync("e2e/mock-runtime.js", "utf8");
const settings = JSON.parse(readFileSync("dist/settings.json", "utf8"));
const day = JSON.parse(readFileSync("dist/2026-09-30_day.json", "utf8"));
const night = JSON.parse(readFileSync("dist/2026-09-30_night.json", "utf8"));
const OWNER = "u_owner000000000000000000", CASHIER = "u_cashier0000000000000000", CHECKER = "u_checker0000000000000000";
const people = [{ id: OWNER, name: "Abdul" }, { id: CASHIER, name: "Suzan" }, { id: CHECKER, name: "Claudette" }];
mkdirSync("e2e/out", { recursive: true });

let browser: Browser;
before(async () => { browser = await chromium.launch(process.env.CHROMIUM_PATH || existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" } : {}); });
after(async () => { await browser.close(); });

async function open(opts: { me?: string; isOwner?: boolean; canEdit?: boolean; seed?: Record<string, unknown>; width?: number; dark?: boolean } = {}) {
  const page = await browser.newPage({ viewport: { width: opts.width ?? 1280, height: 900 }, colorScheme: opts.dark ? "dark" : "light" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const seed = opts.seed ?? { "settings/site": settings, "shifts/2026-09-30_day": day, "shifts/2026-09-30_night": night };
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await page.addInitScript(`window.__MOCK=${JSON.stringify({ me: opts.me ?? OWNER, isOwner: opts.isOwner ?? true, canEdit: opts.canEdit ?? true, seed, people })};\n${mock}`);
  await page.route("http://shift-close.test/", (r) => r.fulfill({ body: html, contentType: "text/html; charset=utf-8" }));
  await page.goto("http://shift-close.test/");
  await page.waitForFunction(() => document.querySelector("#dayCards .result") !== null);
  return { page, errors };
}
const text = (page: Page, sel: string) => page.locator(sel).innerText();
const stored = (page: Page, id: string) => page.evaluate((k) => (window as any).__store.get(k), id);
async function waitSaved(page: Page) { await page.waitForFunction(() => document.getElementById("saveState")!.textContent === "Saved", null, { timeout: 5000 }); }

test("Today: both 30 Sep results, 24 h fuel, tank levels, order check and the morning brief", async () => {
  const { page, errors } = await open();
  const cards = await text(page, "#dayCards");
  assert.match(cards, /Short R0\.88/); assert.match(cards, /Short R2\.56/);
  const fuel = await text(page, "#fuelDay");
  assert.match(fuel, /\+37\.64 L \(0\.31%\)/); assert.match(fuel, /-56\.87 L \(-1\.62%\)/); assert.match(fuel, /\+13\.87 L/);
  assert.match(await text(page, "#fuelDayAlerts"), /ULP 95 tanks, 24 h: loss of 56\.87 L/);
  assert.match(await text(page, "#tankLevels"), /18,783\.00 L/);
  assert.match(await text(page, "#orderRoom"), /ULP 95\t18,783\.00 L · 83%\t20,457\.00 L\t3,518\.13 L\t5,192\.13 L/); // 90% fill - now + one day of sales
  const brief = await text(page, "#brief");
  assert.match(brief, /^Perth Road, 30 Sept?\. Cash: day short R0\.88, night short R2\.56\./);
  assert.match(brief, /ULP 95 −57 L \(1\.6%\) red/);
  assert.match(brief, /Delivery: 23,965 L received, 4,234 L returned\./);
  assert.match(brief, /New unpaids: R25,922\.12; unpaids collected: R9,557\.92\./);
  assert.match(brief, /POS login 2173/);
  await page.screenshot({ path: "e2e/out/today-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
});

test("Shift: checks, submit, correct with a reason, and the change is logged with the old value", async () => {
  const { page, errors } = await open();
  await page.locator("#dayCards .panel").first().getByRole("button", { name: "Open shift" }).click();
  const side = await text(page, "#side");
  assert.match(side, /Short R0\.88/);
  assert.match(side, /Delivery to tank 5: gauge rose 4,965\.00 L/);
  assert.match(side, /ULP 95 delivery: 3,278\.00 L not delivered, matched to the recorded return/);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  assert.match(await text(page, "#askBox"), /Submit with these open items\?/);
  await page.locator("#askGo").click();
  await page.waitForFunction(() => document.querySelector("#stepper .now")?.textContent === "Submitted");
  assert.equal((await stored(page, "shifts/2026-09-30_day")).status, "submitted");
  assert.equal(await page.locator("#batches-0-amt").isDisabled(), true); // locked after submit
  assert.equal(await page.locator("#pos-sales").isDisabled(), false);    // controller still enters POS figures
  await page.getByRole("button", { name: "Correct figures" }).click();
  await page.locator("#askGo").click();                                   // no reason: refused
  assert.equal(await page.locator("#askNote").evaluate((e) => e.classList.contains("bad")), true);
  await page.fill("#askNote", "Batch 939 keyed wrongly");
  await page.locator("#askGo").click();
  await page.locator("#sec-batches summary").click();
  await page.fill("#batches-0-amt", "20786.63");
  await waitSaved(page);
  assert.match(await text(page, "#side"), /Short R0\.78/);
  const ev = (await stored(page, "shifts/2026-09-30_day")).events.at(-1);
  assert.equal(ev.action, "Corrected"); assert.equal(ev.note, "Batch 939 keyed wrongly"); assert.equal(ev.by, OWNER);
  assert.deepEqual(ev.changes, [{ f: "batches.0.amt", from: 2078653, to: 2078663 }]);
  await page.locator("#sec-history summary").click();
  assert.match(await text(page, "#histBox"), /Card batch 1, amount: R20,786\.53 → R20,786\.63/);
  await page.getByRole("button", { name: "Done correcting" }).click();
  await page.getByRole("button", { name: "Mark reconciled" }).click(); await page.locator("#askGo").click();
  await page.waitForFunction(() => document.querySelector("#stepper .now")?.textContent === "Reconciled");
  await page.getByRole("button", { name: "Send back", exact: true }).click();
  await page.fill("#askNote", "Check taxi rebate 11.15 L"); await page.locator("#askGo").click();
  await page.waitForFunction(() => document.querySelector("#stepper .now")?.textContent === "Submitted");
  assert.equal((await stored(page, "shifts/2026-09-30_day")).events.at(-1).action, "Sent back");
  await page.screenshot({ path: "e2e/out/shift-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
});

test("Shift: new spec fields feed the checks (written Page 7, account lines, dips, delivery note without return)", async () => {
  const { page, errors } = await open();
  await page.locator("#dayCards .panel").nth(1).getByRole("button", { name: "Open shift" }).click();
  await page.locator("#sec-paper summary").click();
  await page.fill("#f-stated", "2.65"); await page.selectOption("#f-statedDir", "short");
  await page.locator("#sec-tanks summary").click();
  await page.fill("#tank-2-gmm", "1500"); await page.fill("#tank-2-smm", "1530"); await page.fill("#tank-3-water", "4");
  await page.locator("#sec-deliveries summary").click();
  await page.locator("#lt-deliveryNotes").getByRole("button", { name: "Add line" }).click();
  await page.selectOption("#deliveryNotes-0-grade", "ULP95"); await page.fill("#deliveryNotes-0-bol", "500");
  await page.locator("#sec-local summary").click();
  await page.locator("#lt-accounts").getByRole("button", { name: "Add line" }).click();
  await page.fill("#accounts-0-account", "City to City"); await page.fill("#accounts-0-amt", "71439.43");
  assert.equal(await page.locator("#f-localSheet").isDisabled(), true);
  assert.equal(await page.locator("#f-localSheet").inputValue(), "71439.43");
  const side = await text(page, "#side");
  assert.match(side, /Page 7 written as short R2\.65, but the calculation gives short R2\.56/);
  assert.match(side, /Tank 2: stick dip 1530 mm vs gauge 1500 mm \(\+30 mm\)/);
  assert.match(side, /Tank 3: 4 mm of water on the gauge/);
  assert.match(side, /ULP 95 delivery: 500\.00 L loaded but neither delivered nor recorded as returned/);
  await waitSaved(page);
  const s = await stored(page, "shifts/2026-09-30_night");
  assert.equal(s.stated.amount, 265); assert.equal(s.tanks.water["3"], 4); assert.equal(s.accounts[0].amt, 7143943);
  assert.equal(s.events.length, 0); // an open, never-submitted shift is not audit-logged field by field
  assert.deepEqual(errors, []);
});

test("Roles: a cashier cannot change a submitted shift, settings, or approve; a checker can only sign off", async () => {
  const roles = { [CASHIER]: "cashier", [CHECKER]: "checker" };
  const seed = { "settings/site": { ...settings, roles }, "shifts/2026-09-30_day": { ...day, status: "submitted", submittedOnce: true }, "shifts/2026-09-30_night": { ...night, status: "reconciled", submittedOnce: true } };
  const c = await open({ me: CASHIER, isOwner: false, canEdit: false, seed });
  assert.match(await text(c.page, "#roleNote"), /Cashier/);
  await c.page.locator("#dayCards .panel").first().getByRole("button", { name: "Open shift" }).click();
  assert.equal(await c.page.locator("#pos-sales").isDisabled(), true);
  assert.equal(await c.page.locator("#batches-0-amt").isDisabled(), true);
  assert.equal(await c.page.locator("#actions").getByRole("button", { name: /Mark reconciled|Correct figures|Send back/ }).count(), 0);
  await c.page.click("#tab-settings");
  assert.equal(await c.page.locator("#saveSettings").isDisabled(), true);
  assert.deepEqual(c.errors, []);
  const k = await open({ me: CHECKER, isOwner: false, canEdit: false, seed });
  await k.page.locator("#dayCards .panel").nth(1).getByRole("button", { name: "Open shift" }).click();
  assert.equal(await k.page.locator("#actions").getByRole("button", { name: "Sign off" }).count(), 1);
  assert.equal(await k.page.locator("#pos-sales").isDisabled(), true);
  const stranger = await open({ me: "u_nobody00000000000000000", isOwner: false, canEdit: false, seed });
  assert.match(await text(stranger.page, "#roleNote"), /No role yet/);
  assert.equal(await stranger.page.locator("#newDay").isDisabled(), true);
});

test("Reports: fuel by day, cash per cashier, unpaids, rebates, deliveries, and CSV download", async () => {
  const { page, errors } = await open();
  await page.click("#tab-reports");
  const r = await text(page, "#reports");
  assert.match(r, /Fuel variance by fuel day/); assert.match(r, /-56\.87 L \(-1\.62%\)/);
  assert.match(r, /Cash result per cashier/); assert.match(r, /Suzan/); assert.match(r, /Pontsho/);
  assert.match(r, /City to City\s+R11,414\.42/);                // 9,450.34 + 1,964.08, never collected
  assert.match(r, /JHB Theatre\s+R2,682\.63/);
  assert.match(r, /no matching unpaid on record \(unpaids from before the app\): JHB Theatre R9,557\.92/);
  assert.match(r, /Staff overfills/); assert.match(r, /Kevin\s+R103\.00/);
  assert.match(r, /Taxi\s+12/);
  assert.match(r, /3,278\.00 L/);
  await page.locator("#reports .panel").first().getByRole("button", { name: "Download CSV" }).click();
  const saves = await page.evaluate(() => (window as any).__saves);
  assert.equal(saves[0].filename, "fuel-variance-2026-09.csv");
  assert.match(saves[0].data, /^Fuel day,Diesel 50,ULP 95,ULP 93\r\n30 Sep[^,]*,37\.64,-56\.87,1\.48\r\n/);
  await page.screenshot({ path: "e2e/out/reports-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
});

test("Settings: owner adds a role and a rebate rate; the rate is then checked on every line", async () => {
  const { page, errors } = await open();
  await page.click("#tab-settings");
  await page.fill("#roleSearch", "suz");
  await page.getByRole("button", { name: "Add Suzan" }).click();
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.fill("#rt-0-c", "UJ"); await page.fill("#rt-0-r", "0.80");
  await page.click("#saveSettings");
  await page.waitForFunction((id) => (window as any).__store.get("settings/site").roles?.[id] === "cashier", CASHIER);
  const s = await stored(page, "settings/site");
  assert.equal(s.roles[CASHIER], "cashier"); assert.equal(s.rates["UJ|*"], 80);
  await page.click("#tab-today");
  await page.locator("#dayCards .panel").first().getByRole("button", { name: "Open shift" }).click();
  assert.match(await text(page, "#side"), /Rebate rate: UJ: Paid R51\.82, agreed rate gives R27\.64/);
  assert.deepEqual(errors, []);
});

test("Shift pack downloads as a self-contained HTML file", async () => {
  const { page } = await open();
  await page.locator("#dayCards .panel").first().getByRole("button", { name: "Open shift" }).click();
  await page.getByRole("button", { name: "Download shift pack" }).click();
  const s = (await page.evaluate(() => (window as any).__saves))[0];
  assert.equal(s.filename, "shift-pack-2026-09-30_day.html");
  assert.match(s.data, /Short R0\.88/); assert.match(s.data, /Penelope/); assert.match(s.data, /<td>939<\/td>/);
});

test("Unsaved edits are kept on the device and saved on the next visit", async () => {
  const { page } = await open();
  await page.locator("#dayCards .panel").nth(1).getByRole("button", { name: "Open shift" }).click();
  await page.evaluate(() => { (window as any).__MOCK_FAIL = true; });
  await page.evaluate(() => { const s = (window as any).__store; const orig = s.set.bind(s); s.set = (k: string, v: unknown) => { if ((window as any).__MOCK_FAIL && k.startsWith("shifts/")) throw Object.assign(new Error("offline"), { code: "unavailable" }); return orig(k, v); }; });
  await page.locator("#sec-details summary").click();
  await page.fill("#f-posShift", "4839");
  await page.waitForFunction(() => /retrying|Offline/.test(document.getElementById("saveState")!.textContent || ""));
  const pending = await page.evaluate(() => localStorage.getItem("sc.pending.2026-09-30_night"));
  assert.ok(pending && JSON.parse(pending).body.posShiftNo === "4839");
  await page.evaluate(() => { (window as any).__MOCK_FAIL = false; });
  await waitSaved(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("sc.pending.2026-09-30_night")), null);
  assert.equal((await stored(page, "shifts/2026-09-30_night")).posShiftNo, "4839");
});

test("Phone width, light and dark: no sideways scroll on any tab", async () => {
  for (const dark of [false, true]) {
    const { page, errors } = await open({ width: 390, dark });
    for (const tab of ["today", "reports", "settings"]) {
      await page.click("#tab-" + tab);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, `${tab} (${dark ? "dark" : "light"}) scrolls sideways by ${over}px`);
    }
    await page.click("#tab-today");
    await page.locator("#dayCards .panel").first().getByRole("button", { name: "Open shift" }).click();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `shift scrolls sideways by ${over}px`);
    await page.screenshot({ path: `e2e/out/shift-phone-${dark ? "dark" : "light"}.png`, fullPage: false });
    assert.deepEqual(errors, []);
  }
});
