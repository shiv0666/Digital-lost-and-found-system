import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .auth import admin, current_user, hasher, student, token_for
from .database import Base, engine, get_db
from .models import Claim, Item, User
from .migrations import migrate_private_items
from .schemas import AdminItemIn, AdminItemOut, AdminPrivacyIn, AdminPrivateClaimIn, ClaimIn, ClaimOut, Decision, ItemIn, ItemOut, LoginIn, RegisterIn, StatusIn, UserOut

UPLOADS = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS.mkdir(exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    migrate_private_items(engine)
    yield

app = FastAPI(title="Campus Lost & Found API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")

def item_or_404(db, item_id):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    return item

def claim_or_404(db, claim_id):
    claim = db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    return claim

@app.post("/auth/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    user = User(name=data.name.strip(), email=data.email.lower(), password_hash=hasher.hash(data.password), role="STUDENT")
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already registered")
    db.refresh(user)
    return user

@app.post("/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not hasher.verify(data.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": token_for(user), "token_type": "bearer", "user": UserOut.model_validate(user)}

@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user

@app.post("/uploads")
async def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Upload a JPG, PNG, or WebP image")
    path = UPLOADS / f"{uuid.uuid4().hex}{allowed[file.content_type]}"
    size = 0
    with path.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > 5 * 1024 * 1024:
                path.unlink(missing_ok=True)
                raise HTTPException(413, "Image must be 5 MB or smaller")
            output.write(chunk)
    return {"url": f"/uploads/{path.name}"}

@app.get("/items", response_model=list[ItemOut])
def items(q: str = "", type: str = "", category: str = "", location: str = "", sort: str = "newest", db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Item).where(Item.status == "APPROVED", Item.visibility == "PUBLIC")
    if q:
        query = query.where(or_(Item.title.ilike(f"%{q}%"), Item.description.ilike(f"%{q}%")))
    if type:
        query = query.where(Item.type == type.upper())
    if category:
        query = query.where(Item.category.ilike(f"%{category}%"))
    if location:
        query = query.where(Item.location.ilike(f"%{location}%"))
    return db.scalars(query.order_by(Item.date.asc() if sort == "oldest" else Item.date.desc(), Item.id.desc())).all()

@app.get("/items/my", response_model=list[ItemOut])
def my_items(db: Session = Depends(get_db), user: User = Depends(student)):
    return db.scalars(select(Item).where(Item.reported_by == user.id, Item.visibility == "PUBLIC").order_by(Item.created_at.desc())).all()

@app.get("/items/{item_id}", response_model=ItemOut)
def item_detail(item_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = item_or_404(db, item_id)
    if item.visibility == "PRIVATE" and user.role != "ADMIN":
        raise HTTPException(404, "Item not found")
    claimant = any(c.student_id == user.id for c in item.claims)
    if item.status != "APPROVED" and user.role != "ADMIN" and item.reported_by != user.id and not claimant:
        raise HTTPException(404, "Item not found")
    return item

@app.post("/items", response_model=ItemOut, status_code=201)
def create_item(data: ItemIn, db: Session = Depends(get_db), user: User = Depends(student)):
    if data.type not in {"LOST", "FOUND"}:
        raise HTTPException(422, "Type must be LOST or FOUND")
    item = Item(**data.model_dump(), reported_by=user.id, status="PENDING")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.put("/items/{item_id}", response_model=ItemOut)
def edit_item(item_id: int, data: ItemIn, db: Session = Depends(get_db), user: User = Depends(student)):
    item = item_or_404(db, item_id)
    if item.visibility == "PRIVATE":
        raise HTTPException(404, "Item not found")
    if item.reported_by != user.id or item.status not in {"PENDING", "REJECTED"}:
        raise HTTPException(403, "Only your pending or rejected report can be edited")
    if data.type not in {"LOST", "FOUND"}:
        raise HTTPException(422, "Type must be LOST or FOUND")
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    item.status = "PENDING"
    db.commit()
    return item

@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    item = item_or_404(db, item_id)
    if item.visibility == "PRIVATE" and user.role != "ADMIN":
        raise HTTPException(404, "Item not found")
    if user.role != "ADMIN" and (item.reported_by != user.id or item.status not in {"PENDING", "REJECTED"}):
        raise HTTPException(403, "Cannot delete this report")
    db.delete(item)
    db.commit()

@app.post("/claims", response_model=ClaimOut, status_code=201)
def create_claim(data: ClaimIn, db: Session = Depends(get_db), user: User = Depends(student)):
    item = item_or_404(db, data.item_id)
    if item.visibility == "PRIVATE":
        raise HTTPException(404, "Item not found")
    if item.status != "APPROVED":
        raise HTTPException(409, "Item is not available for claims")
    if item.reported_by == user.id:
        raise HTTPException(403, "You cannot claim your own report")
    claim = Claim(**data.model_dump(), student_id=user.id)
    db.add(claim)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You already claimed this item")
    db.refresh(claim)
    return claim

@app.get("/claims/my")
def my_claims(db: Session = Depends(get_db), user: User = Depends(student)):
    rows = db.scalars(select(Claim).where(Claim.student_id == user.id).order_by(Claim.created_at.desc())).all()
    return [{**ClaimOut.model_validate(c).model_dump(mode="json"), "item_title": c.item.title} for c in rows]

@app.get("/claims/{claim_id}", response_model=ClaimOut)
def claim_detail(claim_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    claim = claim_or_404(db, claim_id)
    if user.role != "ADMIN" and claim.student_id != user.id:
        raise HTTPException(403, "Cannot view this claim")
    return claim

@app.get("/admin/items", dependencies=[Depends(admin)])
def admin_items(q: str = "", db: Session = Depends(get_db)):
    query = select(Item)
    if q:
        query = query.where(or_(Item.title.ilike(f"%{q}%"), Item.description.ilike(f"%{q}%"), Item.location.ilike(f"%{q}%"), Item.verification_details.ilike(f"%{q}%")))
    rows = db.scalars(query.order_by(Item.created_at.desc())).all()
    return [{**AdminItemOut.model_validate(i).model_dump(mode="json"), "reporter_name": i.reporter.name} for i in rows]

@app.get("/admin/items/pending", dependencies=[Depends(admin)])
def pending_items(db: Session = Depends(get_db)):
    rows = db.scalars(select(Item).where(Item.status == "PENDING").order_by(Item.created_at)).all()
    return [{**AdminItemOut.model_validate(i).model_dump(mode="json"), "reporter_name": i.reporter.name} for i in rows]

@app.get("/admin/items/{item_id}", response_model=AdminItemOut)
def admin_item_detail(item_id: int, db: Session = Depends(get_db), user: User = Depends(admin)):
    return item_or_404(db, item_id)

@app.post("/admin/items", response_model=AdminItemOut, status_code=201)
def admin_create_item(data: AdminItemIn, db: Session = Depends(get_db), user: User = Depends(admin)):
    if data.type not in {"LOST", "FOUND"}:
        raise HTTPException(422, "Type must be LOST or FOUND")
    item = Item(**data.model_dump(), reported_by=user.id, status="APPROVED")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@app.put("/admin/items/{item_id}/privacy", response_model=AdminItemOut)
def update_item_privacy(item_id: int, data: AdminPrivacyIn, db: Session = Depends(get_db), user: User = Depends(admin)):
    item = item_or_404(db, item_id)
    item.visibility = data.visibility
    if data.verification_details is not None:
        item.verification_details = data.verification_details
    db.commit()
    return item

@app.post("/admin/items/{item_id}/private-claims", response_model=ClaimOut, status_code=201)
def admin_create_private_claim(item_id: int, data: AdminPrivateClaimIn, db: Session = Depends(get_db), user: User = Depends(admin)):
    item = item_or_404(db, item_id)
    claimant = db.get(User, data.student_id)
    if item.visibility != "PRIVATE" or item.status != "APPROVED":
        raise HTTPException(409, "Only approved private items can be privately verified")
    if not claimant or claimant.role != "STUDENT" or claimant.id == item.reported_by:
        raise HTTPException(422, "Choose an eligible student")
    claim = Claim(item_id=item.id, student_id=claimant.id, proof_text=data.proof_text,
                  identifying_details=data.identifying_details, contents_details=data.contents_details,
                  additional_proof=data.additional_proof)
    db.add(claim)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This student already has a claim for the item")
    db.refresh(claim)
    return claim

@app.put("/admin/items/{item_id}/approve", response_model=ItemOut)
def approve_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(admin)):
    item = item_or_404(db, item_id)
    if item.status != "PENDING":
        raise HTTPException(409, "Only pending items can be approved")
    item.status = "APPROVED"
    db.commit()
    return item

@app.put("/admin/items/{item_id}/reject", response_model=ItemOut)
def reject_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(admin)):
    item = item_or_404(db, item_id)
    if item.status != "PENDING":
        raise HTTPException(409, "Only pending items can be rejected")
    item.status = "REJECTED"
    db.commit()
    return item

@app.put("/admin/items/{item_id}/status", response_model=ItemOut)
def change_item_status(item_id: int, data: StatusIn, db: Session = Depends(get_db), user: User = Depends(admin)):
    item = item_or_404(db, item_id)
    allowed = {"CLAIMED": {"RETURNED", "CLOSED"}, "RETURNED": {"CLOSED"}, "APPROVED": {"CLOSED"}}
    if data.status not in allowed.get(item.status, set()):
        raise HTTPException(409, "Invalid item status transition")
    item.status = data.status
    db.commit()
    return item

@app.get("/admin/claims", dependencies=[Depends(admin)])
def admin_claims(db: Session = Depends(get_db)):
    rows = db.scalars(select(Claim).order_by(Claim.created_at.desc())).all()
    return [{**ClaimOut.model_validate(c).model_dump(mode="json"), "item_title": c.item.title, "student_name": c.student.name} for c in rows]

@app.get("/admin/claims/pending", dependencies=[Depends(admin)])
def pending_claims(db: Session = Depends(get_db)):
    rows = db.scalars(select(Claim).where(Claim.status == "PENDING").order_by(Claim.created_at)).all()
    return [{**ClaimOut.model_validate(c).model_dump(mode="json"), "item_title": c.item.title, "student_name": c.student.name} for c in rows]

@app.put("/admin/claims/{claim_id}/approve", response_model=ClaimOut)
def approve_claim(claim_id: int, data: Decision, db: Session = Depends(get_db), user: User = Depends(admin)):
    claim = claim_or_404(db, claim_id)
    item = db.scalar(select(Item).where(Item.id == claim.item_id).with_for_update())
    if claim.status != "PENDING" or item.status != "APPROVED":
        raise HTTPException(409, "Claim or item is no longer pending")
    claim.status = "APPROVED"
    claim.admin_comment = data.comment
    item.status = "CLAIMED"
    for other in item.claims:
        if other.id != claim.id and other.status == "PENDING":
            other.status = "REJECTED"
            other.admin_comment = "Another claim was approved for this item."
    db.commit()
    return claim

@app.put("/admin/claims/{claim_id}/reject", response_model=ClaimOut)
def reject_claim(claim_id: int, data: Decision, db: Session = Depends(get_db), user: User = Depends(admin)):
    claim = claim_or_404(db, claim_id)
    if claim.status != "PENDING":
        raise HTTPException(409, "Only pending claims can be rejected")
    claim.status = "REJECTED"
    claim.admin_comment = data.comment
    db.commit()
    return claim

@app.get("/admin/users", response_model=list[UserOut])
def users(db: Session = Depends(get_db), user: User = Depends(admin)):
    return db.scalars(select(User).order_by(User.created_at.desc())).all()

@app.delete("/admin/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(admin)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.role == "ADMIN" or target.items or target.claims:
        raise HTTPException(409, "Cannot delete an admin or a user with reports or claims")
    db.delete(target)
    db.commit()

@app.get("/admin/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(admin)):
    items = db.scalars(select(Item)).all()
    claims = db.scalars(select(Claim)).all()
    return {"total_items": len(items), "pending_items": sum(i.status == "PENDING" for i in items), "lost_items": sum(i.type == "LOST" for i in items), "found_items": sum(i.type == "FOUND" for i in items), "pending_claims": sum(c.status == "PENDING" for c in claims), "approved_claims": sum(c.status == "APPROVED" for c in claims), "returned_items": sum(i.status == "RETURNED" for i in items)}
