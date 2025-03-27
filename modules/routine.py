import streamlit as st
from datetime import datetime
from database import save_user_data, get_user_data

def routine_interface():
    st.subheader("Kundalik Reja")
    user_id = st.session_state.user_id
    task = st.text_input("Vazifa qo‘shing:")
    if st.button("Saqlash"):
        user_data = get_user_data(user_id) or {"tasks": []}
        user_data["tasks"].append({"task": task, "time": datetime.now().strftime("%H:%M")})
        save_user_data(user_id, user_data)
    user_data = get_user_data(user_id)
    if user_data and "tasks" in user_data:
        for i, t in enumerate(user_data["tasks"]):
            st.write(f"{i+1}. {t['task']} - {t['time']}")