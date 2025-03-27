import streamlit as st
import speech_recognition as sr
import pyttsx3
from modules.ai_core import get_gpt4_response

def voice_interface():
    st.subheader("Ovozli Muloqot")
    if st.button("Mikrofonni yoqish"):
        recognizer = sr.Recognizer()
        with sr.Microphone() as source:
            st.write("Gapiring...")
            audio = recognizer.listen(source)
            try:
                text = recognizer.recognize_google(audio, language="uz-UZ")
                st.write(f"Siz: {text}")
                response = get_gpt4_response(text)
                st.write(f"ADOLF: {response}")
                engine = pyttsx3.init()
                engine.say(response)
                engine.runAndWait()
            except sr.UnknownValueError:
                st.write("Ovozingizni tushunolmadim.")