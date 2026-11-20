"use strict";

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};
const session = {
  get() { try { return sessionStorage.getItem("adolf_token") || ""; } catch { return ""; } },
  set(t) { try { sessionStorage.setItem("adolf_token", t); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem("adolf_token"); } catch { /* ignore */ } },
  flag(k) { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } },
  setFlag(k) { try { sessionStorage.setItem(k, "1"); } catch { /* ignore */ } },
};
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { sfx, parseDuration, speakDuration, clock: fmtCountdown, calc, typeInto } = window.Jarvis;
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

// ---------- Yadro animatsiyasi ----------
const orb = window.createOrb($("orb"));
const loginOrb = window.createOrb($("orb-login"));
const LABELS = { idle: "KUTISH REJIMI", listening: "TINGLAYAPMAN…", thinking: "QAYTA ISHLAYAPMAN…", speaking: "GAPIRYAPMAN…" };
let state = "idle";
function setState(s) {
  state = s;
  orb.setState(s);
  document.body.dataset.state = s;
  $("state-label").textContent = LABELS[s];
  $("orb-btn").setAttribute("aria-label", s === "idle" ? "Gapirish uchun bosing" : "To'xtatish");
}

// ---------- API ----------
async function api(path, body) {
  let res;
  const headers = { authorization: `Bearer ${session.get()}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    res = await fetch(path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Tarmoq xatosi. Internetni tekshiring.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* json emas */ }
  if (res.status === 401) { logout(); throw new Error("Sessiya tugadi. Qayta kiring."); }
  if (!res.ok) {
    const msg = data.error || (typeof data.detail === "string" ? data.detail : "");
    throw new Error(msg || `Xatolik (${res.status})`);
  }
  return data;
}
async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; }
}

// ---------- Kirish / chiqish ----------
function showView() {
  const authed = Boolean(session.get());
  $("login-view").hidden = authed;
  $("app-view").hidden = !authed;
}
function logout() {
  sfx.stopAlarm();
  stopListening(true);
  stopSpeaking();
  session.clear();
  showView();
}
async function bootSequence() {
  if (reduceMotion || session.flag("adolf_booted")) return;
  session.setFlag("adolf_booted");
  const boot = $("boot"), pre = $("boot-log");
  pre.textContent = "";
  boot.classList.remove("fade");
  boot.hidden = false;
  sfx.play("boot");
  for (const line of ["› yadro yuklanmoqda ........ OK", "› xavfsizlik moduli ......... OK", "› ovoz tizimi ............... OK", "› ADOLF tayyor."]) {
    pre.textContent += line + "\n";
    await sleep(320);
  }
  boot.classList.add("fade");
  await sleep(450);
  boot.hidden = true;
}
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("login-error");
  err.hidden = true;
  const btn = e.submitter || e.target.querySelector("button");
  btn.disabled = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: $("code").value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (typeof data.detail === "string" ? data.detail : "") || "Kirib bo'lmadi");
    session.set(data.token);
    $("code").value = "";
    await bootSequence();
    showView();
    initApp();
    greet();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
$("logout").addEventListener("click", logout);

// ---------- Soat va holat ----------
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (d, sec = false) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}${sec ? ":" + pad2(d.getSeconds()) : ""}`;
const fmtDate = (d, year = false) => `${d.getDate()}-${MONTHS[d.getMonth()]}${year ? " " + d.getFullYear() + "-yil" : ""}, ${WEEKDAYS[d.getDay()]}`;
function tickClock() {
  const d = new Date();
  $("clock-time").textContent = fmtTime(d, true);
  $("clock-date").textContent = fmtDate(d);
}
setInterval(tickClock, 1000);
tickClock();

function setStatus(id, text, cls = "") {
  const el = $(id);
  el.textContent = text;
  el.className = cls;
}
function refreshNet() { setStatus("st-net", navigator.onLine ? "ONLINE" : "OFFLINE", navigator.onLine ? "" : "bad"); }
window.addEventListener("online", refreshNet);
window.addEventListener("offline", refreshNet);

async function pingServer() {
  const t0 = performance.now();
  try {
    const r = await fetch("/health", { cache: "no-store" });
    if (!r.ok) throw new Error("health");
    const ms = Math.round(performance.now() - t0);
    setStatus("st-ping", `${ms} MS`, ms > 1500 ? "warn" : "");
  } catch {
    setStatus("st-ping", "UZILGAN", "bad");
  }
}
function refreshConn() {
  const c = navigator.connection;
  if (!c) { $("st-conn").closest("li").hidden = true; return; }
  const text = [(c.effectiveType || "").toUpperCase(), c.downlink ? `${c.downlink} Mbit/s` : ""].filter(Boolean).join(" · ");
  setStatus("st-conn", text || "—", c.saveData ? "warn" : "");
}
async function initBattery() {
  const li = $("st-bat").closest("li");
  if (!navigator.getBattery) { li.hidden = true; return; }
  try {
    const b = await navigator.getBattery();
    const upd = () => setStatus("st-bat", `${Math.round(b.level * 100)}%${b.charging ? " ⚡" : ""}`, b.level < 0.2 && !b.charging ? "bad" : "");
    upd();
    b.addEventListener("levelchange", upd);
    b.addEventListener("chargingchange", upd);
  } catch { li.hidden = true; }
}

// ---------- Jurnal ----------
const HISTORY_KEY = "adolf_chat";
const MAX_HISTORY = 20;
const SAFE_URL = /^https:\/\/(www\.youtube\.com|open\.spotify\.com)\//;
function addLogLinks(div, link) {
  const links = (Array.isArray(link) ? link : link ? [link] : []).filter((l) => l && SAFE_URL.test(l.url));
  if (!links.length) return;
  div.append(document.createElement("br"));
  for (const l of links) {
    const a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = l.label || "Ochish";
    div.append(a);
  }
}
function addLog(role, text, link) {
  finishTyping();
  const log = $("log");
  const empty = log.querySelector(".empty");
  if (empty) empty.remove();
  const div = document.createElement("div");
  div.className = `entry ${role}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = { user: "SIZ", bot: "ADOLF", sys: "TIZIM" }[role] || role.toUpperCase();
  const txt = document.createElement("span");
  txt.className = "txt";
  txt.textContent = text; // textContent — XSS'dan himoya
  div.append(who, txt);
  addLogLinks(div, link);
  log.appendChild(div);
  while (log.children.length > 80) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  return div;
}
let activeTyper = null;
function finishTyping() {
  const f = activeTyper;
  activeTyper = null;
  if (f) f();
}
/** Bot javobini harfma-harf yozadi (kamaytirilgan harakat sozlamasida darhol). */
function typeLog(entry, text) {
  finishTyping();
  const log = $("log");
  entry.classList.add("typing");
  let fin = null;
  fin = typeInto(entry.querySelector(".txt"), text, {
    onTick: () => { log.scrollTop = log.scrollHeight; },
    onDone: () => { entry.classList.remove("typing"); if (activeTyper === fin) activeTyper = null; },
  });
  if (entry.classList.contains("typing")) activeTyper = fin;
}
async function botSay(text, links) {
  const entry = addLog("bot", "", links);
  typeLog(entry, text);
  sfx.play("done");
  await speak(text);
}
function renderLogEmpty() {
  const log = $("log");
  log.replaceChildren();
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = "Hali suhbat yo'q. Yadroni bosing va gapiring, yoki buyruq yozing.";
  log.appendChild(p);
}
function renderLogFromHistory() {
  renderLogEmpty();
  for (const m of store.get(HISTORY_KEY, [])) addLog(m.role === "user" ? "user" : "bot", m.content);
}
$("log-clear").addEventListener("click", () => { store.set(HISTORY_KEY, []); renderLogEmpty(); });

// ---------- Ovoz chiqarish ----------
let ttsBroken = false;
let currentAudio = null;
let speakToken = 0;

function cleanForSpeech(text) {
  return text.replace(/```[\s\S]*?```/g, " (kod bloki) ").replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().slice(0, 700);
}
function browserSpeak(text, token) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => /^uz/i.test(x.lang)) || voices.find((x) => /^ru/i.test(x.lang)) || null;
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "uz-UZ"; }
    u.rate = 1;
    u.onend = u.onerror = () => resolve();
    if (token !== speakToken) return resolve();
    speechSynthesis.speak(u);
  });
}
async function speak(text) {
  if (!$("opt-voice").checked) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  const token = ++speakToken;
  setState("speaking");
  try {
    if (!ttsBroken) {
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${session.get()}` },
          body: JSON.stringify({ text: clean }),
        });
        if (!res.ok) throw new Error("tts");
        const blob = await res.blob();
        if (token !== speakToken) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        await new Promise((resolve, reject) => {
          audio.onended = resolve;
          audio.onerror = () => reject(new Error("audio"));
          audio.play().catch(reject);
        });
        URL.revokeObjectURL(url);
        setStatus("st-tts", "OPENAI OVOZI");
      } catch {
        if (token !== speakToken) return;
        ttsBroken = true;
        setStatus("st-tts", "BRAUZER OVOZI", "warn");
        await browserSpeak(clean, token);
      }
    } else {
      await browserSpeak(clean, token);
    }
  } finally {
    if (token === speakToken) { currentAudio = null; setState("idle"); }
  }
}
function stopSpeaking() {
  speakToken++;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (state === "speaking") setState("idle");
}

