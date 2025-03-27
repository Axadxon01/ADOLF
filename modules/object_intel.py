import streamlit as st
import cv2
import numpy as np

def object_interface():
    st.subheader("Obyekt Tanish")
    uploaded_image = st.file_uploader("Rasm yuklang", type=["jpg", "png"])
    if uploaded_image:
        image = cv2.imdecode(np.frombuffer(uploaded_image.read(), np.uint8), 1)
        st.image(image, channels="BGR")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 100, 200)
        st.image(edges, caption="Obyekt chegaralari")