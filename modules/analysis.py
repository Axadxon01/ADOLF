import logging

import streamlit as st

import ai_core


logger = logging.getLogger("adolf")


def analysis_interface():
    st.subheader("Matn kayfiyati tahlili")
    text = st.text_area("Matn kiriting:", max_chars=ai_core.MAX_INPUT_CHARS)
    if st.button("Tahlil qilish") and text.strip():
        try:
            res = ai_core.sentiment(text)
            st.write(f"Kayfiyat: **{res.get('label', '?')}** (ball: {res.get('score', 0)})")
            st.caption(res.get("izoh", ""))
        except ai_core.AIConfigError as exc:
            st.error(f"❌ {exc}")
        except Exception as exc:
            logger.exception("AI xatosi")
            st.error(f"❌ {ai_core.user_message(exc)}")
