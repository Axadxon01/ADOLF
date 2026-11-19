"""Kirish xavfsizligi: kirish kodi + imzolangan sessiya tokeni.

Eski versiyadagi kamchiliklar:
- OTP ekranda ko'rsatilardi va hech qachon mos kelmasdi;
- Face ID kadrda istalgan yuz bo'lsa kirishga ruxsat berardi;
- `random` kriptografik jihatdan xavfsiz emas edi.

Endi kirish `ADOLF_ACCESS_CODE` muhit o'zgaruvchisi orqali, token esa
`ADOLF_SECRET` bilan HMAC-SHA256 yordamida imzolanadi.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

TOKEN_TTL_SECONDS = 12 * 60 * 60
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 5 * 60

_fallback_secret = secrets.token_hex(32)
_failures: dict = {}
_lock = threading.Lock()


def _secret() -> bytes:
    return (os.environ.get("ADOLF_SECRET") or _fallback_secret).encode()


def access_configured() -> bool:
    return bool(os.environ.get("ADOLF_ACCESS_CODE"))


def check_access_code(code: str, client_key: str = "local") -> bool:
    """Kirish kodini doimiy vaqtda solishtiradi va ketma-ket xatolarni cheklaydi."""
    expected = os.environ.get("ADOLF_ACCESS_CODE", "")
    now = time.time()
    with _lock:
        count, locked_until = _failures.get(client_key, (0, 0.0))
        if locked_until > now:
            return False
    ok = bool(expected) and hmac.compare_digest(
        hashlib.sha256((code or "").encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )
    with _lock:
        if ok:
            _failures.pop(client_key, None)
        else:
            count += 1
            locked = now + LOCKOUT_SECONDS if count >= MAX_FAILED_ATTEMPTS else 0.0
            _failures[client_key] = (0 if locked else count, locked)
    return ok


def is_locked(client_key: str = "local") -> bool:
    with _lock:
        return _failures.get(client_key, (0, 0.0))[1] > time.time()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: str = "owner", ttl: int = TOKEN_TTL_SECONDS) -> str:
    payload = _b64(json.dumps({"sub": user_id, "exp": int(time.time()) + ttl}).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str):
    """Token to'g'ri va muddati o'tmagan bo'lsa user_id, aks holda None."""
    try:
        payload, sig = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            return None
        return data["sub"]
    except Exception:
        return None
