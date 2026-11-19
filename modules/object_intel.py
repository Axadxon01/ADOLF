import logging

import streamlit as st

import ai_core


logger = logging.getLogger("adolf")


def object_interface():
    st.subheader("🔍 Obyekt Tanish")
    shot = st.camera_input("Rasmga oling") or st.file_uploader("yoki rasm yuklang", type=["png", "jpg", "jpeg"])
    if shot:
        st.image(shot)
        try:
            st.write(ai_core.describe_image(shot.getvalue(), shot.type or "image/jpeg"))
        except ai_core.AIConfigError as exc:
            st.error(f"❌ {exc}")
        except Exception as exc:
            logger.exception("AI xatosi")
            st.error(f"❌ {ai_core.user_message(exc)}")
