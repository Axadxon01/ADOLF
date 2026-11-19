import streamlit as st

import ai_core


def dev_interface():
    st.subheader("Kod Yordamchi")
    st.caption("Kod xavfsizlik uchun serverda ishga tushirilmaydi — faqat yozishda yordam beradi.")
    task = st.text_area("Nima yozish kerak?", max_chars=ai_core.MAX_INPUT_CHARS)
    if st.button("Yordam so'rash") and task.strip():
        try:
            st.markdown(ai_core.code_help(task))
        except ai_core.AIConfigError as exc:
            st.error(f"❌ {exc}")
        except Exception:
            st.error("❌ AI xizmati vaqtincha ishlamayapti.")
