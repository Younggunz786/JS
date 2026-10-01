// Builds the single-file app: bundles the engine and inlines it into app/app.src.html.
// Also writes the 30 Sep seed records as JSON (dist/) for seeding the shared database.
import { buildSync } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { settings, day30, night30 } from "../seed/seed.js";

mkdirSync("dist", { recursive: true });
const out = buildSync({ entryPoints: ["src/browser.ts"], bundle: true, format: "iife", globalName: "Engine", minify: true, target: "es2020", write: false });
const engine = out.outputFiles[0].text.trim();
writeFileSync("dist/engine.js", engine + "\n");

const src = readFileSync("app/app.src.html", "utf8");
const marker = "<script>/*ENGINE*/</script>";
if (!src.includes(marker)) throw new Error("ENGINE marker missing from app/app.src.html");
writeFileSync("app/shift-close.html", src.replace(marker, () => `<script>${engine}</script>`));

writeFileSync("dist/settings.json", JSON.stringify(settings));
writeFileSync("dist/2026-09-30_day.json", JSON.stringify({ ...day30, status: "open", photos: [], events: [] }));
writeFileSync("dist/2026-09-30_night.json", JSON.stringify({ ...night30, status: "open", photos: [], events: [] }));
writeFileSync("dist/seed.json", JSON.stringify({ settings, shifts: { "2026-09-30_day": day30, "2026-09-30_night": night30 } }));
console.log(`app/shift-close.html written (${(readFileSync("app/shift-close.html").length / 1024).toFixed(1)} KB, engine ${(engine.length / 1024).toFixed(1)} KB)`);