// ---------- Xotira (ism, shahar, faktlar) ----------
const MEM_KEY = "adolf_memory";
const CITY_KEY = "adolf_city";
const DEFAULT_CITY = "Toshkent";
const MAX_FACTS = 15;
const memory = {
  get() {
    const m = store.get(MEM_KEY, {});
    return {
      name: typeof m.name === "string" ? m.name.slice(0, 40) : "",
      facts: Array.isArray(m.facts) ? m.facts.filter((f) => typeof f === "string").slice(0, MAX_FACTS) : [],
    };
  },
  save(m) { store.set(MEM_KEY, m); },
  /** AI'ga yuboriladigan qisqa ro'yxat (server ≤ 20 ta qabul qiladi). */
  forServer() {
    const m = this.get();
    const out = [];
    if (m.name) out.push(`Foydalanuvchining ismi: ${m.name}`);
    const city = store.get(CITY_KEY, null);
    if (typeof city === "string" && city) out.push(`Foydalanuvchining shahri: ${city}`);
    for (const f of m.facts) out.push(f.slice(0, 200));
    return out.slice(0, 20);
  },
};
const titleCase = (s) => s.replace(/(^|[\s-])(\S)/g, (_, a, b) => a + b.toUpperCase());
function currentCity() {
  const c = store.get(CITY_KEY, DEFAULT_CITY);
  return typeof c === "string" && c ? c : DEFAULT_CITY;
}

