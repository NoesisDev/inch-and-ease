// The street check's data for tour/serve.py, straight from the Next app's own code (no second copy of the slope logic):
//   node --no-warnings tour/street_data.mjs area|buildings <lat> <lon>   → JSON on stdout; an error message on stderr, exit 1
// Run from the repo root (area.ts caches OpenStreetMap answers in ./.osm-cache). Needs VEXCEL_API_KEY in .env.local.
import { registerHooks } from "node:module";

// src/lib imports "./area" without an extension (fine for Next's bundler, not for Node): try the .ts file for those.
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (e.code === "ERR_MODULE_NOT_FOUND" && spec.startsWith(".") && !/\.\w+$/.test(spec)) return next(spec + ".ts", ctx);
      throw e;
    }
  },
});

try { process.loadEnvFile(".env.local"); } catch {} // hosted: no file, VEXCEL_API_KEY comes from the environment
const [what, lat, lon] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
try {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error("bad lat or lon");
  const out = what === "area" ? await (await import("../src/lib/area.ts")).analyze(lat, lon)
    : what === "buildings" ? await (await import("../src/lib/buildings.ts")).scene3d(lat, lon)
    : (() => { throw new Error("say area or buildings"); })();
  process.stdout.write(JSON.stringify(out));
} catch (e) {
  process.stderr.write(e.message);
  process.exitCode = 1;
}
