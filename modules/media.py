import urllib.parse

import streamlit as st


def media_interface():
    st.subheader("🎵 Media Qidiruv")
    option = st.selectbox("Platforma tanlang", ["YouTube", "Spotify"])
    query = st.text_input("Qidiruv so'rovi:", max_chars=200)
    if query.strip():
        q = urllib.parse.quote_plus(query.strip())
        url = (
            f"https://www.youtube.com/results?search_query={q}"
            if option == "YouTube"
            else f"https://open.spotify.com/search/{q}"
        )
        # Ikkala sayt ham iframe ichida ochilishni bloklaydi, shuning uchun havola beriladi.
        st.link_button(f"🔎 {option}'da natijalarni ochish", url)
