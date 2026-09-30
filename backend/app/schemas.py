from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    role: str
    created_at: datetime

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ItemIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10)
    additional_details: str = ""
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=160)
    date: date
    type: str
    image_url: str | None = None

class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reported_by: int
    status: str
    visibility: Literal["PUBLIC", "PRIVATE"]
    created_at: datetime
    updated_at: datetime

class AdminItemIn(ItemIn):
    visibility: Literal["PUBLIC", "PRIVATE"] = "PUBLIC"
    verification_details: str = Field(default="", max_length=5000)

class AdminItemOut(ItemOut):
    verification_details: str

class AdminPrivacyIn(BaseModel):
    visibility: Literal["PUBLIC", "PRIVATE"]
    verification_details: str | None = Field(default=None, max_length=5000)

class AdminPrivateClaimIn(BaseModel):
    student_id: int
    proof_text: str = Field(min_length=10)
    identifying_details: str = Field(min_length=5)
    contents_details: str = ""
    additional_proof: str = ""

class ClaimIn(BaseModel):
    item_id: int
    proof_text: str = Field(min_length=10)
    identifying_details: str = Field(min_length=5)
    contents_details: str = ""
    additional_proof: str = ""
    proof_image_url: str | None = None

class ClaimOut(ClaimIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    status: str
    admin_comment: str | None
    created_at: datetime
    updated_at: datetime

class Decision(BaseModel):
    comment: str = Field(default="", max_length=2000)

class StatusIn(BaseModel):
    status: str
