import os
from datetime import date, timedelta
from sqlalchemy import select
from app.auth import hasher
from app.database import Base, SessionLocal, engine
from app.models import Claim, Item, User

def seed():
    Base.metadata.create_all(engine)
    demo_password = os.getenv("DEMO_PASSWORD")
    if not demo_password:
        raise SystemExit("Set DEMO_PASSWORD (8+ characters) before seeding")
    if len(demo_password) < 8:
        raise SystemExit("DEMO_PASSWORD must have at least 8 characters")
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            print("Database already contains users; seed skipped")
            return
        names = [("Campus Admin", "admin@campus.edu", "ADMIN"), ("Aarav Mehta", "aarav@campus.edu", "STUDENT"), ("Maya Singh", "maya@campus.edu", "STUDENT"), ("Riya Shah", "riya@campus.edu", "STUDENT"), ("Kabir Rao", "kabir@campus.edu", "STUDENT")]
        people = [User(name=n, email=e, role=r, password_hash=hasher.hash(demo_password)) for n, e, r in names]
        db.add_all(people)
        db.flush()
        samples = [
            (1, "Black leather wallet", "FOUND", "Personal", "Library entrance", "A black wallet found near the circulation desk.", "APPROVED"),
            (2, "Blue steel water bottle", "LOST", "Accessories", "Science block", "A blue bottle with a silver cap went missing.", "APPROVED"),
            (3, "Wireless earbuds case", "FOUND", "Electronics", "Cafeteria", "White charging case found on a lunch table.", "APPROVED"),
            (4, "Calculus textbook", "LOST", "Books", "Room B204", "Second year calculus book with handwritten notes.", "APPROVED"),
            (1, "Campus ID card", "FOUND", "Documents", "Main gate", "Student ID card turned in at security.", "PENDING"),
            (2, "Grey backpack", "LOST", "Bags", "Sports complex", "Grey backpack with two outer pockets.", "PENDING"),
            (3, "Silver wristwatch", "FOUND", "Accessories", "Auditorium", "Silver watch found after an evening event.", "APPROVED"),
            (4, "Red umbrella", "LOST", "Accessories", "North parking", "Compact red umbrella left near the parking area.", "RETURNED"),
        ]
        items = [Item(reported_by=people[owner].id, title=title, type=kind, category=category, location=location, description=description, date=date.today()-timedelta(days=i+1), status=status) for i, (owner,title,kind,category,location,description,status) in enumerate(samples)]
        db.add_all(items)
        db.flush()
        db.add_all([
            Claim(item_id=items[0].id, student_id=people[2].id, proof_text="I lost this wallet after studying in the library.", identifying_details="A stitched initial is inside the left fold.", contents_details="It holds a bus card and a photo.", status="PENDING"),
            Claim(item_id=items[2].id, student_id=people[4].id, proof_text="The case fell from my pocket at lunch.", identifying_details="There is a small blue sticker underneath.", status="PENDING"),
            Claim(item_id=items[6].id, student_id=people[1].id, proof_text="I lost my watch during the auditorium event.", identifying_details="The clasp has my initials engraved.", status="REJECTED", admin_comment="The engraving did not match."),
        ])
        db.commit()
        print("Seeded 1 admin, 4 students, 8 items, and 3 claims")

if __name__ == "__main__":
    seed()
