# Build Prompt for Antigravity — Fair Team Matcher

## Your Task

Implement the complete **Fair Team Matcher** application in this repository. Do not ask me what to build — the full specification already exists in the `docs/` folder. Read every file in `docs/` **before writing any code**, in this order, and treat them as your authoritative, non-negotiable spec:

1. `docs/01-requirements.md` — product requirements, both modes, session lifecycle, fairness algorithm, all functional and non-functional requirements.
2. `docs/02-sda.md` — software architecture: layered design, every class's responsibility, SOLID/GRASP mapping, class diagram, ER diagram, folder structure.
3. `docs/03-design-ui.md` — visual style, screen-by-screen wireframes, navigation rules, known/accepted limitations.
4. `docs/04-test-plan.md` — the exact test cases you must make pass, covering the algorithm, authentication, session flow, and every feature.
5. `docs/05-setup-guide.md` — environment variables, Supabase/Google OAuth configuration steps, local run and deploy instructions.
6. `docs/06-implementation-addendum.md` — technical decisions with rationale, the full SQL schema and RLS policies, real reference implementations of the matching/scoring algorithms and auth logic, plus the code-quality bar and acceptance criteria.

These six documents fully define the product, the architecture, and the algorithm — nothing here overrides them. Where the addendum (`06`) gives you real code (scoring, matching, tie-breaking, roll-number mapping, session lifecycle, exporters), use it as-is rather than re-deriving your own version — it was written specifically to remove ambiguity from the trickiest parts of this system.

## Non-Negotiables (do not gloss over these while implementing)

- **Determinism.** The matching algorithm, tie-breaker, and approximate-matcher fallback must never use unseeded randomness. Same input → byte-identical output, every time. Verify this with an actual test, not just by inspection.
- **RLS on `ranking_responses` and `avoid_responses`.** No client-side (anon/authenticated) query may ever read these tables. Only Edge Functions using the service role may. Get this wrong and Friend Mode's core privacy promise breaks silently.
- **Google auth is derive-then-check, never check-then-trust.** Never accept a roll number the client sends you directly for authentication — always derive the expected roll number from the Google-verified email server-side, then check it against the pre-added list.
- **Session lifecycle is a hard gate, not a UI suggestion.** Participant edit/remove, and any submission, must be rejected server-side once a session is `locked` or `expired` — even if a stale client UI would have allowed the action.
- **Alternative groupings are display-only.** There must be no code path that lets an alternative grouping become the actual saved result.
- **The `/domain` layer stays framework-free.** No Supabase or React import anywhere under `/src/domain`. This is what makes the algorithm unit-testable and is checked by the Test Plan's unit-test tier.

## Build Order

1. Scaffold the project (Vite + React + TypeScript + Tailwind) and the folder structure exactly as `02-sda.md` §9 and `06-implementation-addendum.md`'s Architecture section define it.
2. Write the Supabase migration (schema + RLS + seed data for both question sets) from `06-implementation-addendum.md`'s Data Models section.
3. Implement the `/domain` layer first, with unit tests alongside each piece, before touching any UI: scoring strategies → matching algorithms → fairness calculator → tie-breaker → matcher selector → auth gates/roll-number mapper → session lifecycle manager → exporters.
4. Implement the Supabase Edge Functions (`identify-participant`, `submit-response`, `reveal-session`, `export-results`) that wrap the domain layer behind the server-trust boundary.
5. Implement the UI screens per `03-design-ui.md`, wiring them to the Edge Functions and Supabase client.
6. Write the integration tests (RLS enforcement, double-submission blocking, end-to-end reveal) and the Playwright smoke tests from `04-test-plan.md`.
7. Follow `05-setup-guide.md` to configure Google OAuth, environment variables, and deploy to Vercel.
8. Run through every item in `06-implementation-addendum.md`'s Acceptance Criteria checklist and confirm each one before considering this done.

## Definition of Done

- Every functional and non-functional requirement in `01-requirements.md` is implemented and behaves exactly as specified — no silent scope-narrowing, no "TODO, will add later" left in place of a stated requirement.
- Every test case in `04-test-plan.md` has a corresponding automated test, and all tests pass.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all succeed with zero errors.
- The app is deployed on Vercel, backed by a fully migrated and seeded Supabase project, and reachable via a public URL.
- Every item in `06-implementation-addendum.md`'s Acceptance Criteria section is checked off.

If you find a genuine conflict between any two of the six documents, or a gap none of them cover, stop and flag it explicitly rather than silently picking an interpretation — everything else in scope is already decided.
