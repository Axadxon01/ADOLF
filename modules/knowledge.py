import streamlit as st
from PyPDF2 import PdfReader
from googletrans import Translator

translator = Translator()

def knowledge_interface():
    st.subheader("Hujjatlar bilan Ishlash")
    uploaded_file = st.file_uploader("PDF yuklang", type="pdf")
    if uploaded_file:
        pdf = PdfReader(uploaded_file)
        text = pdf.pages[0].extract_text()
        st.write("Matn (birinchi sahifa):")
        st.write(text[:500])
        lang = st.selectbox("Tarjima tili", ["uz", "en", "ru"])
        if st.button("Tarjima qilish"):
            translated = translator.translate(text[:500], dest=lang).text
            st.write(f"Tarjima ({lang}): {translated}")