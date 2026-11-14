// Proxies Vexcel imagery so the key stays on the server. ?lat&lon&half&view=ortho|oblique-north|south|east|west
import { bbox, vexcel, wkt } from "@/lib/area";

const VIEWS = ["ortho", "oblique-north", "oblique-south", "oblique-east", "oblique-west"];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon")), half = Number(q.get("half") ?? 250);
  const view = q.get("view") ?? "ortho";
  const px = Math.min(4096, Math.max(256, Number(q.get("px") ?? 1600) || 1600)); // 4096 for the 3D texture
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && half >= 20 && half <= 500 && VIEWS.includes(view)))
    return new Response("bad lat, lon, half or view", { status: 400 });
  try {
    const area = wkt(bbox(lat, lon, half));
    const r = view === "ortho"
      ? await vexcel("ortho/extract", { wkt: area, "image-format": "jpeg", "destination-dimensions": `${px},${px}` })
      : await vexcel("oriented/extract", { wkt: area, layer: "urban", "product-type": view, rotation: "natural", crop: "bbox", "image-format": "jpeg/png" });
    return new Response(await r.arrayBuffer(), {
      headers: { "Content-Type": r.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
