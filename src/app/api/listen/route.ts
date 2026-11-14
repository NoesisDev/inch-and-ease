// Recorded speech in, transcript out (Fish Audio speech-to-text).
import { transcribe } from "@/lib/fish";

export async function POST(req: Request) {
  const audio = (await req.formData().catch(() => null))?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 10_000_000) return Response.json({ error: "No recording received" }, { status: 400 });
  try {
    return Response.json({ text: await transcribe(audio) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
