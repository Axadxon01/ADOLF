import streamlit as st

import ai_core


def voice_interface():
    st.subheader("🎙 Ovozli Muloqot")
    audio = st.audio_input("Gapiring")
    if not audio:
        return
    try:
        text = ai_core.transcribe(audio.getvalue())
        st.write(f"🧑 Siz: {text}")
        if text:
            st.write(f"ADOLF: {ai_core.chat(st.session_state.user_id, text)}")
    except ai_core.AIConfigError as exc:
        st.error(f"❌ {exc}")
    except Exception:
        st.error("❌ Ovozni qayta ishlab bo'lmadi.")
