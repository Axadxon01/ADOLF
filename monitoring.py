import streamlit as st
import cv2
import numpy as np
from database import save_user_data, get_user_data
import pickle
import os

# Yuz tanish uchun model (misol sifatida LBPH)
def train_face_recognizer(user_id):
    if not os.path.exists("models/face_model.pkl"):
        recognizer = cv2.face.LBPHFaceRecognizer_create()
        faces = []  # Bu yerda foydalanuvchi yuzlari yuklanadi (masalan, rasmlar bazasidan)
        labels = []
        recognizer.train(faces, np.array(labels))
        recognizer.save("models/face_model.pkl")
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read("models/face_model.pkl")
    return recognizer

def monitoring_interface():
    st.subheader("Real Vaqt Monitoringi")
    user_id = st.session_state.user_id
    
    if st.button("Kamerani yoqish"):
        cap = cv2.VideoCapture(0)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        recognizer = train_face_recognizer(user_id)
        stframe = st.empty()
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            
            for (x, y, w, h) in faces:
                face_roi = gray[y:y+h, x:x+w]
                label, confidence = recognizer.predict(face_roi)
                if confidence < 50:  # Agar tanish bo‘lsa
                    st.write(f"Tanish yuz: Foydalanuvchi {label}")
                else:
                    st.write("Noma’lum shaxs aniqlandi - Qonunbuzarlik ehtimoli!")
                    save_user_data(user_id, {"alert": "Noma’lum shaxs", "time": str(time.ctime())})
                cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            
            stframe.image(frame, channels="BGR")
            if st.button("To‘xtatish", key="stop"):
                cap.release()
                break