import type { Config } from "@netlify/functions";
import { json, requireAuth } from "./lib/auth.mts";
import { aiErrorResponse, complete } from "./lib/ai.mts";

const MAX_DATA_URL = 4_000_000; // ~3 MB rasm (Netlify so'rov limiti 6 MB)

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Faqat POST" }, 405);
  const denied = requireAuth(req);
  if (denied) return denied;

  let image = "";
  try {
    const body = await req.json();
    image = typeof body?.image === "string" ? body.image : "";
  } catch {
    return json({ error: "Noto'g'ri so'rov" }, 400);
  }
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    return json({ error: "Faqat JPEG, PNG yoki WebP rasm qabul qilinadi." }, 400);
  }
  if (image.length > MAX_DATA_URL) return json({ error: "Rasm juda katta." }, 413);

  try {
    const result = await complete(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "Rasmdagi asosiy obyektlarni o'zbek tilida ro'yxat qilib sanab ber va qisqa tavsif yoz." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      500,
    );
    return json({ result });
  } catch (err) {
    return aiErrorResponse(err);
  }
};

export const config: Config = {
  path: "/api/vision",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
