// Buildings (OSM outline + Vexcel height) and trees (Vexcel canopy) for the 3D view. ?lat&lon
import { scene3d } from "@/lib/buildings";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return new Response("bad lat or lon", { status: 400 });
  try {
    return Response.json(await scene3d(lat, lon), { headers: { "Cache-Control": "no-store" } }); // OSM part is cached on disk
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