// ---------- Taymerlar ----------
const TIMERS_KEY = "adolf_timers";
const MAX_TIMERS = 10;
let timers = store.get(TIMERS_KEY, []).filter((t) => t && typeof t.id === "string" && typeof t.label === "string" && Number.isFinite(t.endAt));
const timerEls = new Map();
const saveTimers = () => store.set(TIMERS_KEY, timers);
function addTimer(seconds, label) {
  if (timers.length >= MAX_TIMERS) return false;
  timers.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), label: String(label || "Taymer").slice(0, 80), endAt: Date.now() + seconds * 1000 });
  saveTimers();
  renderTimers();
  return true;
}
function removeTimer(id) {
  timers = timers.filter((t) => t.id !== id);
  saveTimers();
  renderTimers();
}
function renderTimers() {
  const ul = $("hud-timers");
  ul.replaceChildren();
  timerEls.clear();
  if (!timers.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "Faol taymer yo'q";
    ul.appendChild(li);
    return;
  }
  for (const t of timers) {
    const li = document.createElement("li");
    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = t.label;
    const left = document.createElement("b");
    left.className = "left";
    left.textContent = fmtCountdown((t.endAt - Date.now()) / 1000);
    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "✕";
    del.setAttribute("aria-label", `Taymerni bekor qilish: ${t.label}`);
    del.addEventListener("click", () => removeTimer(t.id));
    li.append(lbl, left, del);
    ul.appendChild(li);
    timerEls.set(t.id, left);
  }
}
function ringAlarm(msg) {
  $("alarm-text").textContent = msg;
  $("alarm").hidden = false;
  sfx.alarm(() => { $("alarm").hidden = true; });
}
$("alarm-stop").addEventListener("click", () => sfx.stopAlarm());
function announce(msg) {
  if (state === "listening" && $("opt-wake").checked) stopListening();
  if (state === "idle") speak(msg).then(resumeListening);
}
function fireTimer(t) {
  removeTimer(t.id);
  const msg = t.label && t.label !== "Taymer" ? `Taymer tugadi: ${t.label}.` : "Taymer tugadi.";
  if (Date.now() - t.endAt > 90000) { // sahifa yopiq bo'lgan paytda tugagan
    addLog("bot", `${msg} (siz yo'q paytda tugagan)`);
    toast(msg);
    return;
  }
  addLog("bot", msg);
  ringAlarm(msg);
  setTimeout(() => announce(msg), 1200);
}
function tickTimers() {
  if (!session.get()) return;
  const now = Date.now();
  for (const t of timers.slice()) {
    if (t.endAt <= now) { fireTimer(t); continue; }
    const el = timerEls.get(t.id);
    if (el) el.textContent = fmtCountdown((t.endAt - now) / 1000);
  }
}
setInterval(tickTimers, 1000);
function timersSummary() {
  const now = Date.now();
  return timers.map((t) => `${t.label === "Taymer" ? "taymer" : t.label} — ${speakDuration((t.endAt - now) / 1000)} qoldi`).join("; ");
}

