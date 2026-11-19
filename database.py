"""Foydalanuvchi ma'lumotlari uchun xavfsiz SQLite qatlami (JSON asosida).

Eski versiyadagi `eval()` olib tashlandi: ma'lumotlar endi JSON ko'rinishida
saqlanadi va o'qiladi, shuning uchun bazadagi matn hech qachon kod sifatida
bajarilmaydi.
"""
import json
import os
import re
import sqlite3
import threading

_USER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_lock = threading.Lock()


def _db_path() -> str:
    return os.environ.get("ADOLF_DB", "adolf.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=10)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, data TEXT NOT NULL)"
    )
    return conn


def _check_user_id(user_id: str) -> str:
    if not isinstance(user_id, str) or not _USER_ID_RE.match(user_id):
        raise ValueError("Noto'g'ri user_id")
    return user_id


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.commit()


def get_user_data(user_id: str) -> dict:
    """Foydalanuvchi ma'lumotini qaytaradi. Topilmasa bo'sh lug'at."""
    _check_user_id(user_id)
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT data FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
        finally:
            conn.close()
    if not row:
        return {}
    try:
        data = json.loads(row[0])
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_user_data(user_id: str, data: dict) -> None:
    """Foydalanuvchi ma'lumotini to'liq almashtiradi."""
    _check_user_id(user_id)
    payload = json.dumps(data, ensure_ascii=False)
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO users (user_id, data) VALUES (?, ?)",
                (user_id, payload),
            )
            conn.commit()
        finally:
            conn.close()


def update_user_data(user_id: str, **changes) -> dict:
    """Mavjud ma'lumotni saqlab, faqat berilgan kalitlarni yangilaydi."""
    data = get_user_data(user_id)
    data.update(changes)
    save_user_data(user_id, data)
    return data
