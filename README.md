# ADOLF 5.2 — Aqlli Raqamli Hamroh

AI chat, ovozli muloqot, kundalik reja, media qidiruv, PDF hujjatlar (tarjima/qisqacha mazmun), kod yordamchi, rasmdagi obyektlarni tanish va matn kayfiyati tahlili.

Loyihada **ikkita versiya** bor:

| Versiya | Papka | Qayerda ishlaydi |
|---|---|---|
| **Web (Netlify)** | `web/` | Netlify: statik sayt + serverless funksiyalar |
| **Python (FastAPI + shu HUD interfeys)** | ildiz papka | Render yoki lokal kompyuter |
| Klassik Streamlit (`main.py`) | ildiz papka | Faqat lokal, ixtiyoriy |

> Netlify Streamlit/FastAPI serverlarini ishga tushira olmaydi, shuning uchun web versiya alohida yozilgan.

## Netlify'ga deploy (web versiya)

1. Netlify'da shu repozitoriyani ulang. **Base directory: `web`** (ildizdagi `netlify.toml` buni o'zi belgilaydi; build: `npm run build`, publish: `public`). Qo'lda deploy: `cd web && npx netlify deploy --prod`.
2. **Site configuration → Environment variables** bo'limida (scope: *Functions*) quyidagilarni kiriting:

| O'zgaruvchi | Majburiy | Tavsif |
|---|---|---|
| `ACCESS_CODE` | ha | Saytga kirish kodi (o'zingiz o'ylab toping, uzun bo'lsin) |
| `SESSION_SECRET` | ha | Tokenlarni imzolash uchun tasodifiy uzun matn (`openssl rand -hex 32`) |
| `OPENAI_API_KEY` | ha | OpenAI API kaliti (yoki Netlify AI Gateway o'zi qo'yadi) |
| `OPENAI_MODEL` | yo'q | Standart: `gpt-4o-mini` |
| `OPENAI_BASE_URL` | yo'q | OpenAI-mos boshqa manzil (standart: `https://api.openai.com/v1`) |

3. O'zgaruvchilar qo'shilgandan keyin **qayta deploy** qiling (funksiyalar qiymatlarni deploy paytida oladi).

Lokal sinash: `cd web && npm install && npx netlify dev` (o'zgaruvchilarni `web/.env` ichiga yozing — u git'ga qo'shilmaydi).

### Xavfsizlik
- Barcha AI funksiyalari kirish kodi bilan imzolangan tokenni talab qiladi (12 soat amal qiladi).
- Kirish urinishlari cheklangan (Netlify `rateLimit` + qo'shimcha qulf).
- Qattiq CSP va xavfsizlik sarlavhalari (`netlify.toml`), chat javoblari faqat `textContent` orqali chiqariladi.
- Kod hech qayerda ishga tushirilmaydi (eski `exec` olib tashlangan).
- Vazifalar va suhbat tarixi faqat foydalanuvchi brauzerida (localStorage) saqlanadi.

## Render / lokal (FastAPI + HUD interfeys)

Interfeys `web/public` papkasida, `server.py` uni va API'ni birga xizmat qiladi.

```bash
pip install -r requirements.txt
export ADOLF_ACCESS_CODE="sizning-kodingiz"
export ADOLF_SECRET="$(openssl rand -hex 32)"
export OPENAI_API_KEY="sk-..."
uvicorn server:app --port 8000      # http://localhost:8000
```

**Render sozlamalari:** Build `pip install -r requirements.txt`, Start `uvicorn server:app --host 0.0.0.0 --port $PORT`. Muhit o'zgaruvchilari: `ADOLF_ACCESS_CODE`, `ADOLF_SECRET`, `OPENAI_API_KEY` (ixtiyoriy: `OPENAI_MODEL`, `OPENAI_TTS_VOICE` — standart `onyx`).

### Ovozli boshqaruv
- Yadroni bosing va gapiring. «Doimiy suhbat» — javobdan keyin o'zi yana tinglaydi. «ADOLF deb chaqirish» — doim tinglaydi va «ADOLF, soat nechchi?» deganda javob beradi.
- AI'siz ishlaydigan buyruqlar: «soat nechchi», «bugun qaysi kun», «vazifa qo'sh: …», «vazifalarim», «YouTube …», «musiqa qo'y …», «suhbatni tozala».
- Ovoz OpenAI TTS orqali chiqadi; u ishlamasa brauzer ovoziga o'tadi. Ovozni tanish Chrome/Edge'da ishlaydi.

## Klassik Streamlit versiya (ixtiyoriy)

```bash
pip install -r requirements-dev.txt
streamlit run main.py
pytest
```

## Eski versiyadan nimalar tuzatildi
- `exec()` va `eval()` bilan kod bajarish zaifliklari olib tashlandi (JSON asosidagi baza).
- OTP ekranda ko'rsatilishi va hech qachon mos kelmasligi tuzatildi → kirish kodi + imzolangan token + qulflash.
- Face ID (istalgan yuzni qabul qilardi) olib tashlandi; kamera orqali "qonunbuzarlik aniqlash" demo moduli ham olib tashlandi.
- `server.py` ishga tushmasligi (`time` importi, noto'g'ri import yo'li) tuzatildi va autentifikatsiya qo'shildi.
- Eskirgan `openai==0.11.4` → `openai>=1`. Ma'lumotni o'chirib yuboradigan "self-learning" o'rniga haqiqiy suhbat xotirasi.
- Ovoz: serverdagi mikrofon o'rniga brauzer mikrofoni (web: Web Speech API, Streamlit: `st.audio_input`).
- Rasm tahlili endi haqiqiy (vision modeli orqali), PDF'ning barcha sahifalari o'qiladi.
