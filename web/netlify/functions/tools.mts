import type { Config } from "@netlify/functions";
import { json, requireAuth } from "./lib/auth.mts";
import { aiErrorResponse, complete } from "./lib/ai.mts";

const MAX_CHARS = 6000;
const LANGS: Record<string, string> = { uz: "o'zbek", en: "ingliz", ru: "rus" };

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Faqat POST" }, 405);
  const denied = requireAuth(req);
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Noto'g'ri so'rov" }, 400);
  }
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return json({ error: "Matn bo'sh." }, 400);

  try {
    switch (body.action) {
      case "translate": {
        const lang = LANGS[body.target];
        if (!lang) return json({ error: "Noma'lum til." }, 400);
        const result = await complete(
          [
            { role: "system", content: "Faqat tarjimaning o'zini qaytar, izohsiz." },
            { role: "user", content: `Quyidagi matnni ${lang} tiliga tarjima qil:\n\n${text}` },
          ],
          1500,
        );
        return json({ result });
      }
      case "summarize": {
        const result = await complete(
          [
            { role: "system", content: "Matnning qisqa mazmunini o'zbek tilida 5-7 gapda yoz." },
            { role: "user", content: text },
          ],
          600,
        );
        return json({ result });
      }
      case "sentiment": {
        const raw = await complete(
          [
            {
              role: "system",
              content: 'Matn kayfiyatini tahlil qil. Faqat JSON qaytar: {"label":"pozitiv|neytral|negativ","score":-1..1,"izoh":"qisqa izoh"}',
            },
            { role: "user", content: text },
          ],
          200,
        );
        try {
          return json({ result: JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) });
        } catch {
          return json({ result: { label: "noma'lum", score: 0, izoh: raw } });
        }
      }
      case "code": {
        const result = await complete(
          [
            { role: "system", content: "Sen dasturlash bo'yicha yordamchisan. Kodni markdown blokida ber va qisqa izohla. Kod hech qayerda bajarilmaydi." },
            { role: "user", content: text },
          ],
          1200,
        );
        return json({ result });
      }
      default:
        return json({ error: "Noma'lum amal." }, 400);
    }
  } catch (err) {
    return aiErrorResponse(err);
  }
};

export const config: Config = {
  path: "/api/tools",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
