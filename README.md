# Campusloop — Digital Lost & Found

A full-stack lost and found system for a college campus. Students report items, browse approved listings, submit ownership proof, and track decisions. Administrators use a separate dashboard to verify reports, review claims, manage listings and users, and mark items returned.

## Stack and architecture

- **Frontend:** React, Vite, React Router, Axios, Lucide icons, CSS
- **Backend:** FastAPI, SQLAlchemy, Pydantic, JWT, Argon2 password hashing
- **Database:** PostgreSQL for normal use; SQLite supported for quick local testing
- **Images:** local `backend/uploads/` directory; PostgreSQL stores paths only

The frontend calls a REST API. A JWT bearer token protects every item, claim, upload, and admin route. Registration always creates a `STUDENT`; an `ADMIN` account is created by the seed script. Authorization and status transitions are checked in the backend.

## Features

- Separate student and admin dashboards and navigation
- Student registration, login, protected routes, profile
- Lost and found reports submitted as `PENDING`
- Admin approval or rejection before public visibility
- Admin-controlled `PUBLIC`/`PRIVATE` visibility for sensitive found items
- Search, type/category/location filters, and date sorting
- Ownership claims with identifying details and optional image proof
- Admin claim decisions and comments; claim history for students
- Item workflow: `PENDING → APPROVED → CLAIMED → RETURNED` (with rejection and closing options)
- Admin user list, listing management, and statistics
- Responsive interface, loading and empty states, error and success messages

## Project layout

```text
backend/
  app/
    auth.py       JWT, password hashing, role guards
    database.py   SQLAlchemy engine/session
    models.py     User, Item, Claim tables
    schemas.py    API validation and response models
    main.py       REST routes and uploads
    migrations.py Additive privacy migration for existing databases
  uploads/        Local images
  seed.py         Demo accounts, items, claims
  smoke_test.py   Complete API workflow check
frontend/
  src/App.jsx     Student and admin pages
  src/styles.css  Responsive design
  src/services/api.js
docker-compose.yml
```

## Database schema

`users`: id, name, unique email, password hash, role, created time.

`items`: id, reporter FK, title, description, additional details, category, location, event date, image path, type, status, visibility, admin-only verification details, timestamps.

`claims`: id, item FK, student FK, ownership proof, identifying details, contents/configuration, additional proof, image path, status, admin comment, timestamps. A student can submit only one claim per item. Item and claim statuses have database constraints.

Tables are created automatically when the API starts. On an existing database, startup adds the privacy columns without replacing item or claim data; existing items become `PUBLIC`. Back up production data before deployment. For later schema changes, use versioned migrations.

## Run locally

Requirements: Python 3.11+, Node 20+, npm, and PostgreSQL 16+ (or Docker). Use two terminals.

### 1. Database

```powershell
Copy-Item .env.example .env
# Edit .env and choose a POSTGRES_PASSWORD.
docker compose up -d db
```

Use the same password in the backend `DATABASE_URL`.

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env`: set `DATABASE_URL` and generate a unique `JWT_SECRET` of at least 32 characters. Then:

```powershell
$env:DEMO_PASSWORD="choose-a-demo-password"
$env:DATABASE_URL="postgresql+psycopg://lostfound:your-db-password@localhost:5432/lostfound"
$env:JWT_SECRET="replace-with-a-long-random-secret-at-least-32-chars"
python seed.py
uvicorn app.main:app --reload --env-file .env
```

Environment variables set in the shell take precedence over `.env`. To avoid repeating them, put `DATABASE_URL` and `JWT_SECRET` in `backend/.env`. `seed.py` does not automatically load `.env`; set its database URL and demo password in the shell before running it. Seeding is idempotent and skips a database that already has users.

For a quick SQLite run, set `DATABASE_URL=sqlite:///./lostfound.db` instead. The smoke test uses a temporary SQLite database and needs no PostgreSQL server.

API: `http://localhost:8000`; interactive docs: `http://localhost:8000/docs`.

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies API requests to port 8000. For a separately hosted frontend, set `VITE_API_URL` to the backend origin and add the frontend origin to backend `CORS_ORIGINS`.

## Demo credentials

All seeded accounts use the value you choose for `DEMO_PASSWORD`:

| Role | Email |
| --- | --- |
| Admin | `admin@campus.edu` |
| Student | `aarav@campus.edu` |
| Student | `maya@campus.edu` |
| Student | `riya@campus.edu` |
| Student | `kabir@campus.edu` |

The seed adds eight sample items and three sample claims. There is no hardcoded demo password in the repository.

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Images | `POST /uploads` |
| Items | `GET /items`, `GET /items/my`, `GET /items/{id}`, `POST /items`, `PUT /items/{id}`, `DELETE /items/{id}` |
| Claims | `POST /claims`, `GET /claims/my`, `GET /claims/{id}` |
| Admin items | `GET /admin/items`, `GET /admin/items/pending`, `GET /admin/items/{id}`, `POST /admin/items`, `PUT /admin/items/{id}/privacy`, `/approve`, `/reject`, `/status`, `POST /admin/items/{id}/private-claims` |
| Admin claims | `GET /admin/claims`, `GET /admin/claims/pending`, `PUT /admin/claims/{id}/approve`, `/reject` |
| Admin other | `GET /admin/users`, `DELETE /admin/users/{id}`, `GET /admin/stats` |

The student browse API returns only `APPROVED` and `PUBLIC` items. Students cannot fetch or claim a private item by its ID. Student reports default to `PUBLIC`; only admins can change visibility or read verification details. In **Admin → Item Privacy**, admins can create a private item, search all reports, compare it with a student's lost report, and record a private verification. That creates a pending claim for the student, which the admin approves or rejects in the existing Pending Claims page. Approving a claim marks the item `CLAIMED` and rejects other pending claims on that item. Only an admin can move a claimed item to `RETURNED`. Returned items no longer appear in Browse Items.

## Verification

```powershell
cd backend
python smoke_test.py
cd ../frontend
npm run build
```

The smoke test checks registration, login, role boundaries, pending visibility, item approval, ownership claim creation and approval, duplicate prevention, private item isolation, and return status.

## Future improvements

Add object storage for images, rate limiting, password reset, audit history for admin decisions, and a stronger admin user management workflow.
