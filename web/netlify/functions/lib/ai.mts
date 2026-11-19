import { json } from "./auth.mts";

export const SYSTEM_PROMPT =
  "Sen ADOLF — aqlli raqamli yordamchisan. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (asosan o'zbekcha) aniq, qisqa va foydali javob ber.";

type Msg = { role: "system" | "user" | "assistant"; content: unknown };

export class AIError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

/** OpenAI-mos chat completions chaqiruvi. OPENAI_BASE_URL bo'lsa (masalan Netlify AI Gateway) o'sha ishlatiladi. */
export async function complete(messages: Msg[], maxTokens = 600): Promise<string> {
  const key = Netlify.env.get("OPENAI_API_KEY");
  if (!key) throw new AIError("AI sozlanmagan: OPENAI_API_KEY kerak.", 503);
  const base = (Netlify.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Netlify.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new AIError("AI xizmatiga ulanib bo'lmadi.");
  }
  if (!res.ok) {
    console.error("AI xatosi", res.status, (await res.text()).slice(0, 300));
    throw new AIError("AI xizmati vaqtincha ishlamayapti.");
  }
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

export function aiErrorResponse(err: unknown): Response {
  if (err instanceof AIError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: "Ichki xatolik." }, 500);
}
