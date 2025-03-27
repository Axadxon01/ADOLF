import streamlit as st
import openai
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

# 🔗 Mahalliy moduldan import
from database import save_user_data, get_user_data

# 🔐 OpenAI API kalitini o‘qish (Streamlit secrets orqali)
openai.api_key = os.environ.get("OPENAI_API_KEY")

# 🧠 Foydalanuvchiga xos modelni yaratish/yuklash
def load_or_create_model(user_id):
    # Foydalanuvchining mavjud ma’lumotlarini olish
    user_data = get_user_data(user_id) or {"questions": [], "responses": []}

    # Model mavjud bo‘lmasa, yangisini yaratish
    if "model" not in user_data:
        vectorizer = TfidfVectorizer()
        classifier = MultinomialNB()

        if user_data["questions"]:
            X = vectorizer.fit_transform(user_data["questions"])
            classifier.fit(X, user_data["responses"])

        # Modelni saqlash
        user_data["model"] = {
            "vectorizer": pickle.dumps(vectorizer),
            "classifier": pickle.dumps(classifier)
        }

        save_user_data(user_id, user_data)

    return (
        pickle.loads(user_data["model"]["vectorizer"]),
        pickle.loads(user_data["model"]["classifier"])
    )

# 🤖 GPT-4 modelidan javob olish
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

# 🧑‍💻 Chat interfeysni chizish
def chat_interface():
    st.subheader("🤖 AI Chat (Self-Learning)")

    # Foydalanuvchini aniqlash
    user_id = st.session_state.get("user_id", "default_user")

    # Savolni qabul qilish
    user_input = st.text_input("Savolingizni kiriting:")

    if st.button("Javob olish") and user_input.strip():
        # Modelni yuklash yoki yaratish
        vectorizer, classifier = load_or_create_model(user_id)

        # GPT-4 orqali javob olish
        response = get_gpt4_response(user_input)
        st.write(f"ADOLF: {response}")

        # O‘rganish maqsadida saqlash
        user_data = get_user_data(user_id)
        user_data["questions"].append(user_input)
        user_data["responses"].append(response)

        # Modelni yangilash
        X = vectorizer.fit_transform(user_data["questions"])
        classifier.fit(X, user_data["responses"])
        user_data["model"] = {
            "vectorizer": pickle.dumps(vectorizer),
            "classifier": pickle.dumps(classifier)
        }

        save_user_data(user_id, user_data)
