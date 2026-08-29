# ProviderOps Tracker

ProviderOps Tracker is a healthcare operations portfolio project for organizing providers, managing multiple credentials under each provider, monitoring expirations, and supporting reminder outreach before licenses and other credentials lapse.

> **Portfolio status:** This project is maintained as a demonstration of healthcare credentialing, operations workflow design, reporting, and lightweight application development. It is not currently used to process live provider or patient data.

## Why I built it

Credentialing teams often manage the same provider across multiple licenses, certifications, registrations, and insurance documents. A flat spreadsheet can repeat the provider over and over, making it harder to see the complete credentialing picture and easier to create accidental duplicate records.

ProviderOps Tracker uses a provider-centric workflow: **one provider is identified by NPI, and that provider can have many separate credentials underneath the same profile.**

## Provider-centric design

- Each provider appears once in the Provider Directory.
- NPI is used as the primary provider identity in the interface.
- A provider can hold multiple credentials such as state licenses, DEA registrations, malpractice insurance, board certifications, BLS, and ACLS.
- Credentials are distinguished by **NPI + credential type + state** so, for example, a Texas state license and a Florida state license remain separate.
- Adding the same credential again is blocked in the application instead of creating another duplicate row.
- CSV imports update an existing matching credential rather than duplicating it.
- Existing local demo data is cleaned for exact credential duplicates while preserving the newest version.
- A Supabase migration is included to enforce the same provider/credential uniqueness rule at the database level.

## Core capabilities

- Provider Directory with one top-level entry per provider
- Multiple licenses and credentials managed inside each provider record
- Automatic recognition of an existing NPI when adding another credential
- Duplicate credential prevention
- Expiration tracking for licenses, DEA, certifications, malpractice coverage, and other credentials
- Dynamic portfolio demo dates so the risk dashboard remains useful over time
- Status and KPI dashboard views
- Provider and credential search
- CSV import, template download, and export
- Reminder windows at 60, 30, 14, and 7 days plus expired status
- Provider reminder email preview and delivery workflow
- Reminder history with sent/failed status tracking
- Supabase authentication and per-user data support
- Row Level Security (RLS) for Supabase-backed records
- LocalStorage fallback for demonstration when Supabase is not configured
- Backend email delivery through Resend, SMTP/Nodemailer, or local demo-json mode
- Automated test/build verification with GitHub Actions

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
- **CI:** GitHub Actions

## Project structure

```text
providerops-tracker-app/
├── .github/workflows/ci.yml
├── src/
│   ├── main.js
│   ├── provider-view.js
│   ├── provider-view.css
│   ├── provider-tools.js
│   ├── notification-tools.js
│   ├── csv-tools.js
│   └── supabaseClient.js
├── server/
│   ├── routes/reminders.js
│   ├── services/emailService.js
│   └── server.js
├── supabase/
│   ├── schema.sql
│   └── provider_unique_credentials.sql
├── tests/
│   ├── provider-tools.test.js
│   ├── notification-tools.test.js
│   └── snake-logic.test.js
├── index.html
├── styles.css
└── package.json
```

## Run locally

### 1. Install frontend dependencies

```bash
npm install
npm run dev
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

### 2. Optional Supabase setup

Create a Supabase project, then run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.

For an existing database, run [`supabase/provider_unique_credentials.sql`](./supabase/provider_unique_credentials.sql) after the base schema. The migration keeps the newest duplicate credential record and adds a unique index for user + NPI + credential type + state.

If Supabase is not configured, the project uses its LocalStorage fallback for demonstration purposes.

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

## Tests and build verification

```bash
npm test
npm run build
```

The test suite covers provider grouping, duplicate prevention, credential reminder logic, email-content safety, and other application utilities. GitHub Actions runs the test suite and production build on relevant pushes and pull requests.

## Security and privacy notes

- Email provider secrets remain server-side.
- Supabase frontend keys are intended to be paired with Row Level Security policies.
- Provider-entered values used in reminder HTML are escaped before rendering into email markup.
- Sample records in the repository are fictional demo data.
- This portfolio project should not be treated as a production HIPAA-compliant system without a formal security, privacy, infrastructure, and compliance review.

## Portfolio focus

This project demonstrates a combination of:

- Healthcare credentialing workflow knowledge
- Provider master-data organization
- License and credential lifecycle management
- Expiration and renewal monitoring
- Duplicate prevention and data-quality controls
- Operational reporting and exception management
- Process improvement thinking
- Technical prototyping and workflow automation

**Created by Joselyn Gotay**
