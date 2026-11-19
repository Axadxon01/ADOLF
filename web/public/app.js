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
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.get()}` },
      body: JSON.stringify(body),
    });
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

// ---------- Jurnal ----------
const HISTORY_KEY = "adolf_chat";
const MAX_HISTORY = 20;
function addLog(role, text, link) {
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
  if (link) {
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = link.label;
    div.append(document.createElement("br"), a);
  }
  log.appendChild(div);
  while (log.children.length > 80) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  return div;
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

// ---------- Buyruqlar (AI'siz bajariladi) ----------
function norm(t) {
  return t.toLowerCase().replace(/[’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
}
function pendingTasks() { return store.get(TASKS_KEY, []).filter((t) => !t.done); }

function parseIntent(raw) {
  const t = norm(raw);
  let m;
  if (/(soat|vaqt)\b.*\b(necha|nechchi|qancha|nechta)/.test(t) || /^soat nechchi/.test(t)) {
    return { reply: `Hozir soat ${fmtTime(new Date())}.` };
  }
  if (/(bugun|sana|kun)\b.*\b(qaysi|nima|necha|nechi)/.test(t)) {
    return { reply: `Bugun ${fmtDate(new Date(), true)}.` };
  }
  if ((m = t.match(/^(?:vazifa|reja|eslatma)\s*(?:qo'?sh|qosh|yoz|qo'shing)\W*(.+)$/))) {
    const task = m[1].trim();
    const tasks = store.get(TASKS_KEY, []);
    tasks.push({ task, time: nowHM(), done: false });
    store.set(TASKS_KEY, tasks);
    renderTasks();
    return { reply: `Vazifa qo'shildi: ${task}.` };
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
  if ((m = t.match(/(?:youtube|yutub|yutyub)\w*\s+(.+)/))) {
    return { reply: `YouTube'da «${m[1]}» qidiruvi tayyor.`, open: `https://www.youtube.com/results?search_query=${encodeURIComponent(m[1])}`, label: "YouTube'da ochish" };
  }
  if ((m = t.match(/^(?:musiqa|qo'shiq|spotify)\w*\s*(?:qo'?y\w*|top|och)?\s+(.+)/))) {
    return { reply: `Spotify'da «${m[1]}» qidiruvi tayyor.`, open: `https://open.spotify.com/search/${encodeURIComponent(m[1])}`, label: "Spotify'da ochish" };
  }
  if (/^(rahmat|raxmat|tashakkur)/.test(t)) return { reply: "Arzimaydi." };
  if (/^(salom|assalomu alaykum|hayrli)/.test(t) && t.split(" ").length <= 3) return { reply: "Salom! Sizga qanday yordam bera olaman?" };
  return null;
}
function nowHM() { return fmtTime(new Date()); }

let lastWasVoice = false;
async function handleInput(text, { voice = false } = {}) {
  text = text.trim();
  if (!text) return;
  lastWasVoice = voice;
  stopSpeaking();
  $("heard").textContent = "";
  addLog("user", text);

  const intent = parseIntent(text);
  if (intent) {
    addLog("bot", intent.reply, intent.open ? { url: intent.open, label: intent.label } : null);
    if (intent.open && !voice) window.open(intent.open, "_blank", "noopener,noreferrer");
    await speak(intent.reply);
    resumeListening();
    return;
  }

  setState("thinking");
  const pending = addLog("bot", "O'ylayapman…");
  pending.classList.add("pending");
  const history = store.get(HISTORY_KEY, []);
  history.push({ role: "user", content: text });
  try {
    const { reply } = await api("/api/chat", { messages: history.slice(-MAX_HISTORY) });
    history.push({ role: "assistant", content: reply });
    store.set(HISTORY_KEY, history.slice(-MAX_HISTORY));
    pending.classList.remove("pending");
    pending.querySelector(".txt").textContent = reply;
    setStatus("st-ai", "FAOL");
    setState("idle");
    await speak(reply);
  } catch (e) {
    pending.className = "entry sys";
    pending.querySelector(".who").textContent = "TIZIM";
    pending.querySelector(".txt").textContent = e.message;
    setStatus("st-ai", "XATO", "bad");
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

// ---------- Salomlashish ----------
function greet() {
  if (session.flag("adolf_greeted")) return;
  session.setFlag("adolf_greeted");
  const h = new Date().getHours();
  const part = h < 5 ? "Xayrli tun" : h < 12 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
  const text = `${part}. ADOLF xizmatingizga tayyor.`;
  addLog("bot", text);
  speak(text);
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
  const tasks = store.get(TASKS_KEY, []);
  tasks.push({ task, time: nowHM(), done: false });
  store.set(TASKS_KEY, tasks);
  input.value = "";
  renderTasks();
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
  if (appReady) return;
  appReady = true;
  $("opt-voice").checked = store.get("adolf_opt_voice", true);
  $("opt-convo").checked = store.get("adolf_opt_convo", false) && !!SR;
  refreshNet();
  setStatus("st-tts", "OPENAI OVOZI");
  renderLogFromHistory();
  renderTasks();
}
showView();
if (session.get()) initApp();
