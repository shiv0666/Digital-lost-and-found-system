"""Run the core workflow without a PostgreSQL server: python smoke_test.py."""
import os
import secrets
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

with tempfile.TemporaryDirectory() as folder:
    os.environ["DATABASE_URL"] = f"sqlite:///{(Path(folder) / 'smoke.db').as_posix()}"
    os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
    admin_password = secrets.token_urlsafe(18)
    student_password = secrets.token_urlsafe(18)
    from app.auth import hasher
    from app.database import SessionLocal, engine
    from app.main import app
    from app.models import User

    with TestClient(app) as client:
        with SessionLocal() as db:
            db.add(User(name="Admin", email="admin@test.edu", role="ADMIN", password_hash=hasher.hash(admin_password)))
            db.commit()

        def login(email, password):
            response = client.post("/auth/login", json={"email": email, "password": password})
            assert response.status_code == 200, response.text
            return {"Authorization": f"Bearer {response.json()['access_token']}"}

        for name, email in [("Reporter", "reporter@test.edu"), ("Claimant", "claimant@test.edu")]:
            response = client.post("/auth/register", json={"name": name, "email": email, "password": student_password})
            assert response.status_code == 201, response.text

        reporter = login("reporter@test.edu", student_password)
        claimant = login("claimant@test.edu", student_password)
        admin = login("admin@test.edu", admin_password)

        report = {"title": "Black wallet", "description": "A black wallet near the library", "category": "Personal", "location": "Library", "date": "2026-09-29", "type": "FOUND"}
        response = client.post("/items", json=report, headers=reporter)
        assert response.status_code == 201, response.text
        item_id = response.json()["id"]
        assert response.json()["status"] == "PENDING"
        assert client.get("/items", headers=claimant).json() == []
        assert client.get("/admin/items/pending", headers=claimant).status_code == 403
        assert client.put(f"/admin/items/{item_id}/approve", headers=reporter).status_code == 403
        assert client.put(f"/admin/items/{item_id}/approve", headers=admin).status_code == 200
        assert any(item["id"] == item_id for item in client.get("/items", headers=claimant).json())

        proof = {"item_id": item_id, "proof_text": "This wallet belongs to me and I lost it yesterday.", "identifying_details": "My initials are on the lining.", "contents_details": "Student card inside"}
        assert client.post("/claims", json=proof, headers=reporter).status_code == 403
        response = client.post("/claims", json=proof, headers=claimant)
        assert response.status_code == 201, response.text
        claim_id = response.json()["id"]
        assert client.post("/claims", json=proof, headers=claimant).status_code == 409
        assert client.put(f"/admin/claims/{claim_id}/approve", json={"comment": "Ownership verified"}, headers=claimant).status_code == 403
        assert client.put(f"/admin/claims/{claim_id}/approve", json={"comment": "Ownership verified"}, headers=admin).status_code == 200
        assert client.get(f"/items/{item_id}", headers=claimant).json()["status"] == "CLAIMED"
        assert client.get("/items", headers=claimant).json() == []
        assert client.get("/claims/my", headers=claimant).json()[0]["status"] == "APPROVED"
        assert client.put(f"/admin/items/{item_id}/status", json={"status": "RETURNED"}, headers=admin).status_code == 200
        print("PASS: registration, login, moderation, visibility, claims, authorization, return")
    engine.dispose()
