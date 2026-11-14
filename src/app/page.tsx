import Link from "next/link";
import { Suspense } from "react";
import { analyze, merc, type Area, type Pt } from "@/lib/area";
import { PROFILES, verdict } from "@/lib/issues";
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
  const badQ = q !== "" && !ok;
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

      <header className={`sticky top-0 z-10 -mx-4 border-b border-line px-4 sm:-mx-6 sm:px-6 ${area ? "bg-paper/90 backdrop-blur" : "bg-paper"}`}>
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <Link href="/" className="font-display text-[22px] font-bold tracking-[-0.04em] text-brand no-underline">Inch <span className="font-medium text-sage">&amp;</span> Ease</Link>
          <form className="ml-auto flex min-w-72 max-w-xl flex-1 items-center gap-2">
            <label htmlFor="q" className="sr-only">Latitude and longitude</label>
            <div className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-line bg-white px-3">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-secondary"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input id="q" name="q" defaultValue={q} placeholder="Latitude, longitude in Houston or Los Angeles"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-secondary" />
            </div>
            <button className="min-h-11 rounded-md bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-110">Check</button>
          </form>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {badQ && <p role="alert" className="glass mx-auto mt-6 max-w-2xl px-6 py-5 text-bad">&ldquo;{q}&rdquo; is not a location. Type the latitude, then a comma, then the longitude, for example 34.0522, -118.2437.</p>}
        {!ok && <Landing />}
        {error && <p role="alert" className="glass px-6 py-5 text-bad">Could not check this area: {error}</p>}
        {area && <AreaView a={area} />}
      </main>
    </div>
  );
}

// Two streets already in the cache, so the examples open fast. Northeast LA is the neighbourhood in the live demo.
const EXAMPLES = [
  { label: "Northeast Los Angeles", q: "34.09511,-118.21221" },
  { label: "Downtown Houston", q: "29.75334,-95.37605" },
];

