"""ADOLF AI yadrosi (Streamlit'ga bog'liq emas).

Eski versiyadagi muammolar tuzatildi:
- `openai.ChatCompletion` (eskirgan) o'rniga zamonaviy `openai>=1` klienti;
- foydalanuvchi ma'lumotlarini o'chirib yuboradigan va ishlatilmaydigan
  "self-learning" (pickle) qismi o'rniga haqiqiy suhbat xotirasi.
"""
import base64
import json
import os

from database import get_user_data, update_user_data

SYSTEM_PROMPT = (
    "Sen ADOLF — aqlli raqamli yordamchisan. Foydalanuvchi qaysi tilda yozsa, "
    "o'sha tilda (asosan o'zbekcha) aniq, qisqa va foydali javob ber."
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
