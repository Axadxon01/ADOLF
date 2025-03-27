import random
import time
import logging
import requests
from database import get_user_data, save_user_data

# Log fayl sozlamasi
logging.basicConfig(filename="security.log", level=logging.INFO)

# 🔐 OTP generatsiya qilish
def generate_otp():
    return str(random.randint(100000, 999999))

# 🌍 IP manzil va joylashuvni olish
def get_ip_location():
    try:
        response = requests.get("http://ip-api.com/json/")
        data = response.json()
        return f"IP: {data['query']}, Joylashuv: {data['city']}, {data['country']}"
    except:
        return "IP aniqlanmadi"

# ✅ OTP kodni tekshirish
def check_security(otp_input):
    user_id = "user_" + str(hash(time.time()))[-8:]  # Demo maqsadida
    user_data = get_user_data(user_id)
    if user_data and "otp" in user_data and user_data["otp"] == otp_input:
        ip_info = get_ip_location()
        logging.info(f"✅ Muvaffaqiyatli kirish: {time.ctime()} - {ip_info}")
        user_data["ip_log"] = ip_info
        save_user_data(user_id, user_data)
        return True
    logging.warning(f"❌ Xato OTP ({otp_input}) - {time.ctime()} - {get_ip_location()}")
    return False

# 🤖 Face ID tekshiruvi (faqat lokalda)
def face_id_check():
    try:
        import cv2
    except ImportError:
        logging.error("❌ OpenCV mavjud emas. Face ID tekshiruvi bajarilmadi.")
        return False

    try:
        cap = cv2.VideoCapture(0)
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

        timeout = time.time() + 5  # Maksimum 5 soniya kutadi
        while time.time() < timeout:
            ret, frame = cap.read()
            if not ret:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            if len(faces) > 0:
                cap.release()
                ip_info = get_ip_location()
                logging.info(f"✅ Face ID tasdiqlandi: {time.ctime()} - {ip_info}")
                return True
        cap.release()
        logging.warning("❌ Yuz aniqlanmadi.")
        return False
    except Exception as e:
        logging.error(f"❌ Kamera xatosi: {str(e)}")
        return False
