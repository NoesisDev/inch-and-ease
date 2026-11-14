"use client";
// Streets coloured by what the chosen profile can manage, recoloured live as limits change (AccessMap-style).
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Grid } from "./Terrain3D";
import { findIssues, PROFILES, verdict, type IssueInput, type Verdict } from "@/lib/issues";

export type MapSeg = IssueInput["segs"][number] & { x1: number; y1: number; x2: number; y2: number; za: number; zb: number };
// three.js only loads when someone opens the 3D view.
const Terrain3D = dynamic(() => import("./Terrain3D"), { ssr: false, loading: () => <p className="h-[560px] p-4 text-secondary">Loading 3D view</p> });
export type MapPoi = { x: number; y: number; kind: string; name?: string; kerb?: string };
export type Facts = Omit<IssueInput, "segs">;

// Apple system colours, the vivid set, so lines stay readable on an aerial photo.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const COLOR: Record<Verdict, string> = { both: "#0A84FF", one: "#FF9F0A", no: "#FF453A" };
const LEVEL = {
  barrier: { label: "Barrier", color: "#FF3B30", path: "M8 8l8 8M16 8l-8 8" },
  warning: { label: "Warning", color: "#FF9500", path: "M12 7v6M12 16.5v.5" },
  unknown: { label: "Not known", color: "#8E8E93", path: "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5v.5" },
};

