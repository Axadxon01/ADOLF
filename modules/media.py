import streamlit as st
import urllib.parse

def media_interface():
    st.subheader("🎵 Media Qidiruv (API’larsiz)")

    option = st.selectbox("Platforma tanlang", ["YouTube", "Spotify"])
    query = st.text_input("Qidiruv so‘rovi:")

    if query and st.button("Qidirish"):
        encoded_query = urllib.parse.quote_plus(query)

        if option == "YouTube":
            url = f"https://www.youtube.com/results?search_query={encoded_query}"
            st.markdown(f"[🔎 YouTube’da natijalarni ko‘rish]({url})", unsafe_allow_html=True)
            st.components.v1.iframe(url, height=400)

        elif option == "Spotify":
            url = f"https://open.spotify.com/search/{encoded_query}"
            st.markdown(f"[🔎 Spotify’da natijalarni ko‘rish]({url})", unsafe_allow_html=True)
            st.components.v1.iframe(url, height=400)

