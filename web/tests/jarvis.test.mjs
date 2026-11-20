import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// public/jarvis.js brauzer skripti — Node'da bo'sh "window" bilan ishga tushiramiz
const sandbox = { performance, setInterval, clearInterval };
sandbox.window = sandbox;
vm.runInNewContext(readFileSync(new URL("../public/jarvis.js", import.meta.url), "utf8"), sandbox);
const J = sandbox.Jarvis;

test("davomiylik: raqam va so'z bilan", () => {
  assert.deepEqual({ ...J.parseDuration("5 daqiqaga taymer qo'y") }, { seconds: 300, label: "Taymer" });
  assert.equal(J.parseDuration("besh daqiqa").seconds, 300);
  assert.equal(J.parseDuration("yigirma besh soniya").seconds, 25);
  assert.equal(J.parseDuration("1 soat 30 daqiqa").seconds, 5400);
  assert.equal(J.parseDuration("bir yarim soat").seconds, 5400);
  assert.equal(J.parseDuration("yarim soat").seconds, 1800);
  assert.equal(J.parseDuration("10daqiqadan keyin").seconds, 600);
  assert.equal(J.parseDuration("ikki yuz soniya").seconds, 200);
  assert.equal(J.parseDuration("2,5 daqiqa").seconds, 150);
});

test("davomiylik: sarlavha va chegaralar", () => {
  assert.equal(J.parseDuration("10 daqiqadan keyin choy damlashni eslat").label, "choy damlashni");
  assert.equal(J.parseDuration("999 soat").seconds, 86400);
  assert.equal(J.parseDuration("soat nechchi"), null);
  assert.equal(J.parseDuration("daqiqa"), null);
  assert.equal(J.parseDuration("constructor toString soat"), null);
  assert.equal(J.parseDuration(""), null);
});

test("formatlar", () => {
  assert.equal(J.clock(299.2), "05:00");
  assert.equal(J.clock(3723), "1:02:03");
  assert.equal(J.clock(-5), "00:00");
  assert.equal(J.speakDuration(300), "5 daqiqa");
  assert.equal(J.speakDuration(5400), "1 soat 30 daqiqa");
  assert.equal(J.speakDuration(45), "45 soniya");
});

test("xavfsiz kalkulyator", () => {
  const ok = { "2+2*3": "8", "(1+2)*3": "9", "2^10": "1024", "10/4": "2.5", "-2^2": "-4", "2^3^2": "512", "12 × 12": "144", "1,5+1": "2.5", "7%3": "1", "0.1+0.2": "0.3" };
  for (const [src, want] of Object.entries(ok)) assert.equal(J.calc(src), want, src);
  for (const bad of ["", "1/0", "5%0", "9^9^9", "alert(1)", "2+", "(2", "2)", "1e5", "constructor", "1".repeat(200)]) assert.equal(J.calc(bad), null, bad);
});

test("signal to'xtatiladi va qayta chalinmaydi", () => {
  let stopped = 0;
  assert.equal(J.sfx.isRinging(), false);
  J.sfx.alarm(() => { stopped++; });
  assert.equal(J.sfx.isRinging(), true);
  assert.equal(J.sfx.stopAlarm(), true);
  assert.equal(J.sfx.stopAlarm(), false);
  assert.equal(stopped, 1);
});

test("yozuv animatsiyasi: AudioContext/rAF bo'lmasa darhol tugaydi", () => {
  const el = { textContent: "" };
  let ticks = 0, done = 0;
  J.typeInto(el, "Salom, dunyo", { onTick: () => ticks++, onDone: () => done++ });
  assert.equal(el.textContent, "Salom, dunyo");
  assert.equal(done, 1);
  assert.ok(ticks >= 1);
});
