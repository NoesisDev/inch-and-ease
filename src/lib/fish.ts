// Fish Audio for the voice assistant: speech to text (ASR) and text to speech (TTS). Server only.
// The key and the chosen voice stay in ~/.hackathon-video (never in the project); env vars override them.
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API = "https://api.fish.audio";
const HOME = path.join(os.homedir(), ".hackathon-video");

async function key() {
  const k = process.env.FISH_API_KEY?.trim() || (await readFile(path.join(HOME, "fish.key"), "utf8").catch(() => "")).trim();
  if (!k) throw new Error("Fish Audio key not found");
  return k;
}

async function voice() {
  if (process.env.FISH_VOICE_ID) return process.env.FISH_VOICE_ID;
  const v = JSON.parse(await readFile(path.join(HOME, "voice.json"), "utf8").catch(() => "{}"));
  return typeof v.reference_id === "string" ? v.reference_id : undefined;
}

export async function transcribe(audio: Blob) {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  form.append("language", "en");
  const r = await fetch(`${API}/v1/asr`, { method: "POST", headers: { Authorization: `Bearer ${await key()}`, model: "transcribe-1-pro" }, body: form });
  if (!r.ok) throw new Error(`Fish speech-to-text answered ${r.status}`);
  return String((await r.json()).text ?? "").replace(/<\|[^|]*\|>/g, "").trim(); // drop speaker tags like <|speaker:0|>
}

export async function speak(text: string) {
  const r = await fetch(`${API}/v1/tts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await key()}`, "Content-Type": "application/json", model: "s2-pro" },
    body: JSON.stringify({ text, reference_id: await voice(), format: "mp3", mp3_bitrate: 128, normalize: true }),
  });
  if (!r.ok) throw new Error(`Fish text-to-speech answered ${r.status}`);
  return r.arrayBuffer();
}
