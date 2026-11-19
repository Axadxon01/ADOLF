import streamlit as st

import security
from modules import analysis, chat, dev_tools, knowledge, media, object_intel, routine, voice

st.set_page_config(page_title="ADOLF 5.0", page_icon="🤖")

USER_ID = "owner"

PAGES = {
    "AI Chat": chat.chat_interface,
    "Ovozli Muloqot": voice.voice_interface,
    "Kundalik Reja": routine.routine_interface,
    "Media": media.media_interface,
    "Kod Yordamchi": dev_tools.dev_interface,
    "Hujjatlar": knowledge.knowledge_interface,
    "Obyekt Tanish": object_intel.object_interface,
    "Tahlil": analysis.analysis_interface,
}


def login_view():
    st.subheader("Kirish")
    if not security.access_configured():
        st.error("ADOLF_ACCESS_CODE muhit o'zgaruvchisi sozlanmagan. README'dagi ko'rsatmaga qarang.")
        return
    if security.is_locked():
        st.error("Juda ko'p xato urinish. Bir necha daqiqadan keyin qayta urinib ko'ring.")
        return
    with st.form("login"):
        code = st.text_input("Kirish kodi", type="password")
        if st.form_submit_button("Kirish"):
            if security.check_access_code(code):
                st.session_state.token = security.create_token(USER_ID)
                st.rerun()
            else:
                st.error("❌ Noto'g'ri kod.")


def main():
    st.title("ADOLF 5.0 - Aqlli Raqamli Hamroh")
    user = security.verify_token(st.session_state.get("token", ""))
    if not user:
        st.session_state.pop("token", None)
        login_view()
        return
    st.session_state.user_id = user
    page = st.sidebar.selectbox("Menyu", list(PAGES))
    if st.sidebar.button("Chiqish"):
        st.session_state.pop("token", None)
        st.rerun()
    PAGES[page]()


main()