export default function SlopeMap({ img, segs, pois, home, facts, grid, size }:
  { img: string; segs: MapSeg[]; pois: MapPoi[]; home: [number, number]; facts: Facts; grid: Grid; size: number }) {
  const [view, setView] = useState<"map" | "3d">("map");
  const [lift, setLift] = useState(1); // true scale by default
  const [buildings, setBuildings] = useState(true);
  const [profile, setProfile] = useState("manual");
  const [up, setUp] = useState(8);
  const [down, setDown] = useState(10);
  const [avoidSteps, setAvoidSteps] = useState(true);
  const [sel, setSel] = useState<number | null>(null); // index of the selected street piece
  const [focus, setFocus] = useState(0); // bumped when the 3D camera should fly to the selection
  const [label, setLabel] = useState(""); // Claude's name for the described setup
  // Voice assistant: idle -> listening -> hearing (speech to text) -> thinking (Claude) -> speaking (text to speech).
  type Phase = "idle" | "listening" | "hearing" | "thinking" | "speaking";
  const [ask, setAsk] = useState({ text: "", phase: "idle" as Phase, heard: "", reply: "", error: "", typing: false });
  const busy = ask.phase !== "idle" && ask.phase !== "listening" && ask.phase !== "speaking";
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const pick = (p: (typeof PROFILES)[number]) => { setProfile(p.id); setUp(p.up); setDown(p.down); setAvoidSteps(p.avoidSteps); };
  const custom = (f: () => void) => { setProfile("custom"); setLabel(""); f(); };

  const vs = segs.map((s) => verdict(s, { up, down, avoidSteps }));
  const issues = findIssues({ ...facts, segs }, { up, down, avoidSteps });
  const len = { both: 0, one: 0, no: 0 };
  vs.forEach((v, i) => (len[v] += segs[i].len));
  const total = len.both + len.one + len.no || 1;
  const pct = (v: Verdict) => `${Math.round((len[v] / total) * 100)}%`;
  const oneWayLabel = up < down ? "downhill only" : up > down ? "uphill only" : "one way only";
  const picked = sel === null ? null : segs[sel];
  const meaning = (s: MapSeg, v: Verdict) =>
    v === "both" ? `Usable in both directions within your limits of ${up}% up and ${down}% down.`
    : v === "one" ? (up < down ? "Fine going down, too steep going up." : "Fine going up, too steep going down.")
    : s.steps ? "Steps, not passable with these settings." : `Too steep in both directions, over ${Math.max(up, down)}%.`;
  const show = (s: MapSeg) => { setSel(segs.indexOf(s)); setFocus((f) => f + 1); };

  // Plain words in, limits out: Claude reads the description and the street slopes here, sets the limits and explains.
  async function describe(e: React.FormEvent) {
    e.preventDefault();
    if (ask.text.trim() && !busy) await askClaude(ask.text.trim());
  }

  async function mic() {
    player.current?.pause();
    // Unlock audio inside the tap: Safari blocks sound that starts seconds after the gesture, when the answer arrives.
    if (!player.current) { player.current = new Audio(SILENT_WAV); player.current.play().catch(() => {}); }
    if (recorder.current?.state === "recording") { recorder.current.stop(); return; } // second tap: done talking
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setAsk((a) => ({ ...a, phase: "hearing", error: "" }));
        try {
          const form = new FormData();
          form.append("audio", new Blob(parts, { type: rec.mimeType }));
          const r = await fetch("/api/listen", { method: "POST", body: form });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (!d.text) throw new Error("I did not catch that. Tap the microphone and try again.");
          await askClaude(d.text);
        } catch (err) {
          setAsk((a) => ({ ...a, phase: "idle", error: (err as Error).message }));
        }
      };
      recorder.current = rec;
      rec.start();
      setTimeout(() => rec.state === "recording" && rec.stop(), 20000); // never record forever
      setAsk((a) => ({ ...a, phase: "listening", heard: "", error: "" }));
    } catch {
      setAsk((a) => ({ ...a, phase: "idle", typing: true, error: "Microphone not available. You can type instead." }));
    }
  }

  async function askClaude(message: string) {
    setAsk((a) => ({ ...a, phase: "thinking", heard: message, error: "" }));
    // Per street, its steepest piece close to the building (within 120 m) if it has one, else its steepest piece;
    // slope and distance always come from the same piece, so "right by the door" means what it says.
    const byName = new Map<string, { name: string; slope: number; near: number }>();
    for (const s of segs) {
      if (!s.name || s.steps) continue;
      const b = byName.get(s.name), close = s.near <= 120, bClose = !!b && b.near <= 120;
      if (!b || (close && !bClose) || (close === bClose && s.slope > b.slope)) byName.set(s.name, { name: s.name, slope: s.slope, near: s.near });
    }
    const streets = [...byName.values()].sort((x, y) => x.near - y.near).slice(0, 40);
    const factText = [
      facts.stepFree ? `Nearest step-free station ${facts.stepFree.name ?? ""} ${facts.stepFree.dist} m.` : facts.station ? `Nearest station ${facts.station.name ?? ""} ${facts.station.dist} m, step-free access unknown.` : "No rail station within 2 km.",
      `${facts.busStops400} bus stops within 400 m.`,
      facts.kerbs ? `${facts.loweredKerbs} of ${facts.kerbs} mapped curbs within 150 m are lowered.` : "No curbs mapped within 150 m.",
    ].join(" ");
    let reply = "";
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, limits: { up, down, avoidSteps }, streets, facts: factText }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Claude could not answer just now. Try again.");
      setProfile("custom"); setLabel(d.label); setUp(d.up); setDown(d.down); setAvoidSteps(d.avoidSteps);
      const target = d.focus && segs.filter((s) => s.name === d.focus).sort((x, y) => x.near - y.near)[0];
      if (target) show(target);
      reply = d.reply;
      setAsk((a) => ({ ...a, text: "", phase: "speaking", reply }));
    } catch (err) {
      setAsk((a) => ({ ...a, phase: "idle", error: (err as Error).message }));
      return;
    }
    // Say it out loud; the text stays on screen for anyone who cannot listen, so a voice failure only ends the speaking state.
    try {
      const audio = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: reply }) });
      if (!audio.ok) throw new Error("voice unavailable");
      const p = (player.current ??= new Audio());
      p.src = URL.createObjectURL(await audio.blob());
      p.onended = () => setAsk((a) => ({ ...a, phase: "idle" }));
      await p.play();
    } catch {
      setAsk((a) => ({ ...a, phase: "idle" }));
    }
  }

  return (
    <section className="glass min-w-0 flex-[999_1_560px] p-5 sm:p-6">
      <h1 className="text-[28px] font-semibold tracking-tight">Getting around</h1>
      <p className="mb-4 text-[15px] text-secondary">Talk to the assistant or choose a profile. Streets are coloured by what you can manage.</p>

      <div className="mb-3 flex items-center gap-4 rounded-[24px] bg-white/80 px-4 py-3 shadow-sm">
        <button onClick={mic} disabled={busy} aria-label={ask.phase === "listening" ? "Stop and send" : "Talk to the assistant"}
          className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white shadow-md transition disabled:opacity-50 ${ask.phase === "listening" ? "bg-bad" : "bg-tint"}`}>
          {ask.phase === "listening" && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-bad/40" />}
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {ask.phase === "listening" ? <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
          </svg>
        </button>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-[17px] font-semibold">
            {{ idle: "Tell me how you get around", listening: "Listening. Tap again when you are done", hearing: "Got it", thinking: "Working out your limits", speaking: "Answering" }[ask.phase]}
          </p>
          <p className="truncate text-[13px] text-secondary">
            {ask.heard ? `You said: ${ask.heard}` : "For example: I push a manual chair and my arms tire on hills"}
          </p>
        </div>
        <button onClick={() => setAsk((a) => ({ ...a, typing: !a.typing }))} className="shrink-0 rounded-full px-3 py-2 text-[13px] font-medium text-tint">
          {ask.typing ? "Hide keyboard" : "Type instead"}
        </button>
      </div>
      {ask.typing && (
        <form onSubmit={describe} className="mb-3 flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-5 pr-1.5 shadow-sm">
          <label htmlFor="describe" className="sr-only">Describe your mobility</label>
          <input id="describe" value={ask.text} onChange={(e) => setAsk((a) => ({ ...a, text: e.target.value }))} disabled={busy}
            placeholder="Describe how you get around" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-secondary" />
          <button disabled={busy || !ask.text.trim()} className="min-h-10 shrink-0 rounded-full bg-tint px-5 text-[15px] font-semibold text-white disabled:opacity-40">Ask</button>
        </form>
      )}
      {(ask.reply || ask.error) && (
        <div role="status" className={`mb-4 rounded-[20px] px-5 py-4 text-[15px] leading-relaxed shadow-sm ${ask.error ? "bg-white/80 text-bad" : "bg-tint/10 text-label"}`}>
          {ask.error || ask.reply}
        </div>
      )}

      <div role="group" aria-label="Who is checking" className="segmented mb-4">
        {PROFILES.map((p) => (
          <button key={p.id} onClick={() => pick(p)} aria-pressed={profile === p.id} className="segment">{p.label}</button>
        ))}
        <span aria-pressed={profile === "custom"} className={`segment inline-flex items-center ${profile === "custom" ? "" : "text-secondary"}`}>{profile === "custom" && label ? label : "Custom"}</span>
      </div>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-secondary">
          <span className="flex justify-between">Steepest uphill <b className="text-[15px] text-label">{up}%</b></span>
          <input type="range" min={0} max={20} step={1} value={up} onChange={(e) => custom(() => setUp(+e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-secondary">
          <span className="flex justify-between">Steepest downhill <b className="text-[15px] text-label">{down}%</b></span>
          <input type="range" min={0} max={20} step={1} value={down} onChange={(e) => custom(() => setDown(+e.target.value))} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" checked={avoidSteps} onChange={(e) => custom(() => setAvoidSteps(e.target.checked))} className="h-5 w-5" />
          Avoid steps
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="View" className="segmented">
          {(["map", "3d"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className="segment">{v === "map" ? "Map" : "3D"}</button>
          ))}
        </div>
        {view === "3d" && (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" checked={buildings} onChange={(e) => setBuildings(e.target.checked)} className="h-5 w-5" />
            Buildings and trees
          </label>
        )}
        {view === "3d" && (
          <label className="ml-auto flex items-center gap-3 text-[13px] font-medium text-secondary">
            Ground height {lift === 1 ? "true scale" : `×${lift}`}
            <input type="range" min={1} max={4} step={1} value={lift} onChange={(e) => setLift(+e.target.value)} />
          </label>
        )}
      </div>
      {view === "3d" && (
        <>
          <div className="overflow-hidden rounded-[20px]">
            <Terrain3D img={img} grid={grid} size={size} segs={segs} colors={vs.map((v) => COLOR[v])} home={home} exaggeration={lift} buildings={buildings}
              pois={pois} selected={sel} focus={focus} onSelect={setSel} />
          </div>
          <p className="mt-2 text-[12px] text-secondary">Click a street for details. Drag to turn, scroll to zoom, right-drag to move. Buildings and trees are always shown at true height.</p>
        </>
      )}
      <div className={view === "map" ? "relative overflow-hidden rounded-[20px]" : "hidden"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied Vexcel JPEG */}
        <img src={img} alt="Vexcel aerial photo of the area, north up" className="block w-full" />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Streets coloured for this profile: ${pct("both")} usable both ways, ${pct("one")} ${oneWayLabel}, ${pct("no")} too steep`}>
          {segs.map((s, i) => (
            <g key={i}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="rgba(0,0,0,0.55)" strokeWidth={7} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={COLOR[vs[i]]} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeDasharray={s.steps ? "2 3" : undefined} />
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={() => setSel(i)}>
                <title>{`${s.name ?? `Unnamed ${s.kind ?? "path"}`}, ${s.steps ? "steps" : `${s.slope.toFixed(1)}%`}`}</title>
              </line>
            </g>
          ))}
          {picked && (
            <g pointerEvents="none">
              <line x1={picked.x1} y1={picked.y1} x2={picked.x2} y2={picked.y2} stroke="#ffffff" strokeWidth={12} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1={picked.x1} y1={picked.y1} x2={picked.x2} y2={picked.y2} stroke={COLOR[vs[sel!]]} strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </g>
          )}
          {pois.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.kind === "kerb" ? 5 : 9} strokeWidth={2} stroke="rgba(0,0,0,0.6)" vectorEffect="non-scaling-stroke"
              fill={p.kind === "kerb" ? (p.kerb === "lowered" || p.kerb === "flush" ? "#ffffff" : "#FF9F0A") : p.kind === "bus" ? "#FFD60A" : "#BF5AF2"}>
              <title>{`${p.kind === "bus" ? "Bus stop" : p.kind === "kerb" ? `Kerb, ${p.kerb}` : p.kind}${p.name ? `, ${p.name}` : ""}`}</title>
            </circle>
          ))}
          <circle cx={home[0]} cy={home[1]} r={14} fill="none" stroke="#ffffff" strokeWidth={4} vectorEffect="non-scaling-stroke" />
          <circle cx={home[0]} cy={home[1]} r={5} fill="#ffffff" />
        </svg>
      </div>

      {picked && (
        <div role="region" aria-label="Selected street" className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[20px] bg-white/80 px-5 py-4 shadow-sm">
          <div className="min-w-0 flex-[1_1_220px]">
            <p className="flex items-center gap-2 text-[17px] font-semibold">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLOR[vs[sel!]] }} />
              {picked.name ?? `Unnamed ${picked.kind ?? "path"}`}
            </p>
            <p className="text-[15px] text-secondary">{meaning(picked, vs[sel!])}</p>
          </div>
          <dl className="flex gap-6">
            {[["Slope", picked.steps ? "Steps" : `${picked.slope.toFixed(1)}%`], ["Rise", `${Math.abs(picked.zb - picked.za).toFixed(1)} m`], ["Length", `${Math.round(picked.len)} m`], ["From building", `${Math.round(picked.near)} m`]].map(([k, v]) => (
              <div key={k}><dt className="text-[12px] font-medium text-secondary">{k}</dt><dd className="text-[22px] font-semibold tracking-tight">{v}</dd></div>
            ))}
          </dl>
          <button onClick={() => setSel(null)} className="min-h-10 rounded-full bg-black/5 px-4 text-[15px] font-medium">Close</button>
        </div>
      )}

      <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-black/5" aria-hidden="true">
        <div style={{ width: pct("both"), background: COLOR.both }} /><div style={{ width: pct("one"), background: COLOR.one }} /><div style={{ width: pct("no"), background: COLOR.no }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-secondary">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.both }} /><b className="text-label">{pct("both")}</b> usable both ways</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.one }} /><b className="text-label">{pct("one")}</b> {oneWayLabel}</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.no }} /><b className="text-label">{pct("no")}</b> too steep{avoidSteps ? " or steps" : ""}</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#FFD60A]" />Bus stop</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-black/40 bg-white" />Lowered curb</li>
      </ul>
      <p className="mt-1 text-[12px] text-secondary">Share of street length within 250 m. Profile presets from AccessMap, University of Washington.</p>

      <h2 className="mt-7 mb-3 text-[22px] font-semibold tracking-tight">{issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""} around this building` : "No issues found around this building"}</h2>
      <ul className="overflow-hidden rounded-[20px] bg-white/80 shadow-sm" aria-live="polite">
        {issues.map((i, k) => (
          <li key={k} className="flex items-center gap-4 border-b border-black/5 px-5 py-4 last:border-0">
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" className="shrink-0">
              <circle cx="12" cy="12" r="11" fill={LEVEL[i.level].color} />
              <path d={LEVEL[i.level].path} stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            </svg>
            <span className="min-w-0 flex-1 text-[15px]">
              <span className="sr-only">{LEVEL[i.level].label}: </span>
              <span className="block font-semibold">{i.title}</span>
              <span className="block text-secondary">{i.detail}</span>
            </span>
            {i.seg && (
              <button onClick={() => show(i.seg as MapSeg)} className="min-h-10 shrink-0 rounded-full bg-tint/10 px-4 text-[15px] font-semibold text-tint">
                Show
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
