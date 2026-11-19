from datetime import datetime

import streamlit as st

from database import get_user_data, update_user_data


def routine_interface():
    st.subheader("Kundalik Reja")
    user_id = st.session_state.user_id
    tasks = get_user_data(user_id).get("tasks", [])
    with st.form("add_task", clear_on_submit=True):
        task = st.text_input("Vazifa qo'shing:", max_chars=200)
        if st.form_submit_button("Saqlash") and task.strip():
            tasks.append({"task": task.strip(), "time": datetime.now().strftime("%H:%M"), "done": False})
            update_user_data(user_id, tasks=tasks)
            st.rerun()
    for i, t in enumerate(tasks):
        cols = st.columns([6, 1])
        done = cols[0].checkbox(f"{t['task']} — {t['time']}", value=t.get("done", False), key=f"t{i}")
        if done != t.get("done", False):
            tasks[i]["done"] = done
            update_user_data(user_id, tasks=tasks)
        if cols[1].button("🗑", key=f"d{i}"):
            update_user_data(user_id, tasks=tasks[:i] + tasks[i + 1:])
            st.rerun()
