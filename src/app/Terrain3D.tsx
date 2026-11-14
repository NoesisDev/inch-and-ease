"use client";
// 3D view: Vexcel elevation as a mesh (bare ground, or the surface with buildings and trees), the aerial photo
// draped on it, streets drawn on top in slope colours.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export type Grid = { w: number; h: number; heights: (number | null)[] };
type Seg3 = { x1: number; y1: number; x2: number; y2: number; za: number; zb: number };

const LIFT = 2; // metres above the ground mesh, so the coarse mesh doesn't hide the lines

// The aerial photo URL from the page, at another size or as the matching elevation endpoint.
function variant(img: string, path: string, set: Record<string, string>, drop: string[] = []) {
  const u = new URL(img, window.location.origin);
  u.pathname = path;
  for (const [k, v] of Object.entries(set)) u.searchParams.set(k, v);
  for (const k of drop) u.searchParams.delete(k);
  return u.pathname + u.search;
}

type Poi3 = { x: number; y: number; kind: string; kerb?: string };
const POI_COLOR = (p: Poi3) => (p.kind === "kerb" ? (p.kerb === "lowered" || p.kerb === "flush" ? "#ffffff" : "#f97316") : p.kind === "bus" ? "#facc15" : "#a855f7");

export default function Terrain3D({ img, grid, size, segs, colors, home, exaggeration, buildings, pois, selected, focus, onSelect }:
  { img: string; grid: Grid; size: number; segs: Seg3[]; colors: string[]; home: [number, number]; exaggeration: number; buildings: boolean;
    pois: Poi3[]; selected: number | null; focus: number; onSelect: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const lines = useRef<LineSegmentsGeometry | null>(null);
  // Scene handles the selection effects need: street end points, the highlight line, and a camera fly target.
  const scene3 = useRef<{ ends: number[]; glow: LineSegments2; fly: { target: THREE.Vector3; cam: THREE.Vector3 } | null;
    controls: OrbitControls; camera: THREE.Camera } | null>(null);
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  // Which surface finished loading, and any error; "loading" is derived, never set inside the effect.
  const key = `${img}|${buildings}|${exaggeration}`;
  const [loaded, setLoaded] = useState<{ key: string; error?: string }>({ key: "" });
  const status = buildings && loaded.key !== key ? "Loading buildings and trees…"
    : loaded.key === key && loaded.error ? `Buildings not available here (${loaded.error}); showing bare ground.` : "";

  // Build the scene; rebuilt when the place, the height exaggeration or the surface changes.
  useEffect(() => {
    const el = box.current!;
    let stop = false;
    const known = grid.heights.filter((v): v is number => v !== null);
    const zmin = Math.min(...known);
    const y = (z: number | null) => ((z ?? zmin) - zmin) * exaggeration;
    const m = (u: number) => (u / 1000 - 0.5) * size; // map units (0..1000) -> metres from the centre

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a");
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    const target = new THREE.Vector3(m(home[0]), 0, m(home[1]));
    camera.position.set(target.x + size * 0.35, size * 0.55, target.z + size * 0.75);

    const tex = new THREE.TextureLoader().load(variant(img, "/api/image", { px: "4096" }));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const groundMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    // Bare ground only: draping the photo over roofs and trees smeared it down every wall.
    const ground = new THREE.PlaneGeometry(size, size, grid.w - 1, grid.h - 1);
    ground.rotateX(-Math.PI / 2); // plane's top row (north) ends up at -z
    const gpos = ground.attributes.position;
    for (let i = 0; i < gpos.count; i++) gpos.setY(i, y(grid.heights[i]));
    ground.computeVertexNormals();
    scene.add(new THREE.Mesh(ground, groundMat));

    if (buildings) {
      fetch(variant(img, "/api/buildings", { v: "2" }, ["view", "half", "px"])) // v: skips copies cached before the bridge fix
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          const d: { buildings: { pts: [number, number][]; ground: number; height: number }[]; trees: [number, number, number, number][] } = await r.json();
          if (stop) return;
          // Buildings: real outline, real height; roofs show the photo (mapped straight down), walls a plain colour.
          const roofMat = new THREE.MeshLambertMaterial({ map: tex });
          const wallMat = new THREE.MeshLambertMaterial({ color: "#d6d3d1" });
          for (const bld of d.buildings) {
            const shape = new THREE.Shape(bld.pts.map(([u, v]) => new THREE.Vector2(m(u), -m(v))));
            const g = new THREE.ExtrudeGeometry(shape, { depth: bld.height, bevelEnabled: false });
            g.rotateX(-Math.PI / 2); // extrusion now points up, outline lies on x/z
            g.translate(0, y(bld.ground), 0);
            const p = g.attributes.position, uv = g.attributes.uv;
            for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / size, 0.5 - p.getZ(i) / size);
            g.computeVertexNormals();
            scene.add(new THREE.Mesh(g, [roofMat, wallMat]));
          }
          // Trees: a crown at Vexcel's measured canopy height, sized from that height.
          const crown = new THREE.IcosahedronGeometry(1, 1);
          const trees = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: "#ffffff" }), d.trees.length);
          const mtx = new THREE.Matrix4(), col = new THREE.Color();
          d.trees.forEach(([u, v, gz, h], i) => {
            const r = Math.min(4.5, Math.max(1.5, h * 0.35));
            mtx.compose(new THREE.Vector3(m(u), y(gz) + h - r, m(v)), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.1, r));
            trees.setMatrixAt(i, mtx);
            trees.setColorAt(i, col.setHSL(0.27 + ((i * 37) % 10) / 200, 0.35, 0.28 + ((i * 53) % 10) / 100));
          });
          scene.add(trees);
          setLoaded({ key });
        })
        .catch((e) => { if (!stop) setLoaded({ key, error: e.message }); });
    }
    scene.add(new THREE.HemisphereLight("#ffffff", "#334155", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(-1, 1.2, -0.6); // low sun from the north-west so slopes and walls cast shading
    scene.add(sun);

    const ends = segs.flatMap((s) => [m(s.x1), y(s.za) + LIFT, m(s.y1), m(s.x2), y(s.zb) + LIFT, m(s.y2)]);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(ends);
    lines.current = geo;
    // With buildings and trees on, streets run under canopy and eaves: draw them on top so they stay visible.
    const mat = new LineMaterial({ linewidth: 4, vertexColors: true, depthTest: !buildings });
    const streets = new LineSegments2(geo, mat);
    streets.renderOrder = 1;
    scene.add(streets);
    const glowMat = new LineMaterial({ linewidth: 10, color: "#ffffff", depthTest: false });
    const glow = new LineSegments2(new LineSegmentsGeometry(), glowMat);
    glow.renderOrder = 3;
    glow.visible = false;
    scene.add(glow);

    // Bus stops, stations and kerbs as markers on the ground.
    const groundAt = (u: number, v: number) => y(grid.heights[Math.round((v / 1000) * (grid.h - 1)) * grid.w + Math.round((u / 1000) * (grid.w - 1))]);
    for (const p of pois) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(p.kind === "kerb" ? 2.5 : 5), new THREE.MeshBasicMaterial({ color: POI_COLOR(p), depthTest: !buildings }));
      dot.position.set(m(p.x), groundAt(p.x, p.y) + 6, m(p.y));
      dot.renderOrder = 2;
      scene.add(dot);
    }

    const groundAtHome = y(grid.heights[Math.round((home[1] / 1000) * (grid.h - 1)) * grid.w + Math.round((home[0] / 1000) * (grid.w - 1))]);
    const pinHeight = 30 * exaggeration;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, pinHeight), new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false }));
    pin.renderOrder = 2;
    pin.position.set(target.x, groundAtHome + pinHeight / 2, target.z);
    scene.add(pin);
    target.y = groundAtHome;

    const controls = new OrbitControls(camera, renderer.domElement);
    scene3.current = { ends, glow, fly: null, controls, camera };

    // A click (not a drag) on a street selects it; on empty ground it clears the selection.
    const ray = new THREE.Raycaster();
    ray.params.Line2 = { threshold: 12 };
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObject(streets)[0];
      select.current(hit?.faceIndex ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    controls.target.copy(target);
    controls.enableDamping = true;
    // Keep the camera above the hills: a low angle or a close zoom put it inside the terrain.
    controls.maxPolarAngle = 1.2;
    controls.minDistance = 60;
    controls.maxDistance = size * 2;

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      mat.resolution.set(w, h);
      glowMat.resolution.set(w, h);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    renderer.setAnimationLoop(() => {
      const f = scene3.current?.fly;
      if (f) { // glide towards the selected street
        controls.target.lerp(f.target, 0.12);
        camera.position.lerp(f.cam, 0.12);
        if (camera.position.distanceTo(f.cam) < 1) scene3.current!.fly = null;
      }
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      stop = true;
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      scene3.current = null;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof LineSegments2) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      tex.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      lines.current = null;
    };
  }, [img, grid, size, segs, home, exaggeration, buildings, key, pois]);

  // Highlight the selected street (re-applied after every rebuild).
  useEffect(() => {
    const s = scene3.current;
    if (!s) return;
    s.glow.visible = selected !== null;
    if (selected !== null) (s.glow.geometry as LineSegmentsGeometry).setPositions(s.ends.slice(selected * 6, selected * 6 + 6));
  }, [selected, exaggeration, buildings, key]);

  // "Show in 3D": fly the camera to the selected street, keeping the current viewing direction.
  useEffect(() => {
    const s = scene3.current;
    if (!s || selected === null || focus === 0) return;
    const e = s.ends.slice(selected * 6, selected * 6 + 6);
    const target = new THREE.Vector3((e[0] + e[3]) / 2, (e[1] + e[4]) / 2, (e[2] + e[5]) / 2);
    const dir = s.camera.position.clone().sub(s.controls.target).normalize();
    s.fly = { target, cam: target.clone().add(dir.multiplyScalar(160)) };
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps -- fly only when asked, not on every selection

  // Recolour without rebuilding when the profile or limits change.
  useEffect(() => {
    const c = new THREE.Color();
    lines.current?.setColors(colors.flatMap((hex) => { c.set(hex); return [c.r, c.g, c.b, c.r, c.g, c.b]; }));
  }, [colors, exaggeration, buildings]);

  return (
    <div className="relative">
      <div ref={box} className="h-[560px] w-full overflow-hidden rounded-lg"
        role="img" aria-label="3D view of the area around the building with streets coloured by slope. Drag to turn, scroll to zoom, right-drag to move." />
      {status && <p role="status" className="absolute left-3 top-3 rounded bg-white/90 px-3 py-1 text-sm text-slate-800">{status}</p>}
    </div>
  );
}
