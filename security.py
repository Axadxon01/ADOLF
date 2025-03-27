import random
import time
import logging
import cv2
import requests
from database import get_user_data, save_user_data

logging.basicConfig(filename="security.log", level=logging.INFO)

def generate_otp():
    return str(random.randint(100000, 999999))

def get_ip_location():
    try:
        response = requests.get("http://ip-api.com/json/")
        data = response.json()
        return f"IP: {data['query']}, Joylashuv: {data['city']}, {data['country']}"
    except:
        return "IP aniqlanmadi"

def check_security(otp_input):
    user_id = "user_" + str(hash(time.time()))[-8:]  # Misol uchun
    user_data = get_user_data(user_id)
    if user_data and "otp" in user_data and user_data["otp"] == otp_input:
        ip_info = get_ip_location()
        logging.info(f"Successful login at {time.ctime()} - {ip_info}")
        user_data["ip_log"] = ip_info
        save_user_data(user_id, user_data)
        return True
    logging.warning(f"Failed login attempt with OTP {otp_input} at {time.ctime()} - {get_ip_location()}")
    return False

def face_id_check():
    cap = cv2.VideoCapture(0)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        if len(faces) > 0:
            cap.release()
            ip_info = get_ip_location()
            logging.info(f"Face ID verified at {time.ctime()} - {ip_info}")
            return True
    cap.release()
    return False