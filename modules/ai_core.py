import sys
import os
import streamlit as st
import openai
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

# 🔧 To‘g‘ri yo‘lga chiqish (asosiy papkaga)
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# 📦 Ma'lumotlar bazasi bilan bog‘lanish
from database import save_user_data, get_user_data

# 🔐 API kalitni o‘qish (Streamlit secrets ishlatadi)
openai.api_key = os.environ.get("OPENAI_API_KEY")

# 🧠 Modelni yuklash yoki yaratish
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

# 🔮 GPT-4’dan javob olish
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
        return f"Xatolik yuz berdi: {str(e)}"

# 💬 Chat interfeysi
def chat_interface():
    st.subheader("AI Chat (Self-Learning)")
    user_id = st.session_state.get("user_id", "default_user")
    user_input = st.text_input("Savolingizni kiriting:")
    
    if st.button("Javob olish") and user_input.strip():
        vectorizer, classifier = load_or_create_model(user_id)
        response = get_gpt4_response(user_input)
        st.write(f"ADOLF: {response}")
        
        # 🧠 Modelni yangilash
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
