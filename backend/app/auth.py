import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from .database import get_db
from .models import User

hasher = PasswordHash.recommended()
bearer = HTTPBearer()

def secret():
    value = os.getenv("JWT_SECRET")
    if not value or len(value) < 32:
        raise RuntimeError("Set JWT_SECRET to at least 32 random characters")
    return value

def token_for(user: User):
    return jwt.encode({"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(hours=12)}, secret(), algorithm="HS256")

def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(credentials.credentials, secret(), algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        user = None
    if not user:
        raise HTTPException(401, "Invalid or expired session")
    return user

def student(user: User = Depends(current_user)):
    if user.role != "STUDENT":
        raise HTTPException(403, "Student access required")
    return user

def admin(user: User = Depends(current_user)):
    if user.role != "ADMIN":
        raise HTTPException(403, "Admin access required")
    return user
