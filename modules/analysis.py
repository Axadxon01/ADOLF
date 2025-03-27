import streamlit as st
from textblob import TextBlob

def analysis_interface():
    st.subheader("Tahlil va Etika")
    text = st.text_area("Matn kiriting:")
    if st.button("Tahlil qilish"):
        blob = TextBlob(text)
        sentiment = blob.sentiment.polarity
        st.write(f"Sentiment: {'Pozitiv' if sentiment > 0 else 'Negativ' if sentiment < 0 else 'Neytral'}")