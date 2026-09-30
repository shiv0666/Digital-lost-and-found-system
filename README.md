# Campus Loop

A physical-first campus lost-and-found prototype. Students can browse desk-verified found items, submit lost reports, and request claims. Only the campus desk intake route creates found listings; staff release an item after checking the student's one-time OTP in person.

## Run the three services

Use three terminals from the project folder. Node.js 20+ and Python 3.10+ are recommended.

### 1. AI match service

```powershell
cd ai-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Express API

```powershell
cd backend
npm install
npm run dev
```

The API listens on `http://localhost:4000`. Set `AI_SERVICE_URL` to override the default AI URL.

### 3. React frontend

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite proxies `/api` and `/uploads` requests to Express so item photos render in the frontend.

## Demo flow

1. Sign in as campus desk staff and log an item physically handed in. Found items default to **Public**; **Private** items stay out of the student feed and cannot be claimed.
2. Sign in as a student and claim a public find to receive an OTP, or submit a lost report. Lost reports are private to the reporting student and campus staff.
3. In Desk view, review a student lost report. **Review & approve** opens a prefilled editable form; save it as approved or reject the report. Neither action publishes the lost report to students.
4. Campus staff can take or attach an item photo; saved photos appear on public student listings. Enter a claim OTP on a desk item to record who received it and resolve the case.
5. Admin history records all intakes, reports, reviews, claims, and hand-offs. Students see only their own reports and claims.

Items, claims, release recipients, and audit events persist in `backend/data/store.json`; captured photos are saved under `backend/data/uploads/`. Both are local-only and excluded from Git. No external database is required.

The role selection and `X-Campus-Role` header are prototype controls, not production authentication. Connect campus SSO or another server-verified identity mechanism before deployment. Private desk notes and released-recipient details are omitted from public item responses.
