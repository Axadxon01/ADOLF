"""ADOLF FastAPI serveri (tuzatilgan versiya)."""
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

import ai_core
import security

logger = logging.getLogger("adolf.server")
app = FastAPI(title="ADOLF API")


class LoginRequest(BaseModel):
    code: str = Field(max_length=200)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=ai_core.MAX_INPUT_CHARS)


def current_user(authorization: str = Header(default="")) -> str:
    scheme, _, token = authorization.partition(" ")
    user = security.verify_token(token) if scheme.lower() == "bearer" else None
    if not user:
        raise HTTPException(status_code=401, detail="Autentifikatsiya talab qilinadi")
    return user


@app.get("/health")
async def health():
    return {"status": "ok", "login_configured": security.access_configured()}


@app.post("/api/login")
async def login(body: LoginRequest, request: Request):
    if not security.access_configured():
        raise HTTPException(status_code=503, detail="ADOLF_ACCESS_CODE sozlanmagan")
    client = request.client.host if request.client else "unknown"
    if security.is_locked(client):
        raise HTTPException(status_code=429, detail="Juda ko'p urinish. Keyinroq urinib ko'ring")
    if not security.check_access_code(body.code, client):
        raise HTTPException(status_code=401, detail="Noto'g'ri kod")
    return {"token": security.create_token("owner")}


@app.post("/api/chat")
async def chat(body: ChatRequest, user: str = Depends(current_user)):
    try:
        return {"response": ai_core.chat(user, body.message)}
    except ai_core.AIConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("AI xatosi")
        raise HTTPException(status_code=502, detail="AI xizmati vaqtincha ishlamayapti")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
