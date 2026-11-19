import logging

import streamlit as st

import ai_core
from database import get_user_data


logger = logging.getLogger("adolf")


def chat_interface():
    st.subheader("🤖 AI Chat")
    user_id = st.session_state.user_id
    for msg in get_user_data(user_id).get("history", []):
        st.chat_message(msg["role"]).write(msg["content"])
    prompt = st.chat_input("Savolingizni yozing")
    if prompt:
        st.chat_message("user").write(prompt)
        try:
            st.chat_message("assistant").write(ai_core.chat(user_id, prompt))
        except ai_core.AIConfigError as exc:
            st.error(f"❌ {exc}")
        except Exception as exc:
            logger.exception("AI xatosi")
            st.error(f"❌ {ai_core.user_message(exc)}")
    if st.sidebar.button("Suhbatni tozalash"):
        ai_core.clear_history(user_id)
        st.rerun()
