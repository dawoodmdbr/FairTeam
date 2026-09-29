# Setup & Deployment Guide — Fair Team Matcher

**Purpose of this document:** Everything needed to run this project locally and deploy it, without re-figuring out the stack decisions already made.

---

## 1. Stack Summary
- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend/DB/Auth:** Supabase (Postgres + Auth)
- **Hosting:** Vercel

## 2. Prerequisites
- Node.js (LTS version) and npm/pnpm installed
- A Supabase project (free tier is enough for this scale)
- A Vercel account, linked to the GitHub repo

## 3. Environment Variables

Create a `.env.local` file (never committed) with:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Only needed if NOT using Supabase Auth for the organizer login (SDA §3, AuthGate)
VITE_ORGANIZER_USERNAME=your-chosen-username
VITE_ORGANIZER_PASSWORD=your-chosen-password
```

Google OAuth (for Class Mode participant sign-in) is configured inside Supabase Auth's provider settings, not as a separate env var — see Section 4.1 below.

## 4. Database Setup (Supabase)

Run migrations to create the tables described in SDA §6 (ER diagram):
`sessions`, `participants`, `question_definitions`, `question_responses`, `ranking_responses`, `avoid_responses`, `teams`, `team_memberships`.

Key Row-Level Security (RLS) policies to set up (this is what actually enforces NFR-3 and NFR-4, not just app-level code):
- `ranking_responses` and `avoid_responses`: no client role can `SELECT` these directly — only server-side/service-role logic used inside the scoring computation may read them.
- `question_responses`: readable by the organizer role always; readable by a participant only for their own rows, and only in Friend Mode after reveal (for their own team's reasoning).
- `teams` / `team_memberships`: readable per the mode's visibility rule (Friend Mode: only rows belonging to the requesting participant's own team; Class Mode: organizer only).

Seed the two initial question sets (Requirements §7.1, §7.2) into `question_definitions` as part of initial setup, not hardcoded in the frontend — this is what makes them editable later without a code change.

## 4.1 Google OAuth Setup (Class Mode)

1. In [Google Cloud Console](https://console.cloud.google.com), create an OAuth 2.0 Client ID (Web application type).
2. Add your Supabase project's callback URL as an authorized redirect URI (found in Supabase Dashboard → Authentication → Providers → Google).
3. In Supabase Dashboard → Authentication → Providers, enable **Google** and paste in the Client ID and Client Secret from step 1.
4. Domain restriction (`cfd.nu.edu.pk`, `lhr.nu.edu.pk`, `isb.nu.edu.pk` only) is **not** enforced by Google/Supabase itself — it's enforced in application code by `GoogleRollNumberAuthGate` (SDA §3), which checks the authenticated email's domain and derived roll number before accepting the session. Don't rely on Google Workspace domain restriction alone, since these are separate campus domains, not one shared Workspace.
5. Seed the `CampusDomain` lookup table (SDA §6) with the three supported campus letters and domains before running any Class Mode session.

## 4.2 Additional Feature Setup

- **Exports (CSV/PDF):** `CsvResultExporter` needs no extra service. `PdfResultExporter` needs a PDF-generation library on the client or a small serverless function — either is fine, but keep it consistent with the "no extra backend service" spirit of this stack (a Vercel serverless function calling a PDF library is simplest).
- **Rate limiting:** `SupabaseRateLimiter` uses the `rate_limit_attempts` table (SDA §6) — a simple count-attempts-in-a-window check is enough at this scale; no external rate-limiting service is needed.
- **Session expiry:** implement as a scheduled check (a Supabase scheduled Edge Function, or a Vercel Cron Job) that marks `open` sessions past their `expires_at` as `expired`. Set a sensible default (e.g. 14 days) as an environment variable, e.g. `SESSION_EXPIRY_DAYS=14`.
- **Dark mode:** implemented purely in Tailwind (`dark:` variants) with a small client-side toggle persisted to `localStorage` — no backend involvement needed.
- **Public "How This Works" page:** a static route with no data fetching and no auth guard — make sure it's excluded from whatever route-level auth check wraps the rest of the app.

## 5. Running Locally

```bash
npm install
npm run dev
```

The app should be reachable at `http://localhost:5173` (Vite default).

## 6. Running Tests

```bash
npm run test        # unit tests (domain layer — no DB needed)
npm run test:integration   # requires a local or test Supabase project
```

## 7. Deploying to Vercel
1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the same environment variables from Section 3 into Vercel's project settings.
4. Deploy — Vercel builds via `npm run build` and serves the Vite output automatically.

## 8. Project Structure Reference
See SDA §9 for the full `/src` folder layout. At a glance:
- `/src/domain` — pure logic, no imports from Supabase or React
- `/src/application` — `MatchingService`, orchestration only
- `/src/infrastructure` — Supabase-specific implementations
- `/src/ui` — React pages/components

## 9. Adding a New Question (the "Open for Extension" path)
Because question sets live in the database (Section 4) rather than in code:
1. Insert a new row into `question_definitions` with the correct `mode`.
2. No frontend or scoring code needs to change — the question form renders from whatever `QuestionSetProvider` returns, and `QuestionSimilarity` scoring reads the question's `type` to know how to score it generically.

## 10. Known Operational Notes
- No email/notification system exists — the organizer is responsible for manually sharing the link.
- No password reset flow if using the env-credential `AuthGate` — losing that password means updating the environment variable and redeploying.
- Since there's no per-person identity verification (Design & UI doc §6), this tool is only as trustworthy as the group using it — worth remembering if this is ever handed to a class where that assumption doesn't hold as safely as with a friend group.

## 11. Traceability
This guide operationalizes the architecture in the SDA and the constraints in the Requirements doc (§11, Assumptions & Constraints).