// ---------- Ob-havo ----------
const WX_TTL = 9 * 60 * 1000;
const wxCache = new Map();
const deg = (n) => `${n < 0 ? "minus " + Math.abs(n) : n} daraja`;
function fetchWeather(city) {
  const key = norm(city);
  const hit = wxCache.get(key);
  if (hit && Date.now() - hit.at < WX_TTL) return hit.promise;
  const promise = api(`/api/weather?city=${encodeURIComponent(city)}`);
  const entry = { at: Date.now(), promise };
  wxCache.set(key, entry);
  promise.catch(() => { if (wxCache.get(key) === entry) wxCache.delete(key); });
  return promise;
}
function weatherSentence(w, label) {
  return `${label}: hozir ${deg(w.temp)}, ${w.description}. His etilishi ${deg(w.feels)}, namlik ${w.humidity} foiz, shamol ${w.wind} metr soniyada.`;
}
async function refreshWeather() {
  const city = currentCity();
  const box = $("wx");
  try {
    const w = await fetchWeather(city);
    $("wx-temp").textContent = `${w.temp}°`;
    $("wx-desc").textContent = w.description;
    $("wx-feels").textContent = `${w.feels}°`;
    $("wx-hum").textContent = `${w.humidity}%`;
    $("wx-wind").textContent = `${w.wind} m/s`;
    box.classList.remove("off");
  } catch {
    $("wx-temp").textContent = "--";
    $("wx-desc").textContent = "Ma'lumot yo'q";
    for (const id of ["wx-feels", "wx-hum", "wx-wind"]) $(id).textContent = "—";
    box.classList.add("off");
  }
  $("wx-city").textContent = titleCase(city);
}
const KNOWN_CITIES = ["toshkent", "samarqand", "buxoro", "xiva", "andijon", "farg'ona", "namangan", "qarshi", "termiz", "urganch", "nukus", "jizzax", "guliston", "navoiy", "qo'qon", "marg'ilon", "chirchiq", "angren", "olmaliq", "bekobod", "denov", "shahrisabz", "zarafshon", "london", "moskva", "parij", "berlin", "istanbul", "dubay", "pekin", "tokio", "seul", "rim", "madrid", "vashington", "nyu-york", "bishkek", "dushanbe", "astana", "olmaota"];
const LOCATIVE = /(dagi|da|dan|ning|ga|uchun|ni)$/;
/** «Samarqandda ob-havo qanday» → «samarqand». Shahar topilmasa bo'sh qator. */
function cityFromWords(t) {
  for (const w of t.split(" ")) {
    const known = KNOWN_CITIES.find((c) => w.startsWith(c) && w.length - c.length <= 5);
    if (known) return known;
  }
  for (const w of t.split(" ")) {
    const m = w.match(/^([a-z'-]{3,})(dagi|da|ning)$/);
    if (m && !/(havo|ob|bugun|hozir|tashqari)$/.test(m[1])) return m[1];
  }
  return "";
}

// ---------- Brifing ----------
async function composeBriefing() {
  const m = memory.get();
  const d = new Date();
  const h = d.getHours();
  const part = h < 5 ? "Xayrli tun" : h < 12 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
  const out = [`${part}${m.name ? ", " + m.name : ""}.`, `Hozir soat ${fmtTime(d)}, ${fmtDate(d)}.`];
  try {
    const w = await withTimeout(fetchWeather(currentCity()), 6000);
    out.push(`${titleCase(currentCity())}: ${deg(w.temp)}, ${w.description}.`);
  } catch { /* ob-havosiz ham brifing beramiz */ }
  const p = pendingTasks();
  out.push(p.length ? `Sizda ${p.length} ta vazifa bor${p.length <= 3 ? ": " + p.map((x) => x.task).join(", ") : ""}.` : "Bugunga vazifalar yo'q.");
  if (timers.length) out.push(`${timers.length} ta taymer ishlayapti.`);
  return out.join(" ");
}

// ---------- Buyruqlar (AI'siz bajariladi) ----------
function norm(t) {
  return t.toLowerCase().replace(/[’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
}
function pendingTasks() { return store.get(TASKS_KEY, []).filter((t) => !t.done); }
function addTask(task) {
  const tasks = store.get(TASKS_KEY, []);
  tasks.push({ task: String(task).trim().slice(0, 200), time: nowHM(), done: false });
  store.set(TASKS_KEY, tasks);
  renderTasks();
}
const HELP_TEXT = "Men suhbat, ob-havo, vaqt, hisob-kitob, taymer, vazifalar va media bilan yordam beraman. Masalan: «5 daqiqaga taymer», «Samarqandda ob-havo qanday», «brifing», «12 ko'paytirish 12» yoki «eslab qol: ...».";

/** Mahalliy buyruq. null — AI'ga yuboriladi. Natija: {reply, open?, label?} | {run: async () => {...}} | {stop: true}. */
function parseIntent(raw) {
  const t = norm(raw);
  const tc = raw.replace(/[’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
  let m;

  if (/^(to'xta\w*|toxta\w*|jim|yetarli|bas|stop)\W*$/.test(t)) return { stop: true };

  // vazifalar
  if ((m = tc.match(/^(?:vazifa|reja|eslatma)\s*(?:qo'?sh|qosh|yoz|qo'shing)\W*(.+)$/i))) {
    addTask(m[1]);
    return { reply: `Vazifa qo'shildi: ${m[1].trim()}.` };
  }

  // taymerlar
  const timerWord = /\b(taymer\w*|timer\w*|budilnik\w*)/.test(t);
  if (timerWord && /(to'xtat|toxtat|bekor|o'chir|ochir|tozala)/.test(t)) {
    const n = timers.length;
    timers = [];
    saveTimers();
    renderTimers();
    sfx.stopAlarm();
    return { reply: n ? `Taymerlar bekor qilindi (${n} ta).` : "Faol taymer yo'q edi." };
  }
  if ((timerWord && /(qancha|qoldi|holat|ro'yxat|qaysi|bormi|nechta)/.test(t)) || /^taymerlar\w*\W*$/.test(t)) {
    return { reply: timers.length ? `Faol taymerlar: ${timersSummary()}.` : "Faol taymer yo'q." };
  }
  const dur = parseDuration(t);
  if (dur && (timerWord || /\b(eslat\w*|uyg'ot\w*|signal)\b/.test(t))) {
    if (!addTimer(dur.seconds, dur.label)) return { reply: "Taymerlar soni chegaraga yetdi. Avval ba'zilarini bekor qiling." };
    return { reply: `${speakDuration(dur.seconds)}ga taymer o'rnatildi${dur.label !== "Taymer" ? ": " + dur.label : ""}.` };
  }
  if (timerWord) return { reply: "Qancha vaqtga? Masalan: «5 daqiqaga taymer»." };

  // brifing, diagnostika
  if (/^(?:brifing|briefing|kunlik brifing|bugungi brifing|kunlik hisobot|hisobot ber\w*|kun rejasi)\W*$/.test(t)) {
    return { run: async () => ({ reply: await composeBriefing() }) };
  }
  if (/(diagnostika|tizim holati|tizimni tekshir|hammasi joyidami)/.test(t)) {
    return {
      run: async () => {
        await pingServer();
        const g = (id) => $(id).textContent.toLowerCase();
        return { reply: `Diagnostika: tarmoq ${g("st-net")}, server ${g("st-ping")}, mikrofon ${g("st-mic")}, sun'iy intellekt ${g("st-ai")}, ovoz ${g("st-tts")}.` };
      },
    };
  }

  // ob-havo va shahar
  if ((m = t.match(/^(?:mening\s+)?shahrim(?:ni)?\s+(.+?)(?:\s+(?:qil\w*|deb\s.*|ekan))?$/)) || (m = t.match(/^men\s+([a-z'-]+?)(?:da|dan)\s+(?:yashayman|turaman)$/))) {
    const words = m[1].split(" ");
    const guess = words.find((w) => KNOWN_CITIES.some((c) => w.startsWith(c))) || words[0];
    const city = KNOWN_CITIES.find((c) => guess.startsWith(c) && guess.length - c.length <= 5) || guess.replace(LOCATIVE, (x, _, off) => (off >= 4 ? "" : x));
    return {
      run: async () => {
        await fetchWeather(titleCase(city)); // mavjudligini tekshiramiz; topilmasa xato matni qaytadi
        store.set(CITY_KEY, titleCase(city));
        refreshWeather();
        return { reply: `Shahringiz: ${titleCase(city)}. Ob-havo shu shahar bo'yicha ko'rsatiladi.` };
      },
    };
  }
  if (/(ob[\s-]?havo|havo\s+(?:qanday|qanaqa|issiq|sovuq|harorati)|tashqarida\s+(?:havo|harorat)|harorat\s+(?:necha|qancha|qanday))/.test(t)) {
    const city = titleCase(cityFromWords(t) || currentCity());
    return { run: async () => ({ reply: weatherSentence(await fetchWeather(city), city) }) };
  }

  // xotira
  if ((m = t.match(/^(?:mening\s+)?ismim\s+(?:bu\s+)?([a-z']+(?:\s[a-z']+)?)$/)) || (m = t.match(/^meni\s+([a-z']+(?:\s[a-z']+)?)\s+deb\s+(?:chaqir|ayt)\w*$/))) {
    const mem = memory.get();
    mem.name = titleCase(m[1]);
    memory.save(mem);
    return { reply: `Xush kelibsiz, ${mem.name}. Ismingizni eslab qoldim.` };
  }
  if ((m = tc.match(/^(?:eslab\s+qol\w*|yodda\s+tut\w*|yodingda\s+tut\w*)\W*(.+)$/i))) {
    const mem = memory.get();
    mem.facts.push(m[1].trim().slice(0, 200));
    mem.facts = mem.facts.slice(-MAX_FACTS);
    memory.save(mem);
    return { reply: `Eslab qoldim: ${m[1].trim()}.` };
  }
  if (/(nimalarni?\s+eslab|nimani\s+eslab|meni\s+taniysan|nimalar\s+bilasan|xotira\w*\s+(?:ko'rsat|ro'yxat))/.test(t)) {
    const mem = memory.get();
    const bits = [mem.name ? `ismingiz ${mem.name}` : "", ...mem.facts].filter(Boolean);
    return { reply: bits.length ? `Men bilaman: ${bits.join("; ")}.` : "Hali hech narsani eslab qolmaganman. «Eslab qol: ...» deb ayting." };
  }
  if (/(xotira\w*\s+(?:tozala|o'chir)|hammasini\s+unut|meni\s+unut)/.test(t)) {
    memory.save({ name: "", facts: [] });
    store.set(CITY_KEY, DEFAULT_CITY);
    refreshWeather();
    return { reply: "Xotira tozalandi." };
  }

  // kalkulyator
  if ((m = t.match(/^(?:hisobla\w*[:\s]*)?([\d\s+\-*/×÷%^().,x]+?)\s*(?:necha|nechchi|nechaga teng|=|\?)*$/)) && /[\d)]\s*[+\-*/×÷%^x]\s*[\d(.]/.test(m[1])) {
    // «20-11-2026» kabi sanalar faqat «hisobla» yoki «necha» bilan hisoblanadi
    const asked = /^hisobla/.test(t) || /(necha|nechchi|=|\?)$/.test(t) || /[\d)]\s*[+*/×÷%^x]\s*[\d(.]/.test(m[1]);
    const res = asked ? calc(m[1].replace(/(\d)\s*x\s*(\d)/g, "$1*$2")) : null;
    if (res !== null) return { reply: `${m[1].trim()} = ${res}` };
  }
  if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*ga\s*(\d+(?:[.,]\d+)?)\s*(?:ni\s*)?qo'sh\w*\W*$/))) {
    const res = calc(`${m[1]}+${m[2]}`);
    if (res !== null) return { reply: `${m[1]} + ${m[2]} = ${res}` };
  }
  if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*dan\s*(\d+(?:[.,]\d+)?)\s*(?:ni\s*)?ayir\w*\W*$/))) {
    const res = calc(`${m[1]}-${m[2]}`);
    if (res !== null) return { reply: `${m[1]} - ${m[2]} = ${res}` };
  }
  if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:ni|ga)?\s*(qo'shuv|qo'sh|ayir|ko'paytir|bo'l)\w*\s+(\d+(?:[.,]\d+)?)\s*(?:ni|ga|ta|ta\w*)?\W*$/))) {
    const op = { "qo'shuv": "+", "qo'sh": "+", "ayir": "-", "ko'paytir": "*", "bo'l": "/" }[m[2]];
    const res = calc(`${m[1]}${op}${m[3]}`);
    if (res !== null) return { reply: `${m[1]} ${op} ${m[3]} = ${res}` };
  }

  // vaqt, sana
  if (/(soat|vaqt)\b.*\b(necha|nechchi|qancha|nechta)/.test(t) || /^soat nechchi/.test(t)) {
    return { reply: `Hozir soat ${fmtTime(new Date())}.` };
  }
  if (/(bugun|sana|kun)\b.*\b(qaysi|nima|necha|nechi)/.test(t)) {
    return { reply: `Bugun ${fmtDate(new Date(), true)}.` };
  }
  if (/(vazifalar|rejalar|rejam|vazifalarim)/.test(t)) {
    const p = pendingTasks();
    return { reply: p.length ? `Sizda ${p.length} ta vazifa bor: ${p.map((x) => x.task).join(", ")}.` : "Hozircha vazifa yo'q." };
  }
  if (/(suhbatni|tarixni|jurnalni).*(tozala|o'chir)/.test(t)) {
    store.set(HISTORY_KEY, []);
    renderLogEmpty();
    return { reply: "Suhbat tozalandi." };
  }

  // media
  if ((m = t.match(/(?:youtube|yutub|yutyub)\w*\s+(.+)/))) {
    return { reply: `YouTube'da «${m[1]}» qidiruvi tayyor.`, open: `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}`, label: "YouTube'da ochish" };
  }
  if ((m = t.match(/^(?:musiqa|qo'shiq|spotify)\w*\s*(?:qo'?y\w*|top|och)?\s+(.+)/))) {
    return { reply: `Spotify'da «${m[1]}» qidiruvi tayyor.`, open: `https://open.spotify.com/search/${encodeURIComponent(m[1])}`, label: "Spotify'da ochish" };
  }

  // suhbat
  if (/^(rahmat|raxmat|tashakkur)/.test(t)) return { reply: "Arzimaydi." };
  if (/^(salom|assalomu alaykum|hayrli)/.test(t) && t.split(" ").length <= 3) {
    const n = memory.get().name;
    return { reply: `Salom${n ? ", " + n : ""}! Sizga qanday yordam bera olaman?` };
  }
  if (/^(?:qalaysan|qalaysiz|ahvol\w*|ishlar qalay|nima gap)\W*$/.test(t)) return { reply: "Barcha tizimlar me'yorida. Sizga qanday yordam bera olaman?" };
  if (/(sen kimsan|o'zing haqingda|isming nima)/.test(t)) return { reply: "Men ADOLF — sizning shaxsiy sun'iy intellekt yordamchingizman. Gapiring yoki yozing, bajaraman." };
  if (/^(?:yordam|help|nima qila olasan|nimalar qila olasan|buyruqlar)\W*$/.test(t)) return { reply: HELP_TEXT };
  return null;
}
function nowHM() { return fmtTime(new Date()); }

/** Server qaytargan amallarni bajaradi (taymer, vazifa) va ochiladigan havolalarni qaytaradi. */
function applyActions(actions) {
  const links = [];
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || typeof a !== "object") continue;
    if (a.type === "timer" && Number.isFinite(a.seconds)) addTimer(Math.max(1, Math.min(a.seconds, 86400)), a.label);
    else if (a.type === "task" && typeof a.text === "string" && a.text.trim()) addTask(a.text);
    else if (a.type === "open" && typeof a.url === "string" && SAFE_URL.test(a.url)) links.push({ url: a.url, label: typeof a.label === "string" ? a.label.slice(0, 60) : "Ochish" });
  }
  return links;
}

let lastWasVoice = false;
async function handleInput(text, { voice = false } = {}) {
  text = text.trim();
  if (!text) return;
  lastWasVoice = voice;
  sfx.stopAlarm();
  stopSpeaking();
  $("heard").textContent = "";
  addLog("user", text);

  let intent = null;
  try { intent = parseIntent(text); } catch (e) { console.error(e); }
  if (intent) {
    if (intent.stop) { resumeListening(); return; }
    if (intent.open && !voice) window.open(intent.open, "_blank", "noopener,noreferrer");
    if (intent.run) {
      setState("thinking");
      try { intent = await intent.run(); } catch (e) { intent = { reply: e.message || "Bajarib bo'lmadi.", failed: true }; }
      setState("idle");
    }
    if (intent.failed) sfx.play("error");
    await botSay(intent.reply, intent.open ? [{ url: intent.open, label: intent.label }] : null);
    resumeListening();
    return;
  }

  setState("thinking");
  const pending = addLog("bot", "O'ylayapman…");
  pending.classList.add("pending");
  const history = store.get(HISTORY_KEY, []);
  history.push({ role: "user", content: text });
  try {
    const res = await api("/api/chat", { messages: history.slice(-MAX_HISTORY), memory: memory.forServer(), tz: TZ });
    const links = applyActions(res.actions);
    const reply = res.reply || (res.actions && res.actions.length ? "Bajarildi." : "Tushunmadim, qayta ayting.");
    history.push({ role: "assistant", content: reply });
    store.set(HISTORY_KEY, history.slice(-MAX_HISTORY));
    pending.classList.remove("pending");
    addLogLinks(pending, links);
    typeLog(pending, reply);
    sfx.play("done");
    setStatus("st-ai", "FAOL");
    setState("idle");
    await speak(reply);
  } catch (e) {
    pending.className = "entry sys";
    pending.querySelector(".who").textContent = "TIZIM";
    pending.querySelector(".txt").textContent = e.message;
    setStatus("st-ai", "XATO", "bad");
    sfx.play("error");
    setState("idle");
    await browserSpeak("Kechirasiz, hozir javob bera olmayapman.", ++speakToken);
  }
  resumeListening();
}

$("cmd-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("cmd-input");
  const text = input.value;
  input.value = "";
  await busy($("cmd-send"), () => handleInput(text));
});

// ---------- Ovozni tanish ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE = /(adolf|adolph|adolf|адольф|адолф|odolf)/i;
let rec = null;
let wantListen = false; // «ADOLF deb chaqirish» yoki doimiy suhbat uchun qayta tinglash
let awaitingCommand = false;
let directOnce = false;

if (!SR) {
  $("voice-unsupported").hidden = false;
  $("opt-convo").disabled = true;
  $("opt-wake").disabled = true;
  setStatus("st-mic", "YO'Q", "bad");
} else {
  setStatus("st-mic", "TAYYOR");
}

function startListening({ direct = false } = {}) {
  if (!SR || rec || state === "thinking" || state === "speaking") return;
  directOnce = direct;
  const wake = $("opt-wake").checked && !direct;
  rec = new SR();
  rec.lang = "uz-UZ";
  rec.interimResults = true;
  rec.continuous = wake;
  setState("listening");
  if (direct) sfx.play("listen");
  setStatus("st-mic", "TINGLAYAPTI");
  let handled = false;

  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const text = r[0].transcript.trim();
      if (!r.isFinal) { interim += text + " "; continue; }
      if (!text) continue;
      if (wake) {
        const m = text.match(WAKE);
        if (m) {
          sfx.play("listen");
          const cmd = text.slice(m.index + m[0].length).replace(/^[\s,.:!?-]+/, "");
          if (cmd) { handled = true; finish(cmd); } else { awaitingCommand = true; $("heard").textContent = "Eshitaman…"; }
        } else if (awaitingCommand) {
          awaitingCommand = false; handled = true; finish(text);
        }
      } else {
        handled = true;
        finish(text);
      }
    }
    if (interim && !handled) $("heard").textContent = interim.trim();
  };
  rec.onerror = (ev) => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      toast("Mikrofonga ruxsat berilmadi.");
      $("opt-wake").checked = false;
      $("opt-convo").checked = false;
      wantListen = false;
      setStatus("st-mic", "RUXSAT YO'Q", "bad");
    } else if (ev.error === "network") {
      toast("Ovozni tanish xizmatiga ulanib bo'lmadi.");
    }
  };
  rec.onend = () => {
    rec = null;
    if (state === "listening") setState("idle");
    setStatus("st-mic", "TAYYOR");
    if (!handled) {
      $("heard").textContent = "";
      if ($("opt-wake").checked && state === "idle") setTimeout(() => startListening(), 300);
    }
  };
  try { rec.start(); } catch { rec = null; setState("idle"); }

  function finish(text) {
    try { rec.abort(); } catch { /* ignore */ }
    handleInput(text, { voice: true });
  }
}
function stopListening(final = false) {
  if (final) { wantListen = false; }
  if (rec) { try { rec.abort(); } catch { /* ignore */ } rec = null; }
  if (state === "listening") setState("idle");
}
function resumeListening() {
  if (!SR || state !== "idle" || rec) return;
  if ($("opt-wake").checked) setTimeout(() => startListening(), 400);
  else if ($("opt-convo").checked && lastWasVoice) setTimeout(() => startListening({ direct: true }), 400);
}

$("orb-btn").addEventListener("click", () => {
  if (sfx.isRinging()) { sfx.stopAlarm(); return; }
  if (state === "speaking") { stopSpeaking(); return; }
  if (state === "listening") {
    if ($("opt-wake").checked) { $("opt-wake").checked = false; store.set("adolf_opt_wake", false); toast("«ADOLF» deb chaqirish o'chirildi."); }
    stopListening();
    return;
  }
  if (state === "idle") {
    if (!SR) { toast("Brauzeringiz ovozni tanishni qo'llamaydi. Yozma buyruq bering."); return; }
    startListening({ direct: true });
  }
});
$("opt-wake").addEventListener("change", (e) => {
  store.set("adolf_opt_wake", e.target.checked);
  if (e.target.checked) { if (state === "idle") startListening(); } else if (rec && state === "listening") stopListening();
});
$("opt-convo").addEventListener("change", (e) => store.set("adolf_opt_convo", e.target.checked));
$("opt-voice").addEventListener("change", (e) => { store.set("adolf_opt_voice", e.target.checked); if (!e.target.checked) stopSpeaking(); });
$("opt-sfx").addEventListener("change", (e) => { store.set("adolf_opt_sfx", e.target.checked); sfx.setEnabled(e.target.checked); if (e.target.checked) sfx.play("done"); });
// Brauzer ovozni faqat foydalanuvchi harakatidan keyin ruxsat beradi
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { once: true, passive: true }));

// ---------- Salomlashish (brifing) ----------
async function greet() {
  if (session.flag("adolf_greeted")) return;
  session.setFlag("adolf_greeted");
  setState("thinking");
  let text;
  try { text = await composeBriefing(); } catch { text = "ADOLF xizmatingizga tayyor."; }
  setState("idle");
  await botSay(text);
}

// ---------- Modullar (dialoglar) ----------
document.querySelectorAll("[data-open]").forEach((b) =>
  b.addEventListener("click", () => { const d = $(b.dataset.open); if (d.showModal) d.showModal(); }),
);
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }),
);

