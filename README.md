ADOLF 5.0 - Aqlli Raqamli Hamroh
ADOLF (Advanced Digital Operational Life Facilitator) — bu sun’iy intellekt asosidagi ko‘p funksiyali raqamli yordamchi bo‘lib, foydalanuvchilarning kundalik, professional va favqulodda ehtiyojlarini qondirish uchun mo‘ljallangan. Ushbu loyiha Streamlit interfeysi, FastAPI serveri va turli modullar orqali keng imkoniyatlarni taqdim etadi.

Xususiyatlar
AI Intellekt: GPT-4 asosidagi chat va o‘z-o‘zini o‘rganish (self-learning).
Ovozli Muloqot: Mikrofon orqali buyruq qabul qilish va ovozli javob berish.
Kundalik Reja: Vazifalarni boshqarish va rejalashtirish.
Media Integratsiyasi: YouTube va Spotify boshqaruvi.
Dasturchi Vositalari: Kod yozish va ishlatish.
Hujjatlar bilan Ishlash: PDF yuklash, o‘qish va tarjima qilish.
Real Vaqt Monitoringi: Kamera orqali yuz tanish va qonunbuzarlik aniqlash.
Obyekt Tanish: Rasm orqali obyektlarni aniqlash.
Tahlil va Etika: Matn sentimentini tahlil qilish.
Xavfsizlik: OTP, Face ID va IP monitoring.
Loyiha Tuzilmasi
text

Collapse

Wrap

Copy
ADOLF_5.0/
│
├── main.py              # Streamlit interfeysi
├── server.py            # FastAPI serveri
├── security.py          # Xavfsizlik modullari
├── modules/             # Modullar papkasi
│   ├── __init__.py      # Modullar uchun bo‘sh fayl
│   ├── ai_core.py       # AI intellektual yadro
│   ├── voice.py         # Ovozli muloqot
│   ├── routine.py       # Kundalik reja
│   ├── media.py         # Media integratsiyasi
│   ├── dev_tools.py     # Dasturchi vositalari
│   ├── knowledge.py     # Hujjatlar bilan ishlash
│   ├── monitoring.py    # Real vaqt monitoringi
│   ├── object_intel.py  # Obyekt tanish
│   └── analysis.py      # Tahlil va etika
├── database.py          # SQLite ma’lumotlar bazasi
├── config.py            # API kalitlari va sozlamalar
├── models/              # ML modellari
│   ├── face_model.pkl   # Yuz tanish modeli
│   └── self_learn_model.pkl  # Self-learning modeli
└── requirements.txt     # Kerakli kutubxonalar
