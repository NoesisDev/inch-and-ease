import Link from "next/link";
import { Suspense } from "react";
import { analyze, merc, type Area, type Pt } from "@/lib/area";
import SlopeMap, { type MapPoi, type MapSeg } from "./SlopeMap";

// shortcut: in-memory cache per server process, fine for a local demo; move to a store when deployed.
const cache = new Map<string, Promise<Area>>();
const getArea = (lat: number, lon: number) => {
  const k = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  if (!cache.has(k)) cache.set(k, analyze(lat, lon).catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k)!;
};

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="glass mx-auto mt-24 max-w-md px-6 py-5 text-center text-secondary">Measuring the streets around this building</p>}>
      <Page {...props} />
    </Suspense>
  );
}

async function Page({ searchParams }: PageProps<"/">) {
  const q = String((await searchParams).q ?? "");
  const [lat, lon] = q.split(",").map((s) => Number(s.trim()));
  const ok = q !== "" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  let area: Area | null = null, error = "";
  if (ok) try { area = await getArea(lat, lon); } catch (e) { error = (e as Error).message; }

  return (
    <div className="relative min-h-screen px-4 pb-16 sm:px-6">
      {area && (
        // The place itself, blurred, as the backdrop the glass panels sit on.
        <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied Vexcel JPEG */}
          <img src={`/api/image?lat=${area.lat}&lon=${area.lon}&half=${area.half}&view=ortho&px=800`} alt="" className="h-full w-full scale-110 object-cover blur-3xl" />
          <div className="absolute inset-0 bg-white/35" />
        </div>
      )}

      <header className="glass sticky top-4 z-10 mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 !rounded-full px-5 py-2">
        <Link href="/" className="text-[17px] font-semibold tracking-tight text-label no-underline">Inch &amp; Ease</Link>
        <form className="ml-auto flex min-w-72 max-w-xl flex-1 items-center gap-2">
          <label htmlFor="q" className="sr-only">Latitude and longitude</label>
          <div className="flex min-h-10 flex-1 items-center gap-2 rounded-full bg-black/5 px-4">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-secondary"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input id="q" name="q" defaultValue={q} placeholder="Latitude, longitude in Houston or Los Angeles"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-secondary" />
          </div>
          <button className="min-h-10 rounded-full bg-tint px-5 text-[15px] font-semibold text-white">Check</button>
        </form>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {!ok && (
          <section className="glass mx-auto mt-16 max-w-2xl px-8 py-10">
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight">How easy is it to get around this address?</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-secondary">Enter a location in Houston or Los Angeles. Inch &amp; Ease measures the slope of every street and path within 250 metres using Vexcel&apos;s elevation data, finds transit, curb ramps and elevators in OpenStreetMap, and shows what a wheelchair or cane user can manage.</p>
          </section>
        )}
        {error && <p role="alert" className="glass px-6 py-5 text-bad">Could not check this area: {error}</p>}
        {area && <AreaView a={area} />}
      </main>
    </div>
  );
}

function AreaView({ a }: { a: Area }) {
  const [y1, x0] = merc([a.b.n, a.b.w]), [y0, x1] = merc([a.b.s, a.b.e]);
  const xy = (p: Pt) => { const [y, x] = merc(p); return [((x - x0) / (x1 - x0)) * 1000, ((y1 - y) / (y1 - y0)) * 1000]; };
  const img = (view: string, half: number) => `/api/image?lat=${a.lat}&lon=${a.lon}&half=${half}&view=${view}`;
  const [hx, hy] = xy([a.lat, a.lon]);
  const s = a.summary;
  const inBox = a.pois.filter((p) => p.at[0] > a.b.s && p.at[0] < a.b.n && p.at[1] > a.b.w && p.at[1] < a.b.e);
  const segs: MapSeg[] = a.segs.map((g) => {
    const [x1, y1] = xy(g.a), [x2, y2] = xy(g.b);
    return { x1, y1, x2, y2, za: g.za, zb: g.zb, slope: g.slope, len: g.len, near: g.near, name: g.name, kind: g.kind, steps: g.steps };
  });
  const pois: MapPoi[] = inBox.map((p) => { const [x, y] = xy(p.at); return { x, y, kind: p.kind, name: p.name, kerb: p.kerb }; });

  return (
    <div className="flex flex-wrap items-start gap-5">
      <SlopeMap img={img("ortho", a.half)} segs={segs} pois={pois} home={[hx, hy]} grid={a.grid} size={a.half * 2}
        facts={{ stepFree: s.stepFree, station: s.station, busStops400: s.busStops400, kerbs: s.kerbs, loweredKerbs: s.loweredKerbs }} />
      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
        <Stat label="Steepest stretch within 100 m" value={s.steepestNear ? (s.steepestNear.steps ? "Steps" : `${s.steepestNear.slope.toFixed(1)}%`) : "No streets"} note={s.steepestNear?.name} bad={!!s.steepestNear && (s.steepestNear.steps || s.steepestNear.slope > 8)} />
        <Stat label="Nearest step-free station" value={s.stepFree ? `${s.stepFree.dist} m` : s.station ? "Not known" : "None within 2 km"}
          note={s.stepFree ? `${s.stepFree.name ?? "Station"}, straight-line distance` : s.station ? `${s.station.name ?? "The nearest station"} (${s.station.dist} m) has no wheelchair information` : undefined} />
        <Stat label="Bus stops within 400 m" value={String(s.busStops400)} />
        <Stat label="Curb ramps within 150 m" value={s.kerbs ? `${s.loweredKerbs} of ${s.kerbs} lowered` : "Not mapped"} note={s.kerbs ? undefined : "Unmapped does not mean missing. Check on site."} />
        <Stat label="Mapped elevators within 1 km" value={String(s.elevators.length)} note={s.elevators[0] ? `Nearest is ${s.elevators[0].dist} m away` : undefined} />
      </aside>

      <section className="glass w-full p-5">
        <h2 className="mb-4 text-[22px] font-semibold tracking-tight">The building from four sides</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {["north", "east", "south", "west"].map((d) => (
            <figure key={d} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- proxied Vexcel JPEG */}
              <img src={img(`oblique-${d}`, 40)} alt={`Vexcel oblique photo looking ${d}`} className="block aspect-square w-full rounded-[20px] bg-black/5 object-cover" />
              <figcaption className="mt-2 text-[13px] text-secondary">Looking {d}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <footer className="w-full px-2 text-[12px] leading-relaxed text-secondary">
        <p>Imagery and elevation © Vexcel Imaging US, Inc. Map data © OpenStreetMap contributors (ODbL).</p>
        <p>Slopes are the rise over each piece of street of at least 10 m, from a terrain model with about 1 m detail. Public sidewalks may legally follow the street grade, so a steep street is a barrier rather than a code violation.</p>
      </footer>
    </div>
  );
}

function Stat({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div className="glass px-5 py-4">
      <p className="text-[13px] font-medium text-secondary">{label}</p>
      <p className={`mt-0.5 text-[28px] font-semibold leading-tight tracking-tight ${bad ? "text-bad" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[13px] text-secondary">{note}</p>}
    </div>
  );
}
