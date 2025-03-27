from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from database import save_user_data, get_user_data
from security import generate_otp
from modules.ai_core import get_gpt4_response

app = FastAPI()

class UserRequest(BaseModel):
    user_id: str
    command: str

@app.get("/generate_otp/{user_id}")
async def get_otp(user_id: str):
    otp = generate_otp()
    save_user_data(user_id, {"otp": otp, "login_time": str(time.ctime())})
    return {"otp": otp}

@app.post("/process_command")
async def process_command(request: UserRequest):
    user_data = get_user_data(request.user_id)
    if not user_data or "otp" not in user_data:
        raise HTTPException(status_code=401, detail="Autentifikatsiya talab qilinadi")
    response = get_gpt4_response(request.command)  # AI javob beradi
    return {"response": response}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)