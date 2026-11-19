import type { Config } from "@netlify/functions";
import { json, requireAuth } from "./lib/auth.mts";
import { aiErrorResponse, complete, SYSTEM_PROMPT } from "./lib/ai.mts";

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Faqat POST" }, 405);
  const denied = requireAuth(req);
  if (denied) return denied;

  let messages: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const body = await req.json();
    messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  } catch {
    return json({ error: "Noto'g'ri so'rov" }, 400);
  }
  if (!messages.length || messages[messages.length - 1].role !== "user" || !messages[messages.length - 1].content.trim()) {
    return json({ error: "Oxirgi xabar foydalanuvchidan bo'lishi kerak." }, 400);
  }

  try {
    const reply = await complete([{ role: "system", content: SYSTEM_PROMPT }, ...messages], 700);
    return json({ reply });
  } catch (err) {
    return aiErrorResponse(err);
  }
};

export const config: Config = {
  path: "/api/chat",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
