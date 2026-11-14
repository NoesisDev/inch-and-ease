// "Describe yourself" → Claude turns plain words into slope limits and explains what they mean for this address.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic(); // ANTHROPIC_API_KEY from .env.local

const Answer = z.object({
  up: z.number().describe("Steepest uphill slope in percent this person can manage, 0 to 20"),
  down: z.number().describe("Steepest downhill slope in percent, 0 to 20"),
  avoidSteps: z.boolean().describe("True if any step or stair is a barrier for them"),
  label: z.string().describe("Two to four words naming this person's setup, e.g. 'Manual chair, tired arms'"),
  reply: z.string().describe("At most two short spoken sentences, under 45 words, plain language"),
  focus: z.string().nullable().describe("Exact name of one street from the list worth showing them, or null"),
});

const SYSTEM = `You help a person with a mobility disability judge the streets around one building.
You set three limits from what they tell you: the steepest uphill and downhill slope (percent) they can manage, and whether steps stop them.

Reference points, from AccessMap (University of Washington) and Bolten and Caspi, PLOS ONE 2021:
- Manual wheelchair: 8% up, 10% down, steps are a barrier.
- Power wheelchair: 12% up, 12% down, steps are a barrier.
- Cane: 14% up, 14% down, steps are usually fine.
- A walking route should be no steeper than 5% (ADA); a ramp no steeper than 8.33%.
Adjust from these for what they describe (tiring arms, power assist, a helper pushing, balance, pain, a walker, a scooter). If they say nothing that changes a limit, keep the current one.

Then reply in at most two short sentences, under 45 words, because your reply is read aloud: what you set, and the one or two streets that matter most here, using only the slopes and facts you are given. Name real streets from the list. Never invent numbers. Write plainly, like a helpful person, with no bullet points, no headings and no dots or symbols between phrases. If the message is not about mobility or these streets, keep the limits and say briefly what you can help with.`;

const Body = z.object({
  message: z.string().min(1).max(1000),
  limits: z.object({ up: z.number(), down: z.number(), avoidSteps: z.boolean() }),
  streets: z.array(z.object({ name: z.string(), slope: z.number(), near: z.number() })).max(60),
  facts: z.string().max(2000),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { message, limits, streets, facts } = body.data;
  const context = `Current limits: ${limits.up}% up, ${limits.down}% down, steps ${limits.avoidSteps ? "avoided" : "allowed"}.
Streets near the building (steepest 10 m stretch, distance from the door):
${streets.map((s) => `${s.name}: ${s.slope.toFixed(1)}%, ${Math.round(s.near)} m`).join("\n")}
Other facts: ${facts}`;

  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(Answer) }, // short, chat-like answer
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // a declined request is retried on a fallback model in the same call
      system: SYSTEM,
      messages: [{ role: "user", content: `${context}\n\nThe person says: ${message}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return Response.json({ error: "Claude could not answer that one. Try describing your mobility." }, { status: 502 });
    const a = res.parsed_output;
    const clamp = (v: number) => Math.min(20, Math.max(0, Math.round(v)));
    return Response.json({ ...a, up: clamp(a.up), down: clamp(a.down) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Too many questions at once. Try again in a moment." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Claude is unavailable (${e.status}).` }, { status: 502 });
    throw e;
  }
}
