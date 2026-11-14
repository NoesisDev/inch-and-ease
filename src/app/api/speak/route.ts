// Assistant reply in, spoken MP3 out (Fish Audio text-to-speech, about $0.015 per 1,000 characters).
import { speak } from "@/lib/fish";

export async function POST(req: Request) {
  const text = (await req.json().catch(() => null))?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 1500) return Response.json({ error: "Nothing to say" }, { status: 400 });
  try {
    return new Response(await speak(text), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