// Reja
const TASKS_KEY = "adolf_tasks";
function renderTasks() {
  const list = $("tasks");
  list.replaceChildren();
  const tasks = store.get(TASKS_KEY, []);
  tasks.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = t.done ? "done" : "";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!t.done;
    cb.setAttribute("aria-label", `Bajarildi: ${t.task}`);
    cb.addEventListener("change", () => { tasks[i].done = cb.checked; store.set(TASKS_KEY, tasks); renderTasks(); });
    const span = document.createElement("span");
    span.className = "t";
    span.textContent = `${t.task} — ${t.time}`;
    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "✕";
    del.setAttribute("aria-label", `O'chirish: ${t.task}`);
    del.addEventListener("click", () => { tasks.splice(i, 1); store.set(TASKS_KEY, tasks); renderTasks(); });
    li.append(cb, span, del);
    list.appendChild(li);
  });
  const hud = $("hud-tasks");
  hud.replaceChildren();
  const pend = pendingTasks().slice(0, 5);
  if (!pend.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "Faol vazifa yo'q";
    hud.appendChild(li);
  }
  pend.forEach((t) => { const li = document.createElement("li"); li.textContent = t.task; hud.appendChild(li); });
}
$("task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("task-input");
  const task = input.value.trim();
  if (!task) return;
  addTask(task);
  input.value = "";
});

