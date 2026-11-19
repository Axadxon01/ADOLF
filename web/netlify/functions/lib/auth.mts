import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 12 * 60 * 60;

const b64 = (buf: Buffer) => buf.toString("base64url");

export function secret(): string | undefined {
  return Netlify.env.get("SESSION_SECRET") || undefined;
}

export function accessCode(): string | undefined {
  return Netlify.env.get("ACCESS_CODE") || undefined;
}

function sign(payload: string, key: string): string {
  return b64(createHmac("sha256", key).update(payload).digest());
}

/** Kirish kodini doimiy vaqtda solishtiradi. */
export function codeMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createToken(key: string, now = Date.now()): string {
  const payload = b64(Buffer.from(JSON.stringify({ sub: "owner", exp: Math.floor(now / 1000) + TTL_SECONDS })));
  return `${payload}.${sign(payload, key)}`;
}

export function verifyToken(token: string, key: string, now = Date.now()): boolean {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return false;
  const expected = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && data.exp * 1000 > now;
  } catch {
    return false;
  }
}

/** So'rovni tekshiradi. Muvaffaqiyatsiz bo'lsa tayyor Response qaytaradi. */
export function requireAuth(req: Request): Response | null {
  const key = secret();
  if (!key || !accessCode()) {
    return json({ error: "Server sozlanmagan: ACCESS_CODE va SESSION_SECRET kerak." }, 503);
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !verifyToken(token, key)) {
    return json({ error: "Kirish talab qilinadi." }, 401);
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
