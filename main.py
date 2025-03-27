import streamlit as st
import requests
import time

# 🔧 AI moduli (asosiy modul)
import ai_core

# 📦 Modullar (modules/ ichidan)
from modules import voice, routine, media, dev_tools, knowledge, monitoring, object_intel, analysis

# 🔐 Xavfsizlik va ma’lumotlar
from security import generate_otp, check_security, face_id_check
from database import save_user_data, get_user_data

# ⚙️ Streamlit konfiguratsiyasi
st.set_page_config(page_title="ADOLF 5.0", page_icon="🤖")

# 🌐 FastAPI server manzili
BASE_URL = "http://localhost:8000"  # Agar online server bo‘lsa, bu yerga URL qo‘yiladi

# 🚀 Asosiy funksiya
def main():
    st.title("ADOLF 5.0 - Aqlli Raqamli Hamroh")
    st.write("Sizning kundalik, professional va favqulodda ehtiyojlaringiz uchun yordamchi.")

    # Foydalanuvchi holatini tekshirish
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
        st.session_state.user_id = "user_" + str(hash(time.time()))[-8:]

    # Kirish tekshiruvi
    if not st.session_state.authenticated:
        authenticate_user()
    else:
        show_dashboard()

# 🔐 Autentifikatsiya oynasi
def authenticate_user():
    st.subheader("Kirish")
    auth_method = st.selectbox("Autentifikatsiya usuli", ["OTP", "Face ID"])

    if auth_method == "OTP":
        if st.button("OTP generatsiya qilish"):
            try:
                response = requests.get(f"{BASE_URL}/generate_otp/{st.session_state.user_id}")
                otp_data = response.json()
                st.success(f"OTP: {otp_data.get('otp', 'Nomaʼlum')}")
            except Exception as e:
                st.error(f"Serverga ulanishda xatolik: {e}")

        otp_input = st.text_input("OTP kodini kiriting", type="password")
        if st.button("Tasdiqlash"):
            if check_security(otp_input):
                st.session_state.authenticated = True
                st.success("✅ Muvaffaqiyatli kirish!")
            else:
                st.error("❌ Noto‘g‘ri kod.")

    elif auth_method == "Face ID":
        if st.button("Face ID tekshiruvi"):
            if face_id_check():
                st.session_state.authenticated = True
                st.success("✅ Yuz aniqlandi!")
            else:
                st.error("❌ Yuz aniqlanmadi.")

# 📊 Boshqaruv paneli
def show_dashboard():
    menu = st.sidebar.selectbox("Menyu", [
        "AI Chat", "Ovozli Muloqot", "Kundalik Reja", "Media", "Dev Tools",
        "Hujjatlar", "Monitoring", "Obyekt Tanish", "Tahlil"
    ])

    if menu == "AI Chat":
        ai_core.chat_interface()
    elif menu == "Ovozli Muloqot":
        voice.voice_interface()
    elif menu == "Kundalik Reja":
        routine.routine_interface()
    elif menu == "Media":
        media.media_interface()
    elif menu == "Dev Tools":
        dev_tools.dev_interface()
    elif menu == "Hujjatlar":
        knowledge.knowledge_interface()
    elif menu == "Monitoring":
        monitoring.monitoring_interface()
    elif menu == "Obyekt Tanish":
        object_intel.object_interface()
    elif menu == "Tahlil":
        analysis.analysis_interface()

# 🔄 Ilovani ishga tushurish
if __name__ == "__main__":
    main()
