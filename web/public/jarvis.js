"use strict";
// ADOLF yordamchi modullari: o'zbekcha son va vaqtni tushunish, kalkulyator, ovoz effektlari, yozuv animatsiyasi.
// Hech qanday tashqi kutubxonasiz; matn tahlili qismlari DOM'siz ishlaydi (Node'da sinash mumkin).
(function (root) {
  // ---------- O'zbekcha sonlar va davomiylik ----------
  const UNITS = { nol: 0, bir: 1, ikki: 2, uch: 3, "to'rt": 4, tort: 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9, toqqiz: 9 };
  const TENS = { "o'n": 10, on: 10, yigirma: 20, "o'ttiz": 30, ottiz: 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90, toqson: 90 };
  const UNIT_SECONDS = [[/^(soniya|sekund|sek)/, 1], [/^(daqiqa|minut|min)/, 60], [/^soat/, 3600]];
  const MAX_SECONDS = 86400;
  const LABEL_STOP = new Set([
    "taymer", "timer", "tayner", "qo'y", "qo'ying", "qoy", "qoying", "o'rnat", "o'rnating", "eslat", "eslatib",
    "eslatma", "eslating", "keyin", "keyinroq", "ber", "bering", "menga", "iltimos", "ga", "da", "dan", "uchun",
    "budilnik", "signal", "va", "yoq", "yoqing", "boshla", "boshlang",
  ]);

  const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const unitSeconds = (w) => { for (const [re, s] of UNIT_SECONDS) if (re.test(w)) return s; return 0; };
  const numberValue = (w) => {
    if (/^\d/.test(w)) return parseFloat(w.replace(",", "."));
    if (has(UNITS, w)) return UNITS[w];
    if (has(TENS, w)) return TENS[w];
    return w === "yarim" ? 0.5 : null;
  };

  /** «5 daqiqa», «bir yarim soat», «1 soat 30 daqiqa» → { seconds, label }. Topilmasa null. Matn oldindan normallashtirilgan bo'lishi kerak. */
  function parseDuration(text) {
    const tokens = String(text).match(/\d+(?:[.,]\d+)?|[a-z']+/g) || [];
    const used = new Set();
    let total = 0, cur = null, group = [];
    tokens.forEach((w, i) => {
      const unit = unitSeconds(w);
      if (unit && cur !== null) {
        total += cur * unit;
        group.forEach((g) => used.add(g));
        used.add(i);
        cur = null; group = [];
        return;
      }
      const n = w === "yuz" ? (cur === null ? 100 : cur * 100) : numberValue(w);
      if (n !== null && !(unit)) {
        cur = w === "yuz" ? n : (cur ?? 0) + n;
        group.push(i);
      } else {
        cur = null; group = [];
      }
    });
    if (!used.size || total <= 0) return null;
    const label = tokens.filter((w, i) => !used.has(i) && !LABEL_STOP.has(w) && numberValue(w) === null).join(" ").slice(0, 40).trim();
    return { seconds: Math.max(1, Math.min(Math.round(total), MAX_SECONDS)), label: label || "Taymer" };
  }

  function speakDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const parts = [];
    if (h) parts.push(`${h} soat`);
    if (m) parts.push(`${m} daqiqa`);
    if (s || !parts.length) parts.push(`${s} soniya`);
    return parts.join(" ");
  }

  function clock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  // ---------- Xavfsiz kalkulyator (eval'siz) ----------
  /** Faqat + - * / % ^ va qavslar. Xato bo'lsa null qaytaradi. */
  function calc(src) {
    const s = String(src).replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s+/g, "");
    if (!s || s.length > 100 || !/^[\d+\-*/%^().]+$/.test(s)) return null;
    let i = 0;
    const fail = () => { throw new Error("calc"); };
    function primary() {
      if (s[i] === "(") { i++; const v = expr(); if (s[i] !== ")") fail(); i++; return v; }
      const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (!m) fail();
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function power() {
      const base = primary();
      if (s[i] === "^") {
        i++;
        const exp = unary();
        if (Math.abs(exp) > 100 || Math.abs(base) > 1e6) fail();
        return Math.pow(base, exp);
      }
      return base;
    }
    function unary() {
      if (s[i] === "-") { i++; return -unary(); }
      if (s[i] === "+") { i++; return unary(); }
      return power();
    }
    function term() {
      let v = unary();
      while (s[i] === "*" || s[i] === "/" || s[i] === "%") {
        const op = s[i++];
        const r = unary();
        if (op === "*") v *= r; else if (r === 0) fail(); else v = op === "/" ? v / r : v % r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
      return v;
    }
    try {
      const v = expr();
      if (i !== s.length || !Number.isFinite(v)) return null;
      return String(Math.round(v * 1e10) / 1e10);
    } catch { return null; }
  }

  // ---------- Ovoz effektlari (WebAudio) ----------
  const sfx = (function () {
    let ctx = null, enabled = true, alarmTimer = 0, alarmEnd = 0, alarmCb = null;
    function ensure() {
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch { return null; }
      }
      if (ctx.state === "suspended") { try { ctx.resume().catch(() => {}); } catch { /* ignore */ } }
      return ctx;
    }
    function tone(freq, start, dur, { type = "sine", gain = 0.06, to = 0 } = {}) {
      const c = ensure();
      if (!c) return;
      try {
        const t0 = c.currentTime + start;
        const osc = c.createOscillator(), g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      } catch { /* ovoz bo'lmasa ham ilova ishlayveradi */ }
    }
    const SOUNDS = {
      listen() { tone(520, 0, 0.09); tone(800, 0.09, 0.13); },
      done() { tone(660, 0, 0.11, { gain: 0.04 }); },
      boot() { tone(180, 0, 0.6, { type: "triangle", to: 1400, gain: 0.05 }); tone(1400, 0.62, 0.16, { gain: 0.04 }); },
      error() { tone(210, 0, 0.14, { type: "square", gain: 0.03 }); tone(150, 0.18, 0.22, { type: "square", gain: 0.03 }); },
    };
    function beeps() { for (let i = 0; i < 3; i++) tone(880, i * 0.24, 0.14, { type: "square", gain: 0.045 }); }
    return {
      setEnabled(v) { enabled = !!v; },
      unlock() { ensure(); },
      play(name) { if (enabled && SOUNDS[name]) SOUNDS[name](); },
      /** Signal: taymer tugaganda to'xtatilmaguncha (yoki 25 soniyagacha) takrorlanadi. Foydalanuvchi sozlamasidan qat'i nazar chaladi. */
      alarm(onStop) {
        this.stopAlarm();
        alarmCb = onStop || null;
        alarmEnd = Date.now() + 25000;
        beeps();
        alarmTimer = setInterval(() => { if (Date.now() > alarmEnd) this.stopAlarm(); else beeps(); }, 1400);
      },
      stopAlarm() {
        if (!alarmTimer) return false;
        clearInterval(alarmTimer);
        alarmTimer = 0;
        const cb = alarmCb; alarmCb = null;
        if (cb) cb();
        return true;
      },
      isRinging() { return Boolean(alarmTimer); },
    };
  })();

  // ---------- Yozuv animatsiyasi ----------
  /** Matnni harfma-harf ko'rsatadi. Qaytgan funksiya animatsiyani darhol tugatadi. */
  function typeInto(el, text, { cps = 90, onTick, onDone } = {}) {
    const reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const chars = Array.from(text);
    let done = false, raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
      el.textContent = text;
      if (onTick) onTick();
      if (onDone) onDone();
    };
    if (reduce || !root.requestAnimationFrame || chars.length > 500) { finish(); return finish; }
    const t0 = performance.now();
    const step = (now) => {
      if (done) return;
      const n = Math.min(chars.length, Math.floor(((now - t0) / 1000) * cps) + 1);
      if (n >= chars.length) { finish(); return; }
      el.textContent = chars.slice(0, n).join("");
      if (onTick) onTick();
      raf = root.requestAnimationFrame(step);
    };
    raf = root.requestAnimationFrame(step);
    return finish;
  }

  root.Jarvis = { parseDuration, speakDuration, clock, calc, sfx, typeInto };
})(typeof window !== "undefined" ? window : globalThis);
