"""
User authentication — hashed passwords + JWT sessions + Google OAuth.
Users stored in a local JSON file (swap for a DB later).
"""
import os
import json
import time
import secrets
import urllib.parse
import bcrypt
import jwt
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_DATA_FILE    = os.path.join(os.path.dirname(__file__), "users.json")
_SECRET_KEY   = os.environ.get("VELORA_SECRET", secrets.token_hex(32))
_ALGORITHM    = "HS256"
_TOKEN_TTL    = 60 * 60 * 24  # 24 hours

GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "http://localhost:3000")

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO  = "https://www.googleapis.com/oauth2/v3/userinfo"


# ---------------------------------------------------------------------------
# User store
# ---------------------------------------------------------------------------

def _load_users() -> dict:
    if not os.path.exists(_DATA_FILE):
        return {}
    with open(_DATA_FILE, "r") as f:
        return json.load(f)


def _save_users(users: dict):
    with open(_DATA_FILE, "w") as f:
        json.dump(users, f, indent=2)


def _issue_token(username: str, role: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + _TOKEN_TTL,
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm=_ALGORITHM)


# ---------------------------------------------------------------------------
# Password auth
# ---------------------------------------------------------------------------

def register(username: str, password: str) -> dict:
    if not username or not password:
        return {"ok": False, "error": "Username and password required"}
    if len(password) < 8:
        return {"ok": False, "error": "Password must be at least 8 characters"}

    users = _load_users()
    if username in users:
        return {"ok": False, "error": "Username already taken"}

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    users[username] = {
        "password_hash": hashed,
        "created_at": time.time(),
        "role": "user",
        "provider": "password",
    }
    _save_users(users)
    return {"ok": True}


def login(username: str, password: str) -> dict:
    users = _load_users()
    user = users.get(username)
    if not user:
        return {"ok": False, "error": "Invalid credentials"}
    if user.get("provider") == "google":
        return {"ok": False, "error": "This account uses Google sign-in"}
    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return {"ok": False, "error": "Invalid credentials"}

    token = _issue_token(username, user.get("role", "user"))
    return {"ok": True, "token": token, "username": username, "role": user.get("role", "user")}


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

def google_auth_url(state: str = "") -> str:
    """Build the Google consent screen URL."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
        "state":         state or secrets.token_urlsafe(16),
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


def google_exchange_code(code: str) -> dict:
    """
    Exchange the authorization code for tokens, fetch user info,
    create/find the user, and return a Velora JWT.
    Returns {ok, token, username, role, error?}
    """
    # 1. Exchange code for access token
    token_resp = requests.post(GOOGLE_TOKEN_URL, data={
        "code":          code,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "grant_type":    "authorization_code",
    }, timeout=10)

    if not token_resp.ok:
        return {"ok": False, "error": f"Token exchange failed: {token_resp.text}"}

    access_token = token_resp.json().get("access_token")
    if not access_token:
        return {"ok": False, "error": "No access token returned"}

    # 2. Fetch user info from Google
    info_resp = requests.get(GOOGLE_USERINFO,
                             headers={"Authorization": f"Bearer {access_token}"},
                             timeout=10)
    if not info_resp.ok:
        return {"ok": False, "error": "Failed to fetch Google user info"}

    guser = info_resp.json()
    email   = guser.get("email", "")
    name    = guser.get("name", email.split("@")[0])
    picture = guser.get("picture", "")
    sub     = guser.get("sub", "")  # stable Google user ID

    if not email:
        return {"ok": False, "error": "Google did not return an email address"}

    # 3. Find or create user — keyed by google:{sub}
    user_key = f"google:{sub}"
    users = _load_users()

    if user_key not in users:
        users[user_key] = {
            "email":      email,
            "name":       name,
            "picture":    picture,
            "created_at": time.time(),
            "role":       "user",
            "provider":   "google",
        }
        _save_users(users)

    user = users[user_key]
    token = _issue_token(user_key, user.get("role", "user"))

    return {
        "ok":       True,
        "token":    token,
        "username": name,
        "email":    email,
        "picture":  picture,
        "role":     user.get("role", "user"),
    }


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_user_from_request(request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth[len("Bearer "):])


def require_auth(request) -> tuple[Optional[dict], Optional[object]]:
    from starlette.responses import JSONResponse
    user = get_user_from_request(request)
    if not user:
        return None, JSONResponse({"error": "Unauthorized"}, status_code=401)
    return user, None
