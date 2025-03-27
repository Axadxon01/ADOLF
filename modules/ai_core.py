# ai_core.py

import os
import sys

# 🔧 Fayl joylashgan manzilni aniqlash
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 🔙 Asosiy katalogga chiqish
BASE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))

# 📦 Python import yo‘liga asosiy katalogni qo‘shish
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import streamlit as st
import openai
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

# ✅ Endi bu ishlaydi!
from database import save_user_data, get_user_data

# 🔐 OpenAI API kaliti (Streamlit secrets orqali)
openai.api_key = os.environ.get("OPENAI_API_KEY")

# 🧠 Foydalanuvchiga xos modelni yaratish/yuklash
def load_or_create_model(user_id):
    user_data = get_user_data(user_id) or {"questions": [], "responses": []}

    if "model" not in user_data:
        vectorizer = TfidfVectorizer()
        classifier = MultinomialNB()

        if user_data["questions"]:
            X = vectorizer.fit_transform(user_data["questions"])
            classifier.fit(X, user_data["responses"])

        user_data["model"] = {
            "vectorizer": pickle.dumps(vectorizer),
            "classifier": pickle.dumps(classifier)
        }

        save_user_data(user_id, user_data)

    return (
        pickle.loads(user_data["model"]["vectorizer"]),
        pickle.loads(user_data["model"]["classifier"])
    )

# 🤖 GPT-4 orqali javob olish
def get_gpt4_response(prompt):
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"❌ Xatolik: {str(e)}"

# 🗣️ Streamlit orqali foydalanuvchi bilan suhbat
def chat_interface():
    st.subheader("🤖 AI Chat (Self-Learning)")

    user_id = st.session_state.get("user_id", "default_user")
    user_input = st.text_input("Savolingizni kiriting:")

    if st.button("Javob olish") and user_input.strip():
        vectorizer, classifier = load_or_create_model(user_id)
        response = get_gpt4_response(user_input)
        st.write(f"ADOLF: {response}")

        # 🔄 Modelni yangilash
        user_data = get_user_data(user_id)
        user_data["questions"].append(user_input)
        user_data["responses"].append(response)

        X = vectorizer.fit_transform(user_data["questions"])
        classifier.fit(X, user_data["responses"])

        user_data["model"] = {
            "vectorizer": pickle.dumps(vectorizer),
            "classifier": pickle.dumps(classifier)
        }

        save_user_data(user_id, user_data)
