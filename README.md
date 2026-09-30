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

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite proxies `/api` requests to the Express service.

## Demo flow

1. Switch to **Desk view** and log an item that was physically handed to campus staff. Its public listing appears in Student view.
2. In Student view, create a claim with a proof note. The four-digit OTP appears in **My claims**.
3. Switch to Desk view and enter the student's OTP on that item's card to resolve and remove it from the open feed.
4. Submit a lost report and add found items to see AI potential-match scores above 65% in Desk view.

The app uses in-memory arrays, so items and claims reset when the Express process restarts. The role switch and `X-Campus-Role` header are for hackathon demonstration only, not production authentication; use campus SSO or another server-verified identity mechanism before deployment. The private admin note is omitted from student item responses.
