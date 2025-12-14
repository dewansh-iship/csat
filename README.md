# CSAT Survey (Ready-to-use reference implementation)

## Quick Start
### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open:
- User: http://localhost:5173/survey
- Admin: http://localhost:5173/admin
- Backend health: http://localhost:4000/health

## Notes
- OTP send responds immediately and sends the email async (fast UX). If SMTP fails, check backend logs.
- One submission per email is enforced.
- Slider scoring mapping: 0–2 Low, 3 Acceptable, 4–5 High.
- White “liquid glass” UI throughout.