// The public start page. Same words and look as the tour's start page, without the CoStar tours (they stay local by the sponsor terms).
function Landing() {
  return (
    <div className="pb-8">
      <section className="grid items-center gap-10 pt-10 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:gap-16 md:pt-16">
        <div>
          <span className="inline-block rounded bg-kicker px-3 py-1.5 font-display text-[15px] font-medium text-brand">Comfort, not compliance</span>
          <h1 className="mt-6 text-[52px] font-bold leading-[0.98] tracking-[-0.05em] text-brand sm:text-[76px]">Can you live here?</h1>
          <p className="mt-5 max-w-[470px] text-[19px] leading-relaxed text-secondary sm:text-[21px]">Rules are the minimum. We check how easy daily life would be, then find the best fit and the fixes.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/?q=${EXAMPLES[0].q}`} className="rounded-md bg-brand px-6 py-3.5 text-[16px] font-semibold text-white no-underline hover:brightness-110">Check a street in LA</Link>
            <a href="#how" className="rounded-md px-6 py-3.5 text-[16px] font-semibold text-brand no-underline ring-1 ring-line ring-inset hover:bg-kicker">How it works</a>
          </div>
          <p className="mt-6 text-[14px] text-secondary">Or try <Link href={`/?q=${EXAMPLES[1].q}`} className="font-medium text-brand underline decoration-line underline-offset-4">{EXAMPLES[1].label}</Link>, or type any latitude, longitude above.</p>
        </div>
        <figure className="relative m-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- one remote photo, no image pipeline needed */}
          <img src="https://images.unsplash.com/photo-1756312177391-021928b460c8?w=1100&q=80&auto=format" alt="A woman in a wheelchair at the open front door of a brick home, a small step at the threshold"
            className="block aspect-[4/5] w-full rounded-lg object-cover object-[center_70%] md:aspect-[4/4.6]" />
          <figcaption className="absolute bottom-4 left-4 right-4 rounded-md bg-white/95 px-4 py-3 text-[14px] leading-snug shadow-sm sm:right-auto sm:max-w-[300px]">
            <b className="font-display text-[15px] text-bad">Step at the door</b><br />One threshold can decide whether a home works. We find it before you sign.
          </figcaption>
        </figure>
      </section>

      <section className="mt-20 grid gap-8 md:grid-cols-3 md:gap-6">
        {[
          { b: "<4%", red: true, s: "of US homes are livable with trouble walking.", n: "Under 0.2% fully wheelchair accessible. HUD-funded NYU study, 2011" },
          { b: "13.4%", s: "of US adults have trouble walking a quarter mile.", n: "2.3% (5.5M) use a wheelchair. US Census Bureau, 2014" },
          { b: "<50%", s: "of wheelchair users can turn fully in the standard circle.", n: "US Access Board research" },
        ].map((x) => (
          <div key={x.b} className="border-t-2 border-brand pt-5">
            <b className={`block font-display text-[46px] font-bold leading-none tracking-[-0.04em] ${x.red ? "text-bad" : "text-brand"}`}>{x.b}</b>
            <p className="mt-3 text-[16px]">{x.s}</p>
            <p className="mt-2 text-[12px] text-secondary">{x.n}</p>
          </div>
        ))}
      </section>

      <section id="how" className="scroll-mt-24 pt-20">
        <h2 className="text-[32px] font-bold text-brand">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["01", "The tour", "A real 3D scan of the apartment."],
            ["02", "The check", "Every door, step and room, measured against the ADA limits."],
            ["03", "The answer", "The best fit, the fixes, and a guide you can talk to."],
          ].map(([n, h, p]) => (
            <div key={n} className="border-t border-line pt-5">
              <div className="font-display text-[13px] font-medium text-brand">{n}</div>
              <h3 className="mt-2 text-[22px] font-bold">{h}</h3>
              <p className="mt-1.5 text-[15px] text-secondary">{p}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-6 rounded-lg bg-brand px-6 py-8 text-white sm:px-10">
          <div className="max-w-xl">
            <h3 className="text-[26px] font-bold">Around the building, too</h3>
            <p className="mt-2 text-[16px] leading-relaxed text-white/80">We measure the slope of every street and path within 250 m from Vexcel&apos;s elevation data, and find transit, curb ramps and elevators in OpenStreetMap.</p>
          </div>
          <Link href={`/?q=${EXAMPLES[0].q}`} className="rounded-md bg-white px-6 py-3.5 text-[16px] font-semibold text-brand no-underline hover:bg-kicker">See the streets</Link>
        </div>
      </section>

      <footer className="mt-16 flex flex-wrap justify-between gap-6 border-t border-line pt-6 text-[12px] leading-relaxed text-secondary">
        <div>
          <p>The 3D apartment checks run in our live demo at HackPrinceton.</p>
          <p>Limits from the 2010 ADA Standards and the US Access Board. Confirm with a tape before you sign.</p>
          <p>Imagery and elevation © Vexcel Imaging US, Inc. Map data © OpenStreetMap contributors. Photo: Unsplash.</p>
        </div>
        <span className="font-display text-[15px] font-bold tracking-[-0.04em] text-brand">Inch <span className="font-medium text-sage">&amp;</span> Ease</span>
      </footer>
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
        <Stat label="Steepest stretch within 100 m" value={s.steepestNear ? (s.steepestNear.steps ? "Steps" : `${s.steepestNear.slope.toFixed(1)}%`) : "No streets"} note={s.steepestNear ? [s.steepestNear.name, `Red when a manual wheelchair can't use it both ways (${PROFILES[0].up}% up, ${PROFILES[0].down}% down)`].filter(Boolean).join(". ") : undefined}
          bad={!!s.steepestNear && verdict(s.steepestNear, PROFILES[0]) !== "both"} />
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
              <img src={img(`oblique-${d}`, 40)} alt={`Vexcel oblique photo looking ${d}`} className="block aspect-square w-full rounded-[20px] bg-black/5 object-cover text-transparent" />
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
