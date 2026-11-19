import logging

import streamlit as st
from pypdf import PdfReader

import ai_core

logger = logging.getLogger("adolf")


MAX_PAGES = 30


def knowledge_interface():
    st.subheader("Hujjatlar bilan Ishlash")
    uploaded = st.file_uploader("PDF yuklang", type="pdf")
    if not uploaded:
        return
    reader = PdfReader(uploaded)
    pages = reader.pages[:MAX_PAGES]
    text = "\n".join((p.extract_text() or "") for p in pages).strip()
    if not text:
        st.warning("PDF'dan matn topilmadi (skaner qilingan rasm bo'lishi mumkin).")
        return
    st.caption(f"{len(pages)} / {len(reader.pages)} sahifa o'qildi")
    st.text_area("Matn (boshi)", text[:1500], height=200)
    lang = st.selectbox("Tarjima tili", ["uz", "en", "ru"])
    try:
        if st.button("Tarjima qilish"):
            st.write(ai_core.translate(text[:3000], lang))
        if st.button("Qisqacha mazmuni"):
            st.write(ai_core.get_ai_response("Quyidagi matnning qisqa mazmunini yoz:\n\n" + text[:6000]))
    except ai_core.AIConfigError as exc:
        st.error(f"❌ {exc}")
    except Exception as exc:
        logger.exception("AI xatosi")
        st.error(f"❌ {ai_core.user_message(exc)}")
