import streamlit as st
import openai
import os
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

# 👇 MODULLARGA YO‘L QO‘SHILADI
import sys
import pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent))

from database import save_user_data, get_user_data

# ✅ API kalitni xavfsiz o‘qish (Streamlit secrets bilan ishlaydi)
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

# 🔮 GPT-4 dan javob olish
def get_gpt4_response(prompt):
    response = openai.Completion.create(
        model="gpt-4",
        prompt=prompt,
        max_tokens=150
    )
    return response.choices[0].text.strip()

# 🧑‍💻 Chat interfeys
def chat_interface():
    st.subheader("AI Chat (Self-Learning)")
    user_id = st.session_state.user_id
    user_input = st.text_input("Savolingizni kiriting:")
    if st.button("Javob olish") and user_input:
        vectorizer, classifier = load_or_create_model(user_id)
        response = get_gpt4_response(user_input)
        st.write(f"ADOLF: {response}")
        
        # 🔁 Modelni o‘rganishga yangilash
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
