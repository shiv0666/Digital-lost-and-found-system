from datetime import date as DateValue, datetime, timezone
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="STUDENT")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    items: Mapped[list["Item"]] = relationship(back_populates="reporter")
    claims: Mapped[list["Claim"]] = relationship(back_populates="student")
    __table_args__ = (CheckConstraint("role IN ('STUDENT','ADMIN')"),)

class Item(Base):
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    additional_details: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80))
    location: Mapped[str] = mapped_column(String(160))
    date: Mapped[DateValue] = mapped_column(Date)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    type: Mapped[str] = mapped_column(String(5))
    status: Mapped[str] = mapped_column(String(10), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    reporter: Mapped[User] = relationship(back_populates="items")
    claims: Mapped[list["Claim"]] = relationship(back_populates="item", cascade="all, delete-orphan")
    __table_args__ = (CheckConstraint("type IN ('LOST','FOUND')"), CheckConstraint("status IN ('PENDING','APPROVED','REJECTED','CLAIMED','RETURNED','CLOSED')"))

class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    proof_text: Mapped[str] = mapped_column(Text)
    identifying_details: Mapped[str] = mapped_column(Text)
    contents_details: Mapped[str] = mapped_column(Text, default="")
    additional_proof: Mapped[str] = mapped_column(Text, default="")
    proof_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="PENDING")
    admin_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    student: Mapped[User] = relationship(back_populates="claims")
    item: Mapped[Item] = relationship(back_populates="claims")
    __table_args__ = (UniqueConstraint("item_id", "student_id"), CheckConstraint("status IN ('PENDING','APPROVED','REJECTED')"))
