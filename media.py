import streamlit as st
from googleapiclient.discovery import build
from config import YOUTUBE_API_KEY
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from config import SPOTIFY_CLIENT_ID, SPOTIFY_SECRET

def media_interface():
    st.subheader("Media Boshqaruvi")
    option = st.selectbox("Platforma tanlang", ["YouTube", "Spotify"])
    
    if option == "YouTube":
        youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        search_query = st.text_input("YouTube’da qidirish:")
        if st.button("Qidirish"):
            request = youtube.search().list(q=search_query, part="snippet", maxResults=5)
            response = request.execute()
            for item in response["items"]:
                st.write(item["snippet"]["title"])
    
    elif option == "Spotify":
        sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=SPOTIFY_CLIENT_ID, client_secret=SPOTIFY_SECRET))
        search_query = st.text_input("Spotify’da qidirish:")
        if st.button("Qidirish"):
            results = sp.search(q=search_query, limit=5)
            for track in results["tracks"]["items"]:
                st.write(track["name"])