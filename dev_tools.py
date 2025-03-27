import streamlit as st

def dev_interface():
    st.subheader("Dasturchi Vositalari")
    code_input = st.text_area("Kod kiriting (Python):")
    if st.button("Ishlatish"):
        try:
            exec(code_input)
            st.write("Kod muvaffaqiyatli ishlatildi!")
        except Exception as e:
            st.write(f"Xatolik: {e}")