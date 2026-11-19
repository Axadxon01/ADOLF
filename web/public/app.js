"use strict";

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* xotira to'la yoki bloklangan */ } },
};
const session = {
  get() { try { return sessionStorage.getItem("adolf_token") || ""; } catch { return ""; } },
  set(t) { try { sessionStorage.setItem("adolf_token", t); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem("adolf_token"); } catch { /* ignore */ } },
};

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
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
  if (!res.ok) throw new Error(data.error || `Xatolik (${res.status})`);
  return data;
}

async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; }
}

// ---------- Kirish ----------
function showView() {
  const authed = Boolean(session.get());
  $("login-view").hidden = authed;
  $("app-view").hidden = !authed;
}
function logout() {
  session.clear();
  showView();
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
    if (!res.ok) throw new Error(data.error || "Kirib bo'lmadi");
    session.set(data.token);
    $("code").value = "";
    showView();
    renderMessages();
    renderTasks();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
$("logout").addEventListener("click", logout);

// ---------- Bo'limlar ----------
const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
function selectTab(name) {
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    $(`tab-${t.dataset.tab}`).hidden = !on;
  }
}
tabs.forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));

// ---------- Chat ----------
const HISTORY_KEY = "adolf_chat";
const MAX_HISTORY = 20;

function addBubble(container, role, text, pending = false) {
  const div = document.createElement("div");
  div.className = `msg ${role}${pending ? " pending" : ""}`;
  div.textContent = text; // textContent — XSS'dan himoya
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}
function renderMessages() {
  const box = $("messages");
  box.replaceChildren();
  const history = store.get(HISTORY_KEY, []);
  if (!history.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Salom! Men ADOLF. Nima haqida gaplashamiz?";
    box.appendChild(p);
  }
  history.forEach((m) => addBubble(box, m.role === "user" ? "user" : "bot", m.content));
}

async function ask(text, container) {
  const history = store.get(HISTORY_KEY, []);
  history.push({ role: "user", content: text });
  const empty = container.querySelector(".empty");
  if (empty) empty.remove();
  addBubble(container, "user", text);
  const pending = addBubble(container, "bot", "O'ylayapman…", true);
  try {
    const { reply } = await api("/api/chat", { messages: history.slice(-MAX_HISTORY) });
    history.push({ role: "assistant", content: reply });
    store.set(HISTORY_KEY, history.slice(-MAX_HISTORY));
    pending.textContent = reply;
    pending.classList.remove("pending");
    return reply;
  } catch (e) {
    pending.remove();
    toast(e.message);
    return null;
  }
}

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await busy($("chat-send"), () => ask(text, $("messages")));
});
$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chat-form").requestSubmit(); }
});
$("chat-clear").addEventListener("click", () => { store.set(HISTORY_KEY, []); renderMessages(); });

// ---------- Ovoz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (!SR) {
  $("voice-unsupported").hidden = false;
  $("mic").disabled = true;
}
$("mic").addEventListener("click", () => {
  if (!SR) return;
  const mic = $("mic");
  if (recognition) { recognition.stop(); return; }
  recognition = new SR();
  recognition.lang = "uz-UZ";
  recognition.interimResults = false;
  mic.setAttribute("aria-pressed", "true");
  $("voice-status").textContent = "Eshityapman…";
  recognition.onresult = async (ev) => {
    const text = ev.results[0][0].transcript.trim();
    if (!text) return;
    $("voice-status").textContent = "Javob tayyorlanyapti…";
    const reply = await ask(text, $("voice-log"));
    if (reply && $("speak").checked && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(reply);
      u.lang = "uz-UZ";
      speechSynthesis.speak(u);
    }
  };
  recognition.onerror = (ev) => {
    toast(ev.error === "not-allowed" ? "Mikrofonga ruxsat berilmadi." : "Ovozni tanib bo'lmadi.");
  };
  recognition.onend = () => {
    recognition = null;
    mic.setAttribute("aria-pressed", "false");
    $("voice-status").textContent = "Bosing va gapiring (o'zbek tili)";
  };
  recognition.start();
});

// ---------- Reja ----------
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
}
$("task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("task-input");
  const task = input.value.trim();
  if (!task) return;
  const tasks = store.get(TASKS_KEY, []);
  tasks.push({ task, time: new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }), done: false });
  store.set(TASKS_KEY, tasks);
  input.value = "";
  renderTasks();
});

// ---------- Media ----------
document.querySelectorAll("[data-media]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const q = $("media-input").value.trim();
    if (!q) { toast("Avval qidiruv so'zini yozing."); return; }
    const enc = encodeURIComponent(q);
    const url = btn.dataset.media === "youtube"
      ? `https://www.youtube.com/results?search_query=${enc}`
      : `https://open.spotify.com/search/${enc}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }),
);

// ---------- Hujjatlar ----------
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

// ---------- Kod ----------
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

// ---------- Obyekt tanish ----------
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

// ---------- Tahlil ----------
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
showView();
renderMessages();
renderTasks();
