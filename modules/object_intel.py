import streamlit as st

def object_interface():
    st.subheader("🔍 Obyekt Tanish")

    try:
        import cv2
        import numpy as np
    except ImportError:
        st.warning("❌ OpenCV va NumPy mavjud emas.")
        return

    st.success("✅ OpenCV yuklandi!")
    st.info("Bu yerda obyektlarni aniqlash funksiyalari amalga oshiriladi.")

    # Test rasm
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    cv2.putText(img, "Obyekt", (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
    st.image(img, caption="📸 Demo rasm", channels="BGR")
