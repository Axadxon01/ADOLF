import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("ADOLF_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("ADOLF_ACCESS_CODE", "sir-kod-123")
    monkeypatch.setenv("ADOLF_SECRET", "test-secret")
    import security
    security._failures.clear()


def test_database_roundtrip_and_no_eval():
    import database
    assert database.get_user_data("u1") == {}
    database.save_user_data("u1", {"tasks": [{"task": "a"}]})
    database.update_user_data("u1", history=[1])
    assert database.get_user_data("u1") == {"tasks": [{"task": "a"}], "history": [1]}
    # eski eval() zaifligi: zararli matn kod sifatida bajarilmasligi kerak
    conn = database._connect()
    conn.execute("UPDATE users SET data = ? WHERE user_id = 'u1'", ("__import__('os').system('echo hacked')",))
    conn.commit(); conn.close()
    assert database.get_user_data("u1") == {}


def test_user_id_validation():
    import database
    with pytest.raises(ValueError):
        database.get_user_data("a'; DROP TABLE users;--")


def test_access_code_and_lockout():
    import security
    assert security.check_access_code("sir-kod-123", "ip1")
    for _ in range(security.MAX_FAILED_ATTEMPTS):
        assert not security.check_access_code("x", "ip2")
    assert security.is_locked("ip2")
    assert not security.check_access_code("sir-kod-123", "ip2")  # qulf paytida to'g'ri kod ham o'tmaydi


def test_access_code_not_configured(monkeypatch):
    import security
    monkeypatch.delenv("ADOLF_ACCESS_CODE")
    assert not security.access_configured()
    assert not security.check_access_code("", "ip3")


def test_token_valid_tampered_expired():
    import security
    t = security.create_token("owner")
    assert security.verify_token(t) == "owner"
    assert security.verify_token(t[:-2] + "xx") is None
    assert security.verify_token("garbage") is None
    assert security.verify_token(security.create_token("owner", ttl=-1)) is None


def test_ai_core_chat_memory(monkeypatch):
    import ai_core, database
    calls = []
    monkeypatch.setattr(ai_core, "complete", lambda m, max_tokens=600: calls.append(m) or "javob")
    assert ai_core.chat("owner", "salom") == "javob"
    assert ai_core.chat("owner", "yana") == "javob"
    assert len(calls[1]) == 4  # system + oldingi 2 xabar + yangi savol
    assert len(database.get_user_data("owner")["history"]) == 4
    ai_core.clear_history("owner")
    assert database.get_user_data("owner")["history"] == []


def test_missing_api_key(monkeypatch):
    import ai_core
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ai_core.AIConfigError):
        ai_core.get_ai_response("salom")


def test_sentiment_parsing(monkeypatch):
    import ai_core
    monkeypatch.setattr(ai_core, "complete", lambda m, max_tokens=600: 'Mana: {"label": "pozitiv", "score": 0.8, "izoh": "yaxshi"}')
    assert ai_core.sentiment("zo'r")["label"] == "pozitiv"
    monkeypatch.setattr(ai_core, "complete", lambda m, max_tokens=600: "tushunarsiz")
    assert ai_core.sentiment("x")["label"] == "noma'lum"


def test_server_flow(monkeypatch):
    from fastapi.testclient import TestClient
    import ai_core, server
    monkeypatch.setattr(ai_core, "complete", lambda m, max_tokens=600: "AI javobi")
    c = TestClient(server.app)
    assert c.get("/health").json()["login_configured"] is True
    assert c.post("/api/chat", json={"message": "salom"}).status_code == 401
    assert c.post("/api/login", json={"code": "noto'g'ri"}).status_code == 401
    token = c.post("/api/login", json={"code": "sir-kod-123"}).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert c.post("/api/chat", json={"message": "salom"}, headers=h).json() == {"response": "AI javobi"}
    assert c.post("/api/chat", json={"message": ""}, headers=h).status_code == 422
    assert c.post("/api/chat", json={"message": "x" * 5000}, headers=h).status_code == 422
    assert c.post("/api/chat", json={"message": "a"}, headers={"Authorization": "Bearer yolgon"}).status_code == 401


def test_server_login_lockout():
    from fastapi.testclient import TestClient
    import server
    c = TestClient(server.app)
    codes = [c.post("/api/login", json={"code": "x"}).status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[-1] == 429


def test_streamlit_app_login_gate():
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(os.path.join(os.path.dirname(__file__), "..", "main.py"), default_timeout=30).run()
    assert not at.exception
    assert at.text_input[0].label == "Kirish kodi"
    at.text_input[0].set_value("noto'g'ri"); at.button[0].click(); at.run()
    assert any("Noto'g'ri" in e.value for e in at.error)
    at.text_input[0].set_value("sir-kod-123"); at.button[0].click(); at.run()
    assert not at.exception
    assert at.sidebar.selectbox[0].options[0] == "AI Chat"
    for page in at.sidebar.selectbox[0].options:
        at.sidebar.selectbox[0].select(page).run()
        assert not at.exception, page
