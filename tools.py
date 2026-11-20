"""ADOLF asboblari: ob-havo, xavfsiz hisob-kitob va vaqt. Hammasi serverda bajariladi."""
import ast
import json
import operator
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

GEOCODE_URL = os.environ.get("GEOCODE_URL", "https://geocoding-api.open-meteo.com/v1/search")
FORECAST_URL = os.environ.get("FORECAST_URL", "https://api.open-meteo.com/v1/forecast")
DEFAULT_CITY = "Toshkent"
DEFAULT_COORDS = (41.2995, 69.2401, "Toshkent")
CACHE_SECONDS = 600

_cache: dict = {}
_cache_lock = threading.Lock()

WEATHER_CODES = {
    0: "ochiq osmon", 1: "asosan ochiq", 2: "qisman bulutli", 3: "bulutli",
    45: "tuman", 48: "qirovli tuman",
    51: "yengil shivalab yomg'ir", 53: "shivalab yomg'ir", 55: "kuchli shivalab yomg'ir",
    56: "muzlovchi shivalash", 57: "muzlovchi shivalash",
    61: "yengil yomg'ir", 63: "yomg'ir", 65: "kuchli yomg'ir", 66: "muzlovchi yomg'ir", 67: "muzlovchi yomg'ir",
    71: "yengil qor", 73: "qor", 75: "kuchli qor", 77: "qor donalari",
    80: "yengil jala", 81: "jala", 82: "kuchli jala", 85: "qor jala", 86: "kuchli qor jala",
    95: "momaqaldiroq", 96: "do'l bilan momaqaldiroq", 99: "kuchli do'l bilan momaqaldiroq",
}


class ToolError(Exception):
    """Foydalanuvchiga ko'rsatsa bo'ladigan asbob xatosi."""


def _fetch_json(url: str, params: dict, timeout: float = 8.0) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full, headers={"User-Agent": "ADOLF/5.3"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - faqat sozlangan https manzillar
        return json.loads(resp.read().decode("utf-8"))


_ALIASES = {
    "toshkent": "Tashkent", "samarqand": "Samarkand", "buxoro": "Bukhara", "xiva": "Khiva", "andijon": "Andijan",
    "farg'ona": "Fergana", "qarshi": "Karshi", "termiz": "Termez", "urganch": "Urgench", "qo'qon": "Kokand",
    "marg'ilon": "Margilan", "navoiy": "Navoi", "jizzax": "Jizzakh", "guliston": "Gulistan", "shahrisabz": "Shakhrisabz",
    "moskva": "Moscow", "parij": "Paris", "dubay": "Dubai", "pekin": "Beijing", "tokio": "Tokyo", "seul": "Seoul",
    "rim": "Rome", "vashington": "Washington", "nyu-york": "New York", "olmaota": "Almaty", "istanbul": "Istanbul",
}


def _geocode(city: str):
    names = [city]
    alias = _ALIASES.get(city.lower())
    if alias:
        names.append(alias)
    for name in names:
        data = _fetch_json(GEOCODE_URL, {"name": name, "count": 1, "language": "en", "format": "json"})
        results = data.get("results") or []
        if results:
            r = results[0]
            return float(r["latitude"]), float(r["longitude"]), r.get("name") or city
    raise ToolError(f"«{city}» shahri topilmadi.")


def get_weather(city: str = "") -> dict:
    """Hozirgi ob-havo (Open-Meteo, kalitsiz). 10 daqiqa keshlanadi."""
    city = (city or "").strip()[:60]
    key = city.lower() or DEFAULT_CITY.lower()
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    try:
        lat, lon, name = _geocode(city) if city and city.lower() != DEFAULT_CITY.lower() else DEFAULT_COORDS
        data = _fetch_json(
            FORECAST_URL,
            {
                "latitude": lat, "longitude": lon, "timezone": "auto",
                "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
            },
        )
        cur = data["current"]
        result = {
            "city": name,
            "temp": round(cur["temperature_2m"]),
            "feels": round(cur["apparent_temperature"]),
            "humidity": round(cur["relative_humidity_2m"]),
            "wind": round(cur["wind_speed_10m"] / 3.6, 1),  # km/soat -> m/s
            "code": int(cur["weather_code"]),
            "description": WEATHER_CODES.get(int(cur["weather_code"]), "noma'lum"),
            "is_day": bool(cur.get("is_day", 1)),
        }
    except ToolError:
        raise
    except Exception as exc:
        raise ToolError("Ob-havo xizmatiga ulanib bo'lmadi.") from exc
    with _cache_lock:
        _cache[key] = (now + CACHE_SECONDS, result)
    return result


# ---------- xavfsiz kalkulyator ----------
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow}
_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _eval(node):
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and (abs(right) > 100 or abs(left) > 1e6):
            raise ToolError("Daraja juda katta.")
        return _BIN[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_eval(node.operand))
    raise ToolError("Faqat oddiy arifmetik ifodalar qo'llab-quvvatlanadi.")


def calculate(expression: str) -> str:
    expr = (expression or "").strip().replace("^", "**").replace("×", "*").replace("÷", "/").replace(",", ".")
    if not expr or len(expr) > 200:
        raise ToolError("Ifoda bo'sh yoki juda uzun.")
    try:
        value = _eval(ast.parse(expr, mode="eval"))
    except ZeroDivisionError:
        raise ToolError("Nolga bo'lib bo'lmaydi.")
    except (SyntaxError, RecursionError, OverflowError):
        raise ToolError("Ifodani tushunib bo'lmadi.")
    if isinstance(value, float):
        value = round(value, 10)
        if value == int(value) and abs(value) < 1e15:
            value = int(value)
    return str(value)


def now_info(tz: str = "") -> dict:
    try:
        zone = ZoneInfo(tz) if tz else ZoneInfo("Asia/Tashkent")
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("Asia/Tashkent")
    d = datetime.now(zone)
    return {"time": d.strftime("%H:%M"), "date": d.strftime("%Y-%m-%d"), "weekday_index": d.weekday(), "timezone": str(zone)}
