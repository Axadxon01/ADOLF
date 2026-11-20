"""ADOLF AI yadrosi (Streamlit'ga bog'liq emas).

Eski versiyadagi muammolar tuzatildi:
- `openai.ChatCompletion` (eskirgan) o'rniga zamonaviy `openai>=1` klienti;
- foydalanuvchi ma'lumotlarini o'chirib yuboradigan va ishlatilmaydigan
  "self-learning" (pickle) qismi o'rniga haqiqiy suhbat xotirasi.
"""
import base64
import json
import os

import tools

from database import get_user_data, update_user_data

SYSTEM_PROMPT = (
    "Sen ADOLF — foydalanuvchining shaxsiy sun'iy intellekt yordamchisisan. Uslubing: xushmuomala, aqlli, "
    "ozgina quruq hazilli, juda ixcham. Javoblaring ovozda o'qiladi, shuning uchun 1-3 gapda yoz; "
    "markdown, ro'yxat va emoji ishlatma (faqat kod so'ralganda kodni ``` blokida ber). "
    "Foydalanuvchi qaysi tilda yozsa, o'sha tilda (asosan o'zbekcha) javob ber. "
    "Ob-havo, vaqt, hisob-kitob, taymer, vazifa va media uchun asboblardan foydalan — taxmin qilma. "
    "Aniq bilmagan narsangni bilmasligingni ayt."
)
HISTORY_LIMIT = 20
MAX_INPUT_CHARS = 4000


class AIConfigError(RuntimeError):
    """API kaliti sozlanmagan."""


def user_message(exc: Exception) -> str:
    """Foydalanuvchiga tushunarli xato matni (kalit yoki boshqa sirlar chiqmaydi)."""
    if isinstance(exc, AIConfigError):
        return str(exc)
    try:
        import openai

        if isinstance(exc, openai.AuthenticationError):
            return "OpenAI kaliti noto'g'ri yoki bekor qilingan."
        if isinstance(exc, openai.RateLimitError):
            return "OpenAI limiti yoki balansi tugagan (billing/quota). Hisobingizni tekshiring."
        if isinstance(exc, (openai.NotFoundError, openai.PermissionDeniedError)):
            return f"'{_model()}' modeli mavjud emas yoki kalitingizda unga ruxsat yo'q (OPENAI_MODEL ni o'zgartiring)."
        if isinstance(exc, openai.APIConnectionError):
            return "OpenAI'ga ulanib bo'lmadi. Keyinroq urinib ko'ring."
    except ImportError:
        pass
    return "AI xizmati vaqtincha ishlamayapti. Keyinroq urinib ko'ring."


def _model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


def _client():
    from openai import OpenAI

    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise AIConfigError("OPENAI_API_KEY sozlanmagan.")
    base_url = os.environ.get("OPENAI_BASE_URL") or None
    return OpenAI(api_key=key, base_url=base_url, timeout=30)


def complete(messages, max_tokens: int = 600) -> str:
    resp = _client().chat.completions.create(
        model=_model(), messages=messages, max_tokens=max_tokens
    )
    return (resp.choices[0].message.content or "").strip()


def get_ai_response(prompt: str, history=None) -> str:
    prompt = (prompt or "").strip()[:MAX_INPUT_CHARS]
    if not prompt:
        raise ValueError("Bo'sh savol")
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += list(history or [])
    messages.append({"role": "user", "content": prompt})
    return complete(messages)


def chat(user_id: str, prompt: str) -> str:
    """Suhbat xotirasi bilan javob beradi va tarixni saqlaydi."""
    data = get_user_data(user_id)
    history = data.get("history", [])[-HISTORY_LIMIT:]
    answer = get_ai_response(prompt, history)
    history += [
        {"role": "user", "content": prompt.strip()[:MAX_INPUT_CHARS]},
        {"role": "assistant", "content": answer},
    ]
    update_user_data(user_id, history=history[-HISTORY_LIMIT * 2 :])
    return answer


def clear_history(user_id: str) -> None:
    update_user_data(user_id, history=[])


def translate(text: str, target: str) -> str:
    return complete(
        [
            {"role": "system", "content": "Faqat tarjimaning o'zini qaytar, izohsiz."},
            {"role": "user", "content": f"Quyidagi matnni '{target}' tiliga tarjima qil:\n\n{text[:MAX_INPUT_CHARS]}"},
        ],
        max_tokens=1200,
    )


LANG_NAMES = {"uz": "o'zbek", "en": "ingliz", "ru": "rus"}


def summarize(text: str) -> str:
    return complete(
        [
            {"role": "system", "content": "Matnning qisqa mazmunini o'zbek tilida 5-7 gapda yoz."},
            {"role": "user", "content": text[:6000]},
        ],
        max_tokens=600,
    )


def speak(text: str) -> bytes:
    """Matnni ovozga aylantiradi (mp3). Ovoz OPENAI_TTS_VOICE bilan o'zgartiriladi."""
    resp = _client().audio.speech.create(
        model=os.environ.get("OPENAI_TTS_MODEL", "tts-1"),
        voice=os.environ.get("OPENAI_TTS_VOICE", "onyx"),
        input=text[:1500],
        response_format="mp3",
    )
    return resp.read()


def sentiment(text: str) -> dict:
    raw = complete(
        [
            {
                "role": "system",
                "content": 'Matn kayfiyatini tahlil qil. Faqat JSON qaytar: {"label": "pozitiv|neytral|negativ", "score": -1..1, "izoh": "qisqa izoh"}',
            },
            {"role": "user", "content": text[:MAX_INPUT_CHARS]},
        ],
        max_tokens=200,
    )
    try:
        start, end = raw.index("{"), raw.rindex("}") + 1
        return json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError):
        return {"label": "noma'lum", "score": 0, "izoh": raw}


def code_help(task: str) -> str:
    """Kod yozishda yordam. Kod hech qachon serverda bajarilmaydi."""
    return complete(
        [
            {"role": "system", "content": "Sen dasturlash bo'yicha yordamchisan. Kodni markdown blokida ber va qisqa izohla."},
            {"role": "user", "content": task[:MAX_INPUT_CHARS]},
        ],
        max_tokens=900,
    )


def describe_image(image_bytes: bytes, mime: str = "image/jpeg") -> str:
    b64 = base64.b64encode(image_bytes).decode()
    return complete(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Rasmdagi asosiy obyektlarni o'zbek tilida ro'yxat qilib sanab ber va qisqa tavsif yoz."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            }
        ],
        max_tokens=500,
    )


def transcribe(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    resp = _client().audio.transcriptions.create(
        model="whisper-1", file=(filename, audio_bytes), language="uz"
    )
    return resp.text.strip()


# ---------- Agent rejimi (asboblar bilan) ----------
AGENT_TOOLS = [
    {"type": "function", "function": {"name": "get_weather", "description": "Shahar uchun hozirgi ob-havo. Shahar aytilmasa Toshkent.",
     "parameters": {"type": "object", "properties": {"city": {"type": "string", "description": "Shahar nomi (masalan Samarqand)"}}}}},
    {"type": "function", "function": {"name": "get_time", "description": "Hozirgi vaqt va sana.",
     "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "calculate", "description": "Arifmetik hisob-kitob (+ - * / ** %).",
     "parameters": {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}}},
    {"type": "function", "function": {"name": "set_timer", "description": "Taymer yoki eslatma qo'yadi.",
     "parameters": {"type": "object", "properties": {"seconds": {"type": "integer", "description": "1 dan 86400 gacha"}, "label": {"type": "string"}}, "required": ["seconds"]}}},
    {"type": "function", "function": {"name": "add_task", "description": "Foydalanuvchining vazifalar ro'yxatiga yangi vazifa qo'shadi.",
     "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}},
    {"type": "function", "function": {"name": "open_media", "description": "YouTube yoki Spotify'da qidiruv havolasini ochadi.",
     "parameters": {"type": "object", "properties": {"platform": {"type": "string", "enum": ["youtube", "spotify"]}, "query": {"type": "string"}}, "required": ["platform", "query"]}}},
]
MAX_AGENT_STEPS = 3


def _run_tool(name: str, args: dict, actions: list, tz: str):
    try:
        if name == "get_weather":
            return tools.get_weather(str(args.get("city", "")))
        if name == "get_time":
            return tools.now_info(tz)
        if name == "calculate":
            return {"result": tools.calculate(str(args.get("expression", "")))}
        if name == "set_timer":
            seconds = max(1, min(int(args.get("seconds", 0)), 86400))
            label = str(args.get("label", "") or "Taymer")[:80]
            actions.append({"type": "timer", "seconds": seconds, "label": label})
            return {"ok": True, "seconds": seconds}
        if name == "add_task":
            text = str(args.get("text", "")).strip()[:200]
            if not text:
                return {"error": "Vazifa matni bo'sh."}
            actions.append({"type": "task", "text": text})
            return {"ok": True}
        if name == "open_media":
            from urllib.parse import quote

            query = str(args.get("query", "")).strip()[:200]
            if not query:
                return {"error": "Qidiruv so'zi bo'sh."}
            if args.get("platform") == "spotify":
                url, label = f"https://open.spotify.com/search/{quote(query)}", "Spotify'da ochish"
            else:
                url, label = f"https://www.youtube.com/results?search_query={quote(query)}", "YouTube'da ochish"
            actions.append({"type": "open", "url": url, "label": label})
            return {"ok": True}
    except tools.ToolError as exc:
        return {"error": str(exc)}
    except (TypeError, ValueError):
        return {"error": "Noto'g'ri argumentlar."}
    return {"error": f"Noma'lum asbob: {name}"}


def agent_chat(messages, memory=None, tz: str = "") -> dict:
    """Asboblar bilan suhbat: {"reply": str, "actions": [..]}. Asbobsiz modellar uchun oddiy javobga o'tadi."""
    system = SYSTEM_PROMPT
    facts = [str(m).strip()[:200] for m in (memory or []) if str(m).strip()][:20]
    if facts:
        system += " Foydalanuvchi haqida bilganlaring: " + "; ".join(facts) + "."
    msgs = [{"role": "system", "content": system}] + list(messages)
    actions: list = []
    client = _client()
    try:
        for _ in range(MAX_AGENT_STEPS):
            resp = client.chat.completions.create(model=_model(), messages=msgs, tools=AGENT_TOOLS, max_tokens=500)
            msg = resp.choices[0].message
            calls = getattr(msg, "tool_calls", None) or []
            if not calls:
                return {"reply": (msg.content or "").strip(), "actions": actions}
            msgs.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [{"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}} for c in calls],
            })
            for c in calls:
                try:
                    args = json.loads(c.function.arguments or "{}")
                    if not isinstance(args, dict):
                        args = {}
                except json.JSONDecodeError:
                    args = {}
                result = _run_tool(c.function.name, args, actions, tz)
                msgs.append({"role": "tool", "tool_call_id": c.id, "content": json.dumps(result, ensure_ascii=False)})
        final = client.chat.completions.create(model=_model(), messages=msgs, max_tokens=300)
        return {"reply": (final.choices[0].message.content or "").strip(), "actions": actions}
    except Exception as exc:
        import openai

        if isinstance(exc, (openai.BadRequestError, openai.UnprocessableEntityError)):
            # model asboblarni qo'llamasa — oddiy javob
            return {"reply": complete(msgs, 500), "actions": []}
        raise
