import { test } from "node:test";
import assert from "node:assert/strict";

// Netlify global'ini taqlid qilamiz
const env = { ACCESS_CODE: "sir-kod", SESSION_SECRET: "test-secret" };
globalThis.Netlify = { env: { get: (k) => env[k] } };

const auth = await import("../netlify/functions/lib/auth.mts");

test("token yaratish va tekshirish", () => {
  const t = auth.createToken("k");
  assert.equal(auth.verifyToken(t, "k"), true);
  assert.equal(auth.verifyToken(t, "boshqa"), false);
  assert.equal(auth.verifyToken(t.slice(0, -2) + "xx", "k"), false);
  assert.equal(auth.verifyToken("a.b.c", "k"), false);
  assert.equal(auth.verifyToken("", "k"), false);
});

test("muddati o'tgan token rad etiladi", () => {
  const t = auth.createToken("k", Date.now() - 13 * 3600 * 1000);
  assert.equal(auth.verifyToken(t, "k"), false);
});

test("kirish kodi", () => {
  assert.equal(auth.codeMatches("sir-kod", "sir-kod"), true);
  assert.equal(auth.codeMatches("xato", "sir-kod"), false);
});

test("requireAuth", async () => {
  const noHeader = auth.requireAuth(new Request("http://x/"));
  assert.equal(noHeader.status, 401);
  const ok = auth.requireAuth(new Request("http://x/", { headers: { authorization: `Bearer ${auth.createToken("test-secret")}` } }));
  assert.equal(ok, null);
  delete env.SESSION_SECRET;
  assert.equal(auth.requireAuth(new Request("http://x/")).status, 503);
  env.SESSION_SECRET = "test-secret";
});