// Media
document.querySelectorAll("[data-media]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const q = $("media-input").value.trim();
    if (!q) { toast("Avval qidiruv so'zini yozing."); return; }
    const enc = encodeURIComponent(q);
    const url = btn.dataset.media === "youtube" ? `https://www.youtube.com/results?search_query=${enc}` : `https://open.spotify.com/search/${enc}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }),
);

// Hujjatlar
const MAX_PAGES = 30;
$("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $("pdf-status");
  if (!window.pdfjsLib) { status.textContent = "PDF kutubxonasi yuklanmadi."; return; }
  if (file.size > 15 * 1024 * 1024) { status.textContent = "Fayl juda katta (15 MB gacha)."; return; }
  status.textContent = "O'qilmoqda…";
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = Math.min(pdf.numPages, MAX_PAGES);
    let text = "";
    for (let p = 1; p <= n && text.length < 6000; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    text = text.trim();
    $("pdf-text").value = text.slice(0, 6000);
    status.textContent = text ? `${n} / ${pdf.numPages} sahifa o'qildi.` : "Matn topilmadi (skaner qilingan rasm bo'lishi mumkin).";
  } catch {
    status.textContent = "PDF'ni o'qib bo'lmadi.";
  }
});
async function docAction(btn, action) {
  const text = $("pdf-text").value.trim();
  if (!text) { toast("Avval PDF yuklang yoki matn yozing."); return; }
  await busy(btn, async () => {
    const { result } = await api("/api/tools", { action, text, target: $("doc-lang").value });
    const out = $("doc-result");
    out.textContent = result;
    out.hidden = false;
  });
}
$("doc-translate").addEventListener("click", (e) => docAction(e.currentTarget, "translate"));
$("doc-summary").addEventListener("click", (e) => docAction(e.currentTarget, "summarize"));

