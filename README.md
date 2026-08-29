# ProviderOps Tracker

ProviderOps Tracker is a healthcare operations portfolio project for organizing provider credentialing records, monitoring credential expirations, and supporting reminder outreach before licenses and other credentials lapse.

> **Portfolio status:** This project is maintained as a demonstration of healthcare credentialing, operations workflow design, reporting, and lightweight application development. It is not currently used to process live provider or patient data.

## Why I built it

Credentialing teams often manage large volumes of provider records, expiration dates, renewal activity, and follow-up communication. ProviderOps Tracker demonstrates how those workflows can be brought into one operational view so teams can identify risk quickly and stay ahead of expiring credentials.

## Core capabilities

- Provider credentialing record management
- Expiration tracking for licenses, DEA, certifications, malpractice coverage, and other credentials
- Status and KPI dashboard views
- Search, filters, quick filters, and owner-based views
- CSV import, template download, and export
- Reminder windows at 60, 30, 14, and 7 days plus expired status
- Provider reminder email preview and delivery workflow
- Reminder history with sent/failed status tracking
- Supabase authentication and per-user data support
- Row Level Security (RLS) for Supabase-backed records
- LocalStorage fallback for demonstration when Supabase is not configured
- Backend email delivery through Resend, SMTP/Nodemailer, or local demo-json mode

## Credential reminder workflow

The application evaluates each credential against its expiration date and assigns a reminder stage:

| Days remaining | Reminder stage |
| --- | --- |
| More than 60 | Not Due Yet |
| 31–60 | 60-Day |
| 15–30 | 30-Day |
| 8–14 | 14-Day |
| 0–7 | 7-Day |
| Past expiration | Expired |

Reminder emails include the provider name, credential type, expiration date, and actual number of days remaining. Delivery results are recorded in notification history for follow-up and auditing within the demo workflow.

## Technology

- **Frontend:** HTML, CSS, JavaScript, Vite
- **Data/Auth:** Supabase
- **Backend:** Node.js + Express
- **Email:** Resend or Nodemailer/SMTP
- **Testing:** Node.js built-in test runner

## Project structure

```text
providerops-tracker-app/
├── src/
│   ├── main.js
│   ├── notification-tools.js
│   ├── csv-tools.js
│   └── supabaseClient.js
├── server/
│   ├── routes/reminders.js
│   ├── services/emailService.js
│   └── server.js
├── supabase/
│   └── schema.sql
├── tests/
├── index.html
├── styles.css
└── package.json
```

## Run locally

### 1. Install frontend dependencies

```bash
npm install
```

Copy the frontend environment template if you want Supabase and backend email integration:

```bash
cp .env.example .env
```

Configure:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE_URL=http://localhost:3001
```

Run the frontend:

```bash
npm run dev
```

### 2. Optional Supabase setup

Create a Supabase project, then run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. The schema creates the profile, provider-record, and notification-history data structures along with Row Level Security policies.

If Supabase is not configured, the project can use its LocalStorage fallback for demonstration purposes.

### 3. Optional reminder-email backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The backend supports three delivery modes:

1. **Resend** when `RESEND_API_KEY` is configured
2. **SMTP/Nodemailer** when SMTP credentials are configured
3. **Demo JSON transport** when no external mail credentials are provided

Never commit production credentials or provider data to this repository.

## Tests

Run the project tests with:

```bash
npm test
```

The test suite covers core credential-reminder logic in addition to other application utilities.

## Security and privacy notes

- Email provider secrets remain server-side.
- Supabase frontend keys are intended to be paired with Row Level Security policies.
- Provider-entered values used in reminder HTML are escaped before rendering into email markup.
- Sample records in the repository are fictional demo data.
- This portfolio project should not be treated as a production HIPAA-compliant system without a formal security, privacy, infrastructure, and compliance review.

## Portfolio focus

This project demonstrates a combination of:

- Healthcare credentialing workflow knowledge
- Provider data organization
- Expiration and renewal monitoring
- Operational reporting and exception management
- Process improvement thinking
- Technical prototyping and workflow automation

**Created by Joselyn Gotay**
