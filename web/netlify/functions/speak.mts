import type { Config } from "@netlify/functions";
import { json, requireAuth } from "./lib/auth.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Faqat POST" }, 405);
  const denied = requireAuth(req);
  if (denied) return denied;

  const key = Netlify.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "AI sozlanmagan: OPENAI_API_KEY kerak." }, 503);
  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim().slice(0, 1500) : "";
  } catch {
    return json({ error: "Noto'g'ri so'rov" }, 400);
  }
  if (!text) return json({ error: "Matn bo'sh." }, 400);

  const base = (Netlify.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: Netlify.env.get("OPENAI_TTS_MODEL") || "tts-1",
        voice: Netlify.env.get("OPENAI_TTS_VOICE") || "onyx",
        input: text,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    return json({ error: "Ovoz xizmatiga ulanib bo'lmadi." }, 502);
  }
  if (!res.ok) {
    console.error("TTS xatosi", res.status);
    return json({ error: "Ovoz xizmati vaqtincha ishlamayapti." }, 502);
  }
  return new Response(await res.arrayBuffer(), {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
};

export const config: Config = {
  path: "/api/speak",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
