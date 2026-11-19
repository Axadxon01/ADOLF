import type { Config } from "@netlify/functions";
import { accessCode, codeMatches, createToken, json, secret } from "./lib/auth.mts";

// Bitta instansiya ichida qo'shimcha himoya (asosiy himoya — rateLimit konfiguratsiyasi).
const fails = new Map<string, { n: number; until: number }>();

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== "POST") return json({ error: "Faqat POST" }, 405);
  const expected = accessCode();
  const key = secret();
  if (!expected || !key) return json({ error: "Server sozlanmagan: ACCESS_CODE va SESSION_SECRET kerak." }, 503);

  const who = context.ip || "unknown";
  const state = fails.get(who);
  if (state && state.until > Date.now()) return json({ error: "Juda ko'p urinish. Keyinroq urinib ko'ring." }, 429);

  let code = "";
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code.slice(0, 200) : "";
  } catch {
    return json({ error: "Noto'g'ri so'rov" }, 400);
  }

  if (!codeMatches(code, expected)) {
    const n = (state?.n ?? 0) + 1;
    fails.set(who, n >= 5 ? { n: 0, until: Date.now() + 5 * 60_000 } : { n, until: 0 });
    return json({ error: "Noto'g'ri kod." }, 401);
  }
  fails.delete(who);
  return json({ token: createToken(key) });
};

export const config: Config = {
  path: "/api/login",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
