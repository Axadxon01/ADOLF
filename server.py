"""ADOLF serveri: REST API + HUD interfeysi (web/public) bitta FastAPI ilovada."""
import base64
import binascii
import logging
import re
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import ai_core
import security
import tools

logger = logging.getLogger("adolf.server")
app = FastAPI(title="ADOLF", docs_url=None, redoc_url=None, openapi_url=None)

WEB_DIR = Path(__file__).parent / "web" / "public"
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
    "media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; "
    "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "microphone=(self), camera=(self), geolocation=()",
}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# ---- oddiy tezlik cheklovi (bitta jarayon ichida) ----
_hits: dict = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limit(limit: int = 30, window: int = 60):
    def dep(request: Request):
        who = request.client.host if request.client else "unknown"
        now = time.time()
        with _hits_lock:
            q = _hits[who]
            while q and q[0] < now - window:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(status_code=429, detail="Juda ko'p so'rov. Biroz kuting.")
            q.append(now)

    return dep


def current_user(authorization: str = Header(default="")) -> str:
    scheme, _, token = authorization.partition(" ")
    user = security.verify_token(token) if scheme.lower() == "bearer" else None
    if not user:
        raise HTTPException(status_code=401, detail="Kirish talab qilinadi.")
    return user


def ai_call(fn, *args):
    try:
        return fn(*args)
    except ai_core.AIConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("AI xatosi")
        raise HTTPException(status_code=502, detail=ai_core.user_message(exc))


# ---- so'rov modellari ----
class LoginRequest(BaseModel):
    code: str = Field(max_length=200)


class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=ai_core.MAX_INPUT_CHARS)


class ChatRequest(BaseModel):
    message: Optional[str] = Field(default=None, min_length=1, max_length=ai_core.MAX_INPUT_CHARS)
    messages: Optional[List[Msg]] = Field(default=None, max_length=20)
    memory: Optional[List[str]] = Field(default=None, max_length=20)
    tz: Optional[str] = Field(default=None, max_length=64)


class ToolRequest(BaseModel):
    action: Literal["translate", "summarize", "sentiment", "code"]
    text: str = Field(min_length=1, max_length=6000)
    target: Optional[str] = None


class VisionRequest(BaseModel):
    image: str = Field(max_length=4_000_000)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1500)


# ---- yo'llar ----
@app.get("/health")
def health():
    return {"status": "ok", "login_configured": security.access_configured()}


@app.post("/api/login")
def login(body: LoginRequest, request: Request):
    if not security.access_configured():
        raise HTTPException(status_code=503, detail="Server sozlanmagan: ADOLF_ACCESS_CODE kerak.")
    client = request.client.host if request.client else "unknown"
    if security.is_locked(client):
        raise HTTPException(status_code=429, detail="Juda ko'p urinish. Keyinroq urinib ko'ring.")
    if not security.check_access_code(body.code, client):
        raise HTTPException(status_code=401, detail="Noto'g'ri kod.")
    return {"token": security.create_token("owner")}


@app.post("/api/chat", dependencies=[Depends(rate_limit())])
def chat(body: ChatRequest, user: str = Depends(current_user)):
    if body.messages:
        if body.messages[-1].role != "user" or not body.messages[-1].content.strip():
            raise HTTPException(status_code=400, detail="Oxirgi xabar foydalanuvchidan bo'lishi kerak.")
        memory = [m[:200] for m in (body.memory or [])]
        result = ai_call(ai_core.agent_chat, [m.model_dump() for m in body.messages], memory, body.tz or "")
        return {"reply": result["reply"], "actions": result["actions"], "response": result["reply"]}
    if body.message:
        reply = ai_call(ai_core.chat, user, body.message)
        return {"reply": reply, "actions": [], "response": reply}
    raise HTTPException(status_code=422, detail="message yoki messages kerak.")


@app.post("/api/tools", dependencies=[Depends(rate_limit())])
def run_tool(body: ToolRequest, user: str = Depends(current_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Matn bo'sh.")
    if body.action == "translate":
        lang = ai_core.LANG_NAMES.get(body.target or "")
        if not lang:
            raise HTTPException(status_code=400, detail="Noma'lum til.")
        return {"result": ai_call(ai_core.translate, text, lang)}
    if body.action == "summarize":
        return {"result": ai_call(ai_core.summarize, text)}
    if body.action == "sentiment":
        return {"result": ai_call(ai_core.sentiment, text)}
    return {"result": ai_call(ai_core.code_help, text)}


_IMAGE_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$")


@app.post("/api/vision", dependencies=[Depends(rate_limit(10))])
def vision(body: VisionRequest, user: str = Depends(current_user)):
    m = _IMAGE_RE.match(body.image)
    if not m:
        raise HTTPException(status_code=400, detail="Faqat JPEG, PNG yoki WebP rasm qabul qilinadi.")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Rasm buzilgan.")
    return {"result": ai_call(ai_core.describe_image, raw, m.group(1))}


@app.get("/api/weather", dependencies=[Depends(rate_limit(20))])
def weather(city: str = "", user: str = Depends(current_user)):
    try:
        return tools.get_weather(city)
    except tools.ToolError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/speak", dependencies=[Depends(rate_limit())])
def speak(body: SpeakRequest, user: str = Depends(current_user)):
    audio = ai_call(ai_core.speak, body.text)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
