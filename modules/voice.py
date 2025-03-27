import streamlit as st
import speech_recognition as sr
import pyttsx3
import os
import sys

# 🔧 AI yadro modulini yuklash (asosiy papkadan)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ai_core import get_gpt4_response

# 🎤 Ovozli interfeys funksiyasi
def voice_interface():
    st.subheader("🎙 Ovozli Muloqot")
    
    if st.button("🎤 Mikrofonni yoqish"):
        recognizer = sr.Recognizer()
        with sr.Microphone() as source:
            st.write("🗣 Gapiring...")
            audio = recognizer.listen(source)
            try:
                # 🔊 Ovozni matnga aylantirish
                text = recognizer.recognize_google(audio, language="uz-UZ")
                st.write(f"🧑 Siz: {text}")
                
                # 🤖 AI dan javob olish
                response = get_gpt4_response(text)
                st.write(f"ADOLF: {response}")

                # 🗣 ADOLF ovoz chiqaradi
                engine = pyttsx3.init()
                engine.say(response)
                engine.runAndWait()
            except sr.UnknownValueError:
                st.error("❌ Ovozingizni tushunolmadim.")
            except Exception as e:
                st.error(f"Xatolik: {str(e)}")
