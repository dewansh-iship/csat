# CSAT Survey Backend (Node + Express + SQLite)

## Setup
```bash
cp .env.example .env
npm install
npm run dev
```

## Endpoints
- GET /health
- GET /questions
- POST /otp/send
- POST /otp/verify
- POST /submit  (requires verified email via X-Email)
- POST /admin/login
- GET /admin/submissions
- GET /admin/submissions/:id
- GET /admin/stats

## Notes
- SQLite database stored at `backend/data/db.sqlite`
- OTP emails are sent async after responding (fast UX). Check backend logs if SMTP fails.