// Kod
$("code-run").addEventListener("click", async (e) => {
  const text = $("code-input").value.trim();
  if (!text) { toast("Vazifani yozing."); return; }
  await busy(e.currentTarget, async () => {
    const { result } = await api("/api/tools", { action: "code", text });
    const out = $("code-result");
    out.textContent = result;
    out.hidden = false;
  });
});

// Obyekt tanish
function resizeToJpeg(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasmni o'qib bo'lmadi.")); };
    img.src = url;
  });
}
$("img-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const out = $("vision-result");
  try {
    const dataUrl = await resizeToJpeg(file);
    const prev = $("img-preview");
    prev.src = dataUrl;
    prev.hidden = false;
    out.textContent = "Tahlil qilinmoqda…";
    out.hidden = false;
    const { result } = await api("/api/vision", { image: dataUrl });
    out.textContent = result;
  } catch (ex) {
    out.hidden = true;
    toast(ex.message);
  }
});

// Tahlil
$("analysis-run").addEventListener("click", async (e) => {
  const text = $("analysis-input").value.trim();
  if (!text) { toast("Matn kiriting."); return; }
  await busy(e.currentTarget, async () => {
    const { result } = await api("/api/tools", { action: "sentiment", text });
    const out = $("analysis-result");
    out.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = `Kayfiyat: ${result.label ?? "?"} (ball: ${result.score ?? 0})`;
    const p = document.createElement("p");
    p.textContent = result.izoh || "";
    out.append(strong, p);
    out.hidden = false;
  });
});

// ---------- Boshlash ----------
let appReady = false;
function initApp() {
  if (!appReady) {
    appReady = true;
    $("opt-voice").checked = store.get("adolf_opt_voice", true);
    $("opt-convo").checked = store.get("adolf_opt_convo", false) && !!SR;
    $("opt-sfx").checked = store.get("adolf_opt_sfx", true);
    sfx.setEnabled($("opt-sfx").checked);
    setStatus("st-tts", "OPENAI OVOZI");
    refreshNet();
    refreshConn();
    if (navigator.connection) navigator.connection.addEventListener("change", refreshConn);
    initBattery();
    setInterval(() => { if (session.get() && !document.hidden) pingServer(); }, 30000);
    setInterval(() => { if (session.get() && !document.hidden) refreshWeather(); }, WX_TTL + 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && session.get()) { tickTimers(); pingServer(); } });
  }
  renderLogFromHistory();
  renderTasks();
  renderTimers();
  refreshWeather();
  pingServer();
}
showView();
if (session.get()) initApp();
