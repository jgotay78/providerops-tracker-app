# ProviderOps Tracker (Supabase SaaS)

ProviderOps Tracker now supports multi-user SaaS mode with Supabase auth + database + RLS.

## What this app now supports

- User sign-up, login, logout, and forgot-password
- Per-user provider records (RLS-protected)
- Per-user notification history (RLS-protected)
- Existing dashboard, KPI cards, filters, sticky columns, CSV import/export, reminders, modals
- Resend email sending via backend (server-side API key only)
- LocalStorage fallback when Supabase is not configured

## 1. Supabase setup

1. Create a Supabase project.
2. In Supabase dashboard, copy:
   - **Project URL**
   - **anon public key**
3. Paste them into frontend `.env` (root of project):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Open Supabase SQL Editor and run:

- [`supabase/schema.sql`](/Users/jgotay/Documents/New%20project/supabase/schema.sql)

This creates `profiles`, `provider_records`, `notification_history`, RLS policies, and auto-profile trigger.

## 2. Frontend run

```bash
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## 3. Backend run (Resend reminder API)

Create `server/.env` from `.env.example` values:

```env
RESEND_API_KEY=your_resend_api_key_here
FROM_EMAIL=ProviderOps Tracker <onboarding@resend.dev>
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

Then run backend:

```bash
cd server
npm install
npm run dev
```

Backend runs at `http://localhost:3001`.

## 4. Security notes

- `RESEND_API_KEY` must remain server-side only (`server/.env`).
- Never put `RESEND_API_KEY` in frontend code.
- Supabase anon key is expected in frontend and protected by RLS.
- For production email sending, use a verified sending domain in Resend.

## 5. If Supabase is not configured

The app shows a Supabase warning and uses existing localStorage fallback so development can continue.
