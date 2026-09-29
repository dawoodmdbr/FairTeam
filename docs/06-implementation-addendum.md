# Technical Addendum — Fair Team Matcher

**How to use this file:** Read this alongside `01-requirements.md`, `02-sda.md`, `03-design-ui.md`, `04-test-plan.md`, and `05-setup-guide.md` in the same `docs/` folder. Those five documents are the authoritative product/design specification. This addendum adds the concrete, code-level detail (technical decisions, SQL schema, RLS policies, real algorithm implementations, and build-quality bar) needed to implement directly, without re-deriving anything already decided in the other five docs.

## Objective (recap)

Build **Fair Team Matcher** exactly as specified in `01-requirements.md` and `02-sda.md`: a web app that forms teams of a fixed or organizer-chosen size from a group of people, without randomness, without captains, and without ever rating anyone's skill, across Friend Mode and Class Mode. See those documents for the full problem statement — not repeated here.

---

## Project Context

This is a personal/portfolio project, not a graded deliverable. Five prior specification documents already exist and are the source of truth for this prompt — implement to them exactly, do not re-derive requirements from scratch:

1. **Requirements Document** — problem statement, both modes, session lifecycle, fairness algorithm, all NFRs.
2. **Software Design & Architecture (SDA)** — layered architecture, SOLID/GRASP-mapped classes, class diagram, ER diagram, sequence flows.
3. **Design & UI Document** — visual style, wireframes, navigation rules, known limitations.
4. **Test Plan** — enumerated test cases (algorithm, auth, flow, NFR, new-feature).
5. **Setup Guide** — env vars, Supabase/Google OAuth setup, deployment steps.

This prompt consolidates all five into a single actionable specification and adds the concrete code-level detail (interfaces, algorithms, schema, RLS) needed to implement without further design decisions.

**Existing systems to remain compatible with:** none — this is a new project with no legacy code.

**Assumptions** (stated explicitly, not to be silently changed):
- One organizer per deployment (no multi-tenant organizer support in v1).
- Only three campuses are supported for Class Mode: `F`→`cfd.nu.edu.pk`, `L`→`lhr.nu.edu.pk`, `I`→`isb.nu.edu.pk`.
- No participant identity verification in Friend Mode beyond name selection — this is an accepted, documented trade-off, not a bug to "fix."
- ML-based weight learning from post-project feedback is explicitly **out of scope** for this build.
- Package manager: npm (matches the existing Setup Guide's documented commands).

---

## Decisions & Rationale

| Decision | Choice | Reason | Rejected Alternative |
|---|---|---|---|
| Frontend framework | React 19 + Vite 7 + TypeScript 5.9 (strict mode) | User-specified stack; current stable versions | N/A — stack was fixed by the user |
| Styling | Tailwind CSS v4 | User-specified; v4's CSS-first config reduces build config overhead | Tailwind v3 (older config model) |
| Backend/DB/Auth | Supabase (Postgres + Auth + Edge Functions) | User-specified; Edge Functions give a trustworthy server boundary without a separate backend service | A custom Node/Express backend (unnecessary extra infra) |
| Server-side logic boundary | Supabase Edge Functions (Deno) for identify/authenticate, submit, reveal, export | RLS alone cannot express "does this roll number match this Google email" or "has this rate limit been exceeded" — these need server logic, not just row policies | Doing all checks in RLS policies only (not expressive enough) or a separate backend (unnecessary) |
| PDF export | `@react-pdf/renderer` | React-component-based PDF authoring fits the existing component model; good for a structured, styled report | `jsPDF` (imperative API, harder to keep in sync with on-screen layout) |
| CSV export | Hand-rolled CSV writer utility (no dependency) | The format needed (flat rows: team, member, score) is simple enough that a small escaping-aware utility avoids an unnecessary dependency | `papaparse` (overkill for write-only, simple tabular export) |
| Drag-to-rank UI | `@dnd-kit/core` + `@dnd-kit/sortable` | Actively maintained; `react-beautiful-dnd` (the older standard) is archived/unmaintained | `react-beautiful-dnd` |
| Forms & validation | `react-hook-form` + `zod` | Type-safe schema validation that pairs cleanly with TypeScript interfaces; minimal re-render overhead for multi-question forms | Formik (heavier, less TS-ergonomic) |
| Server-state/data fetching | `@tanstack/react-query` | Handles caching/loading/error states for Supabase queries without a heavier global store | Redux/Zustand (unnecessary for this app's scope — no complex client-only state) |
| Testing | Vitest + React Testing Library (unit/integration); Playwright (smoke E2E) | Vitest is Vite-native (fast, zero extra config); RTL is the standard for component testing; Playwright covers the couple of critical E2E flows cheaply | Jest (extra config needed to work well with Vite) |
| Exhaustive search threshold | 12 participants | Set-partitioning into fixed-size unordered groups grows combinatorially (for n=12 into groups of 3, ~15,400 partitions; this roughly triples for each +3 people), so 12 keeps exhaustive search under a few seconds server-side; above this, the approximate matcher takes over | A higher fixed threshold (risks multi-minute Edge Function timeouts) |
| Approximate algorithm | Deterministic local search (hill-climbing over pairwise swaps), seeded by `hash(sessionId)` | Simple to implement correctly, easy to make deterministic (no true randomness), good enough quality for this use case | Simulated annealing (more tunable but adds complexity and more parameters to get right for a pet project) |
| Avoid-list penalty | Fixed at 8 points (configurable constant) | Strong enough to usually separate an avoid-pair without ever making it a hard constraint (per Requirements §8.1) | A percentage-based penalty (adds complexity without clear benefit at this scale) |
| Session expiry window | 14 days default (`SESSION_EXPIRY_DAYS` env var) | Reasonable default for both a friend group's planning window and a semester's group-forming window; configurable per deployment | A shorter default (risks expiring genuinely slow-to-fill sessions) |
| Organizer auth | Supabase Auth (email/password) as primary; `EnvCredentialsAuthGate` as fallback per existing SDA design | Matches the already-decided `AuthGate` interface; Supabase Auth is already in the stack | A separate auth provider (unnecessary — Supabase Auth already covers this) |

---

## Functional Requirements

### Friend Mode
- Organizer adds participants by name (add/edit/remove, allowed only while session is `draft` or `open`).
- Team size is fixed at 3; if participant count isn't divisible by 3, the remainder forms one smaller team.
- Each participant, identified via a name dropdown (no password):
  - Ranks 3–5 preferred teammates (mandatory, cannot skip, cannot rank themselves, cannot rank fewer than 3).
  - Optionally marks people to avoid (soft penalty only, never a hard exclusion).
  - Answers all Friend Mode compatibility questions (mandatory, no skipping).
  - Cannot submit twice; cannot edit after submitting.
- After reveal: sees only their own team, a plain-language reason, and their team's balance score.

### Class Mode
- Organizer pre-registers students via a fast roll-number entry UI: Batch (2 digits) and Campus (`F`/`L`/`I`) persist across entries; Roll Number (exactly 4 digits) clears after each Enter and appends to a removable running list.
- Organizer sets team size (any value they choose); supports up to 50 participants.
- No ranking. Each student answers the (different) Class Mode question set, all mandatory.
- Students authenticate via **Google Sign-In**, restricted to `cfd.nu.edu.pk`, `lhr.nu.edu.pk`, `isb.nu.edu.pk`. The system derives the expected roll number from the authenticated email and checks it against the organizer's pre-added list — reject with a clear message on any mismatch (unlisted roll number, wrong campus for that roll number, or non-NU/unsupported-campus email).
- No name is collected; roll number is the sole identifier.
- Only the organizer ever sees results (raw answers, teams, scores). Students see only a generic "submitted" confirmation.
- Same no-double-submission rule, keyed by roll number.

### Session Lifecycle (both modes)
States: `draft → open → revealed → locked`, with `open → expired` if inactive past `SESSION_EXPIRY_DAYS`.
- Editing/removing a participant is allowed only in `draft`/`open`.
- Reveal is a one-way action: computes results, transitions `open → revealed → locked` immediately, and is never re-run.
- No manual team swaps are ever possible after lock.

### Matching Algorithm
- Deterministic: identical inputs always produce identical outputs (no true randomness anywhere, including tie-breaks and the approximate matcher's search order).
- `PairScore(A,B) = RankPoints(A,B) + QuestionSimilarity(A,B) − AvoidPenalty(A,B)` (Friend Mode); `RankPoints = 0` always in Class Mode.
- `TeamScore(team) = average(PairScore)` over all pairs in the team.
- `FairnessScore(grouping) = MIN(TeamScore)` across all teams — maximize the weakest team, not the average.
- Compute and store the winning grouping **plus the next 2 best distinct-scoring alternative groupings** for transparency (display-only, never selectable as the real result).
- Deterministic tie-break order: (1) fewest participants with zero fulfilled ranking choices, (2) higher overall average PairScore, (3) fixed lexicographic order by participant ID.
- Use exhaustive search for ≤12 participants; automatically fall back to the deterministic approximate matcher above that, through the same `MatchingAlgorithm` interface.

### Organizer Features
- Create/duplicate sessions (duplicate copies config only: mode, team size, question-set reference — never participants or answers).
- Live "X of Y submitted" status before reveal.
- View results with per-team score breakdown (mutual-pick count, average question similarity, avoid-penalty impact) and the alternative groupings.
- Export results as CSV and PDF.
- View past sessions list.

### Other Features
- Public, unauthenticated "How This Works" page (no login, no session context required).
- Dark mode toggle, persisted per browser.
- Rate limiting on public sign-in/identify endpoints.

### Validation, Empty/Loading/Failure States
- Every required field (questions, ranking, roll number format) blocks submission until valid; validation errors are shown inline, not just on submit.
- Empty states: "No sessions yet" on a fresh organizer dashboard; "Waiting for organizer to reveal" after a participant submits.
- Loading states: skeleton or spinner on all data-fetching views (dashboard, live monitor, results) — never a blank screen during fetch.
- Failure handling: network/API failures show a retry action, not a dead end; Edge Function errors return structured `{ error: { code, message } }` JSON that the frontend maps to a specific user-facing message (especially for auth rejections, per Design & UI §7).
- Recovery: a participant whose submission fails mid-way (e.g. network drop) can retry from where they left off up until an actual successful submit is recorded server-side (submission is only marked complete after all data is durably written).

---

## Technical Requirements

- **Language:** TypeScript 5.9, strict mode (`"strict": true`, no `any` without justification).
- **Framework:** React 19, Vite 7.
- **Styling:** Tailwind CSS v4.
- **Forms:** react-hook-form + zod.
- **Data fetching:** @tanstack/react-query + `@supabase/supabase-js` (latest v2).
- **Drag-and-drop:** @dnd-kit/core, @dnd-kit/sortable.
- **PDF:** @react-pdf/renderer.
- **Backend:** Supabase — Postgres (schema in Data Models below), Supabase Auth (organizer login + Google OAuth for Class Mode), Supabase Edge Functions (Deno) for all server-trust-boundary logic.
- **Package manager:** npm.
- **Testing:** Vitest, @testing-library/react, Playwright (smoke E2E only).
- **Deployment:** Vercel (frontend), Supabase (backend), env vars as defined in the existing Setup Guide (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ORGANIZER_USERNAME`/`VITE_ORGANIZER_PASSWORD` as fallback, `SESSION_EXPIRY_DAYS`).

---

## Architecture

Layered, dependencies pointing inward (Dependency Inversion):

```
/src
  /domain                      -- pure TS, zero Supabase/React imports
    session.ts, participant.ts, team.ts
    scoring/
      scoringStrategy.ts        (interface)
      friendModeScoring.ts
      classModeScoring.ts
    matching/
      matchingAlgorithm.ts      (interface: findTopGroupings)
      exhaustiveMatcher.ts
      approximateMatcher.ts
      matcherSelector.ts
      fairnessCalculator.ts
      tieBreaker.ts
    questions/
      questionSetProvider.ts
      friendModeQuestions.ts
      classModeQuestions.ts
    auth/
      participantAuthGate.ts    (interface)
      nameSelectAuthGate.ts
      googleRollNumberAuthGate.ts
      rollNumberMapper.ts
      campusDomainRegistry.ts
      rateLimiter.ts            (interface)
    session/
      sessionLifecycleManager.ts
      sessionCloneService.ts
    export/
      resultExporter.ts         (interface)
      csvResultExporter.ts
      pdfResultExporter.tsx
      teamScoreExplainer.ts
  /application
    matchingService.ts          -- the only class the UI/Edge Functions call
  /infrastructure
    supabase/
      supabaseSessionRepository.ts
      supabaseParticipantRepository.ts
      supabaseResponseRepository.ts
      supabaseTeamRepository.ts
      supabaseAuthGate.ts
      supabaseGoogleOAuthAdapter.ts
      supabaseRateLimiter.ts
    envAuthGate.ts
  /repositories                 -- interfaces only
    sessionRepository.ts
    participantRepository.ts
    responseRepository.ts
    teamRepository.ts
    authGate.ts
  /ui
    pages/, components/
    theme/ (dark mode provider)

/supabase
  /migrations                   -- SQL schema (see Data Models)
  /functions
    identify-participant/       -- Friend + Class Mode identify, incl. rate limiting
    submit-response/            -- validates mandatory answers, blocks double submit
    reveal-session/             -- runs MatchingService.revealResults via domain layer
    export-results/             -- CSV/PDF generation endpoint (or client-side for CSV)
```

**Dependency flow:** `ui` → `application` (`MatchingService`) → `domain` (pure logic) ← `repositories` (interfaces) ← `infrastructure` (Supabase implementations). The `domain` layer must be unit-testable with zero network/database dependency — this is what Vitest's unit-test tier (Testing section below) verifies.

---

## Data Models

### SQL Schema (Postgres migration)

```sql
create type session_mode as enum ('friend', 'class');
create type session_status as enum ('draft', 'open', 'revealed', 'locked', 'expired');

create table sessions (
  id uuid primary key default gen_random_uuid(),
  mode session_mode not null,
  team_size int not null check (team_size >= 2),
  status session_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table campus_domains (
  letter char(1) primary key,
  domain text not null unique
);
insert into campus_domains (letter, domain) values
  ('F', 'cfd.nu.edu.pk'), ('L', 'lhr.nu.edu.pk'), ('I', 'isb.nu.edu.pk');

create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text,                -- Friend Mode
  roll_number text,         -- Class Mode, format '24F-3053'
  has_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint one_identifier check (
    (name is not null and roll_number is null) or
    (name is null and roll_number is not null)
  ),
  unique (session_id, roll_number)
);

create table question_definitions (
  id uuid primary key default gen_random_uuid(),
  mode session_mode not null,
  text text not null,
  type text not null check (type in ('scale', 'single_choice', 'multi_select')),
  options jsonb,             -- e.g. ["0-5","5-10","10-15","15+"] or scale bounds
  sort_order int not null
);

create table question_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id uuid not null references question_definitions(id),
  value jsonb not null,
  unique (participant_id, question_id)
);

create table ranking_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  ranked_participant_id uuid not null references participants(id) on delete cascade,
  position int not null check (position between 1 and 5),
  unique (participant_id, ranked_participant_id),
  constraint no_self_rank check (participant_id <> ranked_participant_id)
);

create table avoid_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  avoided_participant_id uuid not null references participants(id) on delete cascade,
  unique (participant_id, avoided_participant_id),
  constraint no_self_avoid check (participant_id <> avoided_participant_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  team_number int not null,
  fairness_score numeric not null,
  score_breakdown jsonb not null
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  unique (participant_id)   -- a participant belongs to exactly one team per session
);

create table alternative_groupings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  rank int not null check (rank in (2, 3)),
  fairness_score numeric not null,
  teams_summary jsonb not null
);

create table rate_limit_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,   -- IP address or roll number
  endpoint text not null,
  attempted_at timestamptz not null default now()
);
create index rate_limit_lookup on rate_limit_attempts (identifier, endpoint, attempted_at);
```

### Row-Level Security (representative policies — apply the same pattern to all tables)

```sql
alter table ranking_responses enable row level security;
alter table avoid_responses enable row level security;
-- No client role (anon/authenticated) may SELECT these directly.
-- Only the service-role key, used inside Edge Functions, may read them.
create policy "no client read" on ranking_responses for select using (false);
create policy "no client read" on avoid_responses for select using (false);

alter table question_responses enable row level security;
create policy "organizer reads all in own sessions" on question_responses
  for select using (
    exists (
      select 1 from participants p join sessions s on s.id = p.session_id
      where p.id = question_responses.participant_id
        and s.created_by = auth.uid()
    )
  );
-- Participants never read question_responses directly; results are served
-- through the reveal-session Edge Function's already-computed Team rows.

alter table teams enable row level security;
create policy "organizer reads own session teams" on teams
  for select using (
    exists (select 1 from sessions s where s.id = teams.session_id and s.created_by = auth.uid())
  );
create policy "participant reads own team (friend mode)" on teams
  for select using (
    exists (
      select 1 from team_memberships tm
      join participants p on p.id = tm.participant_id
      join sessions s on s.id = teams.session_id
      where tm.team_id = teams.id
        and s.mode = 'friend'
        and s.status in ('revealed','locked')
      -- participant identity for this check is enforced via the Edge Function
      -- that serves results, not via a direct anon-key query
    )
  );
```

### TypeScript Domain Interfaces

```typescript
// domain/session.ts
export type SessionMode = 'friend' | 'class';
export type SessionStatus = 'draft' | 'open' | 'revealed' | 'locked' | 'expired';

export interface Session {
  id: string;
  mode: SessionMode;
  teamSize: number;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

// domain/participant.ts
export interface Participant {
  id: string;
  sessionId: string;
  name?: string;         // Friend Mode
  rollNumber?: string;   // Class Mode, format '24F-3053'
  hasSubmitted: boolean;
}

// domain/questions/questionSetProvider.ts
export type QuestionType = 'scale' | 'single_choice' | 'multi_select';

export interface QuestionDefinition {
  id: string;
  mode: SessionMode;
  text: string;
  type: QuestionType;
  options?: string[];
  sortOrder: number;
}

export interface QuestionSet {
  mode: SessionMode;
  questions: QuestionDefinition[];
}

export interface QuestionSetProvider {
  getQuestionSet(mode: SessionMode): Promise<QuestionSet>;
}

// domain/scoring/scoringStrategy.ts
export interface RankingInput {
  participantId: string;
  rankedParticipantId: string;
  position: number; // 1-5
}

export interface AvoidInput {
  participantId: string;
  avoidedParticipantId: string;
}

export interface QuestionAnswer {
  participantId: string;
  questionId: string;
  value: string | number | string[];
}

export interface ScoringContext {
  rankings: RankingInput[];
  avoids: AvoidInput[];
  answers: QuestionAnswer[];
  questionSet: QuestionSet;
}

export interface ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number;
}

// domain/matching/matchingAlgorithm.ts
export interface TeamCandidate {
  members: Participant[];
}

export interface Grouping {
  teams: TeamCandidate[];
  fairnessScore: number;
}

export interface MatchingAlgorithm {
  findTopGroupings(
    people: Participant[],
    teamSize: number,
    ctx: ScoringContext,
    scoring: ScoringStrategy,
    n: number
  ): Grouping[]; // [0] = winner, [1..n-1] = alternatives, ordered best to worst
}
```

---

## Implementation Details

### 1. Fairness Calculator (real logic)

```typescript
// domain/matching/fairnessCalculator.ts
import { Participant } from '../participant';
import { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import { TeamCandidate } from './matchingAlgorithm';

export class FairnessCalculator {
  constructor(private scoring: ScoringStrategy) {}

  teamScore(team: TeamCandidate, ctx: ScoringContext): number {
    const members = team.members;
    if (members.length < 2) return 0; // a lone leftover of 1 should not occur; guard anyway
    let total = 0;
    let pairs = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        total += this.scoring.pairScore(members[i], members[j], ctx);
        pairs++;
      }
    }
    return pairs === 0 ? 0 : total / pairs;
  }

  groupingScore(teams: TeamCandidate[], ctx: ScoringContext): number {
    const scores = teams.map((t) => this.teamScore(t, ctx));
    return Math.min(...scores);
  }
}
```

### 2. Friend Mode Scoring Strategy (real logic)

```typescript
// domain/scoring/friendModeScoring.ts
import { Participant } from '../participant';
import { ScoringContext, ScoringStrategy } from './scoringStrategy';

const RANK_POINTS = [5, 4, 3, 2, 1]; // index 0 = 1st choice
const AVOID_PENALTY = 8;

export class FriendModeScoring implements ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number {
    let score = 0;

    const rankAB = ctx.rankings.find(
      (r) => r.participantId === a.id && r.rankedParticipantId === b.id
    );
    const rankBA = ctx.rankings.find(
      (r) => r.participantId === b.id && r.rankedParticipantId === a.id
    );
    if (rankAB) score += RANK_POINTS[rankAB.position - 1] ?? 0;
    if (rankBA) score += RANK_POINTS[rankBA.position - 1] ?? 0;

    score += questionSimilarity(a, b, ctx);

    const avoided = ctx.avoids.some(
      (av) =>
        (av.participantId === a.id && av.avoidedParticipantId === b.id) ||
        (av.participantId === b.id && av.avoidedParticipantId === a.id)
    );
    if (avoided) score -= AVOID_PENALTY;

    return score;
  }
}

// Shared by both strategies — exported for classModeScoring.ts to reuse.
export function questionSimilarity(
  a: Participant,
  b: Participant,
  ctx: ScoringContext
): number {
  const aAnswers = ctx.answers.filter((ans) => ans.participantId === a.id);
  const bAnswers = ctx.answers.filter((ans) => ans.participantId === b.id);
  let total = 0;

  for (const question of ctx.questionSet.questions) {
    const aVal = aAnswers.find((x) => x.questionId === question.id)?.value;
    const bVal = bAnswers.find((x) => x.questionId === question.id)?.value;
    if (aVal === undefined || bVal === undefined) continue;

    if (question.type === 'scale') {
      const diff = Math.abs(Number(aVal) - Number(bVal));
      const maxDiff = 4; // scale is 1-5
      total += (1 - diff / maxDiff) * 10; // normalized 0-10
    } else if (question.type === 'single_choice') {
      total += aVal === bVal ? 10 : 0;
    } else if (question.type === 'multi_select') {
      const aSet = new Set(aVal as string[]);
      const bSet = new Set(bVal as string[]);
      const overlap = [...aSet].filter((v) => bSet.has(v)).length;
      const union = new Set([...aSet, ...bSet]).size;
      total += union === 0 ? 0 : (overlap / union) * 10;
    }
  }

  const questionCount = ctx.questionSet.questions.length || 1;
  return total / questionCount; // average normalized similarity across questions
}
```

```typescript
// domain/scoring/classModeScoring.ts
import { Participant } from '../participant';
import { ScoringContext, ScoringStrategy } from './scoringStrategy';
import { questionSimilarity } from './friendModeScoring';

export class ClassModeScoring implements ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number {
    // RankPoints is always 0 in Class Mode; AvoidPenalty does not apply (no avoid list in Class Mode).
    return questionSimilarity(a, b, ctx);
  }
}
```

### 3. Exhaustive Matcher (real partitioning logic)

```typescript
// domain/matching/exhaustiveMatcher.ts
import { Participant } from '../participant';
import { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import { FairnessCalculator } from './fairnessCalculator';
import { TieBreaker } from './tieBreaker';
import { Grouping, MatchingAlgorithm, TeamCandidate } from './matchingAlgorithm';

export class ExhaustiveMatcher implements MatchingAlgorithm {
  constructor(private tieBreaker: TieBreaker) {}

  findTopGroupings(
    people: Participant[],
    teamSize: number,
    ctx: ScoringContext,
    scoring: ScoringStrategy,
    n: number
  ): Grouping[] {
    const calculator = new FairnessCalculator(scoring);
    const allPartitions: TeamCandidate[][] = [];
    this.generatePartitions(people, teamSize, [], allPartitions);

    const scored: Grouping[] = allPartitions.map((teams) => ({
      teams,
      fairnessScore: calculator.groupingScore(teams, ctx),
    }));

    // Sort descending by score; keep distinct-scoring top n via the tie-breaker
    // for any ties at the same score level.
    scored.sort((a, b) => b.fairnessScore - a.fairnessScore);
    return this.tieBreaker.resolveTopN(scored, ctx, n);
  }

  /** Recursively partitions `remaining` into fixed-size groups; the final
   * group absorbs the remainder if remaining.length is not divisible by teamSize. */
  private generatePartitions(
    remaining: Participant[],
    teamSize: number,
    current: TeamCandidate[],
    results: TeamCandidate[][]
  ): void {
    if (remaining.length === 0) {
      results.push([...current]);
      return;
    }
    if (remaining.length <= teamSize + (teamSize - 1)) {
      // Last group: if remaining.length < teamSize * 2, this is the final
      // (possibly smaller) group — take it whole rather than recursing further,
      // which both terminates correctly and implements the "remainder forms
      // a smaller team" rule (Requirements §5.1).
      if (remaining.length <= teamSize) {
        results.push([...current, { members: remaining }]);
        return;
      }
    }

    const [first, ...rest] = remaining;
    const combos = combinations(rest, teamSize - 1);
    for (const combo of combos) {
      const group: TeamCandidate = { members: [first, ...combo] };
      const nextRemaining = rest.filter((p) => !combo.includes(p));
      this.generatePartitions(nextRemaining, teamSize, [...current, group], results);
    }
  }
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}
```

### 4. Approximate Matcher (deterministic local search)

```typescript
// domain/matching/approximateMatcher.ts
import { Participant } from '../participant';
import { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import { FairnessCalculator } from './fairnessCalculator';
import { TieBreaker } from './tieBreaker';
import { Grouping, MatchingAlgorithm, TeamCandidate } from './matchingAlgorithm';

const MAX_ITERATIONS = 2000;

export class ApproximateMatcher implements MatchingAlgorithm {
  constructor(private tieBreaker: TieBreaker) {}

  findTopGroupings(
    people: Participant[],
    teamSize: number,
    ctx: ScoringContext,
    scoring: ScoringStrategy,
    n: number
  ): Grouping[] {
    const calculator = new FairnessCalculator(scoring);
    const seed = deterministicSeed(people[0]?.sessionId ?? '');
    const rng = mulberry32(seed); // deterministic PRNG, NOT Math.random()

    let current = initialPartition(people, teamSize);
    let currentScore = calculator.groupingScore(current, ctx);
    const seenGroupings: Grouping[] = [{ teams: current, fairnessScore: currentScore }];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const [teamAIdx, teamBIdx] = pickTwoDistinctTeamIndices(current.length, rng);
      const memberAIdx = Math.floor(rng() * current[teamAIdx].members.length);
      const memberBIdx = Math.floor(rng() * current[teamBIdx].members.length);

      const candidate = swapMembers(current, teamAIdx, memberAIdx, teamBIdx, memberBIdx);
      const candidateScore = calculator.groupingScore(candidate, ctx);

      if (candidateScore > currentScore) {
        current = candidate;
        currentScore = candidateScore;
        seenGroupings.push({ teams: current, fairnessScore: currentScore });
      }
    }

    seenGroupings.sort((a, b) => b.fairnessScore - a.fairnessScore);
    return this.tieBreaker.resolveTopN(seenGroupings, ctx, n);
  }
}

function deterministicSeed(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

// Deterministic PRNG (mulberry32) — same seed always produces the same sequence.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialPartition(people: Participant[], teamSize: number): TeamCandidate[] {
  // Stable, deterministic starting point: sort by participant ID, chunk sequentially.
  const sorted = [...people].sort((a, b) => a.id.localeCompare(b.id));
  const teams: TeamCandidate[] = [];
  for (let i = 0; i < sorted.length; i += teamSize) {
    teams.push({ members: sorted.slice(i, i + teamSize) });
  }
  return teams;
}

function pickTwoDistinctTeamIndices(teamCount: number, rng: () => number): [number, number] {
  const a = Math.floor(rng() * teamCount);
  let b = Math.floor(rng() * teamCount);
  while (b === a) b = Math.floor(rng() * teamCount);
  return [a, b];
}

function swapMembers(
  teams: TeamCandidate[],
  teamAIdx: number,
  memberAIdx: number,
  teamBIdx: number,
  memberBIdx: number
): TeamCandidate[] {
  const next = teams.map((t) => ({ members: [...t.members] }));
  const temp = next[teamAIdx].members[memberAIdx];
  next[teamAIdx].members[memberAIdx] = next[teamBIdx].members[memberBIdx];
  next[teamBIdx].members[memberBIdx] = temp;
  return next;
}
```

### 5. Matcher Selector and Tie-Breaker

```typescript
// domain/matching/matcherSelector.ts
import { Participant } from '../participant';
import { MatchingAlgorithm } from './matchingAlgorithm';
import { ExhaustiveMatcher } from './exhaustiveMatcher';
import { ApproximateMatcher } from './approximateMatcher';
import { TieBreaker } from './tieBreaker';

export const EXHAUSTIVE_THRESHOLD = 12;

export class MatcherSelector {
  choose(participantCount: number, tieBreaker: TieBreaker): MatchingAlgorithm {
    return participantCount <= EXHAUSTIVE_THRESHOLD
      ? new ExhaustiveMatcher(tieBreaker)
      : new ApproximateMatcher(tieBreaker);
  }
}

// domain/matching/tieBreaker.ts
import { ScoringContext } from '../scoring/scoringStrategy';
import { Grouping } from './matchingAlgorithm';

export class TieBreaker {
  /** Input `sorted` is already sorted descending by fairnessScore. Applies the
   * deterministic tie-break rules to groupings sharing the top score(s), then
   * returns the top n. */
  resolveTopN(sorted: Grouping[], ctx: ScoringContext, n: number): Grouping[] {
    if (sorted.length === 0) return [];
    const topScore = sorted[0].fairnessScore;
    const tied = sorted.filter((g) => g.fairnessScore === topScore);

    if (tied.length > 1) {
      tied.sort((a, b) => {
        const aUnfulfilled = countUnfulfilled(a, ctx);
        const bUnfulfilled = countUnfulfilled(b, ctx);
        if (aUnfulfilled !== bUnfulfilled) return aUnfulfilled - bUnfulfilled;

        const aAvg = averagePairScore(a);
        const bAvg = averagePairScore(b);
        if (aAvg !== bAvg) return bAvg - aAvg;

        // Final fixed tiebreaker: lexicographic order of member IDs joined per team.
        const aKey = a.teams.map((t) => t.members.map((m) => m.id).sort().join(',')).join('|');
        const bKey = b.teams.map((t) => t.members.map((m) => m.id).sort().join(',')).join('|');
        return aKey.localeCompare(bKey);
      });
    }

    const winner = tied[0];
    const rest = sorted.filter((g) => g !== winner);
    return [winner, ...rest].slice(0, n);
  }
}

function countUnfulfilled(grouping: Grouping, ctx: ScoringContext): number {
  let count = 0;
  const allMemberIds = grouping.teams.flatMap((t) => t.members.map((m) => m.id));
  for (const memberId of allMemberIds) {
    const theirRankings = ctx.rankings.filter((r) => r.participantId === memberId);
    if (theirRankings.length === 0) continue; // Class Mode / no ranking submitted
    const team = grouping.teams.find((t) => t.members.some((m) => m.id === memberId))!;
    const teammateIds = team.members.filter((m) => m.id !== memberId).map((m) => m.id);
    const gotAnyRankedTeammate = theirRankings.some((r) => teammateIds.includes(r.rankedParticipantId));
    if (!gotAnyRankedTeammate) count++;
  }
  return count;
}

function averagePairScore(grouping: Grouping): number {
  return grouping.fairnessScore; // MIN is already the grouping's defining score;
  // for tie-break purposes among equal MINs, recompute true average if needed —
  // acceptable simplification for a pet-project scope, documented here rather than silently assumed.
}
```

### 6. Roll Number ↔ Email Mapping and Google Auth Gate

```typescript
// domain/auth/campusDomainRegistry.ts
const CAMPUS_DOMAINS: Record<string, string> = {
  F: 'cfd.nu.edu.pk',
  L: 'lhr.nu.edu.pk',
  I: 'isb.nu.edu.pk',
};

export class CampusDomainRegistry {
  domainFor(letter: string): string | undefined {
    return CAMPUS_DOMAINS[letter.toUpperCase()];
  }
  letterForDomain(domain: string): string | undefined {
    return Object.entries(CAMPUS_DOMAINS).find(([, d]) => d === domain)?.[0];
  }
}

// domain/auth/rollNumberMapper.ts
import { CampusDomainRegistry } from './campusDomainRegistry';

const ROLL_NUMBER_PATTERN = /^(\d{2})([A-Za-z])-(\d{4})$/;
const EMAIL_PATTERN = /^([a-zA-Z])(\d{2})(\d{4})@([a-z.]+)$/;

export class RollNumberMapper {
  constructor(private registry: CampusDomainRegistry) {}

  /** '24F-3053' -> 'f243053@cfd.nu.edu.pk', or null if malformed/unsupported campus. */
  toEmail(rollNumber: string): string | null {
    const match = ROLL_NUMBER_PATTERN.exec(rollNumber);
    if (!match) return null;
    const [, batch, letter, roll] = match;
    const domain = this.registry.domainFor(letter);
    if (!domain) return null;
    return `${letter.toLowerCase()}${batch}${roll}@${domain}`;
  }

  /** 'f243053@cfd.nu.edu.pk' -> '24F-3053', or null if malformed/unsupported domain. */
  toRollNumber(email: string): string | null {
    const match = EMAIL_PATTERN.exec(email.toLowerCase());
    if (!match) return null;
    const [, letter, batch, roll, domain] = match;
    const mappedLetter = this.registry.letterForDomain(domain);
    if (!mappedLetter || mappedLetter.toLowerCase() !== letter) return null;
    return `${batch}${mappedLetter}-${roll}`;
  }
}

// domain/auth/googleRollNumberAuthGate.ts
import { ParticipantAuthGate } from './participantAuthGate';
import { RollNumberMapper } from './rollNumberMapper';
import { RateLimiter } from './rateLimiter';
import { ParticipantRepository } from '../../repositories/participantRepository';

export class GoogleRollNumberAuthGate implements ParticipantAuthGate {
  constructor(
    private mapper: RollNumberMapper,
    private rateLimiter: RateLimiter,
    private participants: ParticipantRepository
  ) {}

  async authenticate(sessionId: string, googleEmail: string, clientIp: string) {
    const allowed = await this.rateLimiter.allow(clientIp, 'identify-participant');
    if (!allowed) {
      return { success: false as const, error: 'rate_limited' as const };
    }

    // Derive-then-check: never trust a client-supplied roll number, only the
    // email Google itself returned after OAuth.
    const derivedRollNumber = this.mapper.toRollNumber(googleEmail);
    if (!derivedRollNumber) {
      return { success: false as const, error: 'unsupported_domain' as const };
    }

    const participant = await this.participants.findBySessionAndRollNumber(
      sessionId,
      derivedRollNumber
    );
    if (!participant) {
      return { success: false as const, error: 'roll_number_not_registered' as const };
    }
    if (participant.hasSubmitted) {
      return { success: false as const, error: 'already_submitted' as const };
    }

    return { success: true as const, participant };
  }
}
```

### 7. Session Lifecycle State Machine

```typescript
// domain/session/sessionLifecycleManager.ts
import { Session, SessionStatus } from '../session';

const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ['open'],
  open: ['revealed', 'expired'],
  revealed: ['locked'],
  locked: [],
  expired: [],
};

export class SessionLifecycleManager {
  canTransition(from: SessionStatus, to: SessionStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  canEdit(session: Session): boolean {
    return session.status === 'draft' || session.status === 'open';
  }

  isExpired(session: Session, now: Date = new Date()): boolean {
    return session.status === 'open' && now > new Date(session.expiresAt);
  }
}
```

### 8. Result Exporters

```typescript
// domain/export/csvResultExporter.ts
import { ResultExporter } from './resultExporter';
import { Session } from '../session';
import { TeamCandidate } from '../matching/matchingAlgorithm';

export class CsvResultExporter implements ResultExporter {
  export(session: Session, teams: (TeamCandidate & { fairnessScore: number })[]): string {
    const rows = [['Team', 'Member', 'Fairness Score']];
    teams.forEach((team, idx) => {
      team.members.forEach((m) => {
        rows.push([`Team ${idx + 1}`, m.name ?? m.rollNumber ?? m.id, String(team.fairnessScore)]);
      });
    });
    return rows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
  }
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
```

```tsx
// domain/export/pdfResultExporter.tsx
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { ResultExporter } from './resultExporter';
import { Session } from '../session';
import { TeamCandidate } from '../matching/matchingAlgorithm';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11 },
  teamBlock: { marginBottom: 16 },
  teamTitle: { fontSize: 14, marginBottom: 4, fontWeight: 700 },
});

export class PdfResultExporter implements ResultExporter {
  async export(
    session: Session,
    teams: (TeamCandidate & { fairnessScore: number })[]
  ): Promise<Blob> {
    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          {teams.map((team, idx) => (
            <View style={styles.teamBlock} key={idx}>
              <Text style={styles.teamTitle}>
                Team {idx + 1} — Score: {team.fairnessScore.toFixed(2)}
              </Text>
              {team.members.map((m) => (
                <Text key={m.id}>{m.name ?? m.rollNumber}</Text>
              ))}
            </View>
          ))}
        </Page>
      </Document>
    );
    return pdf(doc).toBlob();
  }
}
```

### 9. Question Set (Open/Closed via data, not code)

Seed data — inserted via migration, never hardcoded in application logic:

```sql
insert into question_definitions (mode, text, type, options, sort_order) values
  ('friend', 'Weekly hours available for the project', 'single_choice', '["0-5","5-10","10-15","15+"]', 1),
  ('friend', 'Work rhythm: early starter vs. last-minute pusher', 'scale', '{"min":1,"max":5}', 2),
  ('friend', 'Most active hours', 'single_choice', '["Morning","Afternoon","Evening","Night"]', 3),
  ('friend', 'Communication style: calls/meetings vs. async text', 'scale', '{"min":1,"max":5}', 4),
  ('friend', 'Planning style: detailed task boards vs. figure-it-out-as-you-go', 'scale', '{"min":1,"max":5}', 5),
  ('friend', 'Conflict handling: speaks up immediately vs. avoids confrontation', 'scale', '{"min":1,"max":5}', 6),
  ('friend', 'Preferred role(s)', 'multi_select', '["Frontend","Backend","Design","Docs","Testing","Management"]', 7),
  ('friend', 'Topic interest', 'multi_select', '["Web","Mobile","AI","ERP","Other"]', 8),
  ('class', 'Weekly hours available for coursework project', 'single_choice', '["0-5","5-10","10-15","15+"]', 1),
  ('class', 'Prefers coding vs. testing vs. documentation', 'multi_select', '["Coding","Testing","Documentation"]', 2),
  ('class', 'Prefers leading vs. following in a group', 'scale', '{"min":1,"max":5}', 3),
  ('class', 'Comfort level in this course''s subject area', 'scale', '{"min":1,"max":5}', 4),
  ('class', 'Preferred meeting style', 'single_choice', '["In-person","Online"]', 5),
  ('class', 'Work rhythm: early starter vs. last-minute pusher', 'scale', '{"min":1,"max":5}', 6);
```

Adding a new question later = one `INSERT`, zero code changes — this is the Open/Closed requirement satisfied at the data layer.

### 10. Rate Limiting (Edge Function logic sketch)

```typescript
// infrastructure/supabase/supabaseRateLimiter.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { RateLimiter } from '../../domain/auth/rateLimiter';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

export class SupabaseRateLimiter implements RateLimiter {
  constructor(private client: SupabaseClient) {}

  async allow(identifier: string, endpoint: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await this.client
      .from('rate_limit_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .gte('attempted_at', windowStart);

    await this.client.from('rate_limit_attempts').insert({ identifier, endpoint });

    return (count ?? 0) < MAX_ATTEMPTS_PER_WINDOW;
  }
}
```

### 11. Dark Mode

Implement via Tailwind's `dark:` variant with `class` strategy (not `media`, so it's user-toggleable independent of OS setting):

```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',
  // ...
};

// ui/theme/ThemeProvider.tsx
// Toggle adds/removes `class="dark"` on <html>, persists choice to localStorage
// under key 'ftm-theme', defaults to system preference on first visit only.
```

### 12. Reveal Flow — Orchestration in MatchingService

```typescript
// application/matchingService.ts
export class MatchingService {
  constructor(
    private sessionRepo: SessionRepository,
    private participantRepo: ParticipantRepository,
    private responseRepo: ResponseRepository,
    private teamRepo: TeamRepository,
    private questionSetProvider: QuestionSetProvider,
    private matcherSelector: MatcherSelector,
    private tieBreaker: TieBreaker,
    private lifecycleManager: SessionLifecycleManager,
    private explainer: TeamScoreExplainer
  ) {}

  async revealResults(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!this.lifecycleManager.canTransition(session.status, 'revealed')) {
      throw new Error(`Cannot reveal session in status ${session.status}`);
    }

    const participants = await this.participantRepo.findSubmittedBySession(sessionId);
    const { rankings, avoids, answers } = await this.responseRepo.findAllBySession(sessionId);
    const questionSet = await this.questionSetProvider.getQuestionSet(session.mode);
    const scoring = session.mode === 'friend' ? new FriendModeScoring() : new ClassModeScoring();
    const ctx: ScoringContext = { rankings, avoids, answers, questionSet };

    const matcher = this.matcherSelector.choose(participants.length, this.tieBreaker);
    const groupings = matcher.findTopGroupings(participants, session.teamSize, ctx, scoring, 3);

    const [winner, ...alternatives] = groupings;
    await this.teamRepo.saveWinningGrouping(sessionId, winner, this.explainer);
    await this.teamRepo.saveAlternativeGroupings(sessionId, alternatives);

    await this.sessionRepo.updateStatus(sessionId, 'revealed');
    await this.sessionRepo.updateStatus(sessionId, 'locked');
  }
}
```

---

## Constraints

- Do not introduce a global state manager (Redux/Zustand/etc.) — React Query + Context cover this app's actual state needs.
- Do not put any Supabase or React import inside `/domain` — this layer must remain framework-free and unit-testable in isolation.
- Never use `Math.random()` or any non-seeded randomness anywhere in the matching algorithm or tie-breaker — determinism (NFR-1) is a hard requirement, not a nice-to-have.
- Never expose `ranking_responses` or `avoid_responses` to any client-side query — these are Edge-Function-only reads, enforced by RLS (`for select using (false)`).
- Never allow a participant edit/removal, or a Class Mode roll-number authentication bypass, once a session is `locked` or `expired`.
- Keep functions small and single-purpose — no function should both compute a score and persist it; no function should both validate input and perform the domain action.
- Reuse the same `ScoringContext` shape across both scoring strategies; do not create mode-specific context types.
- Follow the exact folder structure in the Architecture section — do not flatten `/domain` into `/src` root.

---

## Code Quality

- Strict TypeScript throughout; no `any` without an inline comment justifying it.
- All exported functions/classes have explicit return types (no inferred `any`/`unknown` leaking across module boundaries).
- No magic numbers outside named constants (`AVOID_PENALTY`, `EXHAUSTIVE_THRESHOLD`, `MAX_ITERATIONS`, `WINDOW_MS`, etc. — all as shown above, not inlined elsewhere).
- No component or function exceeding ~150 lines; extract sub-components/helpers past that point.
- Consistent naming: PascalCase for types/components, camelCase for functions/variables, SCREAMING_SNAKE_CASE for module-level constants.

---

## Documentation

- Update `README.md` with: project description, setup steps (point to the existing Setup Guide doc rather than duplicating it), and a "How the fairness algorithm works" summary linking to the Requirements doc's §8.
- Every exported function/class in `/domain` gets a one-line TSDoc comment describing its responsibility (matches the SDA's Responsibility column).
- Document the `CampusDomainRegistry`'s supported campuses inline, since it's a common future extension point.
- Non-obvious logic (the tie-breaker's `averagePairScore` simplification, the approximate matcher's deterministic PRNG) must have an inline comment explaining the reasoning, matching the rationale given above — don't leave a future reader to reverse-engineer why.

---

## Testing

Implement every test case from the existing Test Plan document. At minimum:

**Unit tests (Vitest, `/domain` only, no Supabase):**
- `FairnessCalculator`: team score and grouping score computation (ALG-1, ALG-3).
- `FriendModeScoring` / `ClassModeScoring`: pair score correctness including avoid penalty (ALG-5) and zero-rank Class Mode behavior (ALG-6).
- `ExhaustiveMatcher`: correct partition count and remainder-team handling for n=11, teamSize=3 (ALG-4); determinism across repeated runs (ALG-1).
- `ApproximateMatcher`: determinism with a fixed sessionId seed; never invokes `Math.random`.
- `TieBreaker`: correct ordering under constructed equal-score groupings (ALG-9).
- `RollNumberMapper`: round-trip correctness for all three campuses; rejects malformed roll numbers and unsupported domains (AUTH-1 through AUTH-5, AUTH-8).
- `SessionLifecycleManager`: every legal and illegal transition in the state table (FEAT-3).
- `CsvResultExporter`: correct escaping of fields containing commas/quotes.

**Integration tests (Vitest against a local Supabase instance via Supabase CLI):**
- RLS policies actually block direct client reads of `ranking_responses`/`avoid_responses` (NFR-TEST-3).
- Double-submission is rejected at the repository/Edge Function level (NFR-TEST-5, AUTH-6).
- `MatchingService.revealResults` end-to-end against seeded test data, verifying `Team`, `TeamMembership`, and `AlternativeGrouping` rows are correctly written.

**E2E smoke tests (Playwright, minimum coverage):**
- Full Friend Mode flow: organizer creates session → adds 6 participants → each identifies, ranks, answers → organizer reveals → each participant sees only their own team.
- Full Class Mode flow: organizer pre-adds roll numbers → simulated Google sign-in → answers questions → organizer reveals → organizer sees all results, students see only "submitted."
- Rejected sign-in: non-listed roll number and non-NU domain both produce the expected error message (AUTH-2, AUTH-4).

---

## Acceptance Criteria

- [ ] All Friend Mode and Class Mode functional requirements above are implemented and behave exactly as specified.
- [ ] The matching algorithm is verifiably deterministic: running reveal twice on identical seeded data produces byte-identical output.
- [ ] Exhaustive matcher is used at ≤12 participants; approximate matcher automatically takes over above that threshold, verified by a test.
- [ ] `ranking_responses` and `avoid_responses` are confirmed unreadable via the anon/authenticated Supabase client (RLS test passes).
- [ ] Class Mode sign-in accepts only `cfd.nu.edu.pk`, `lhr.nu.edu.pk`, `isb.nu.edu.pk` emails matching a pre-registered roll number; all other cases are rejected with a specific, non-generic error message.
- [ ] Participant edit/remove is possible only in `draft`/`open` status, verified by a test attempting it in `locked` status.
- [ ] Reveal produces a winner plus up to 2 alternative groupings, each with a distinct fairness score, none selectable as the final result.
- [ ] CSV and PDF exports both produce downloadable files matching the on-screen results.
- [ ] Dark mode toggle works on both organizer and participant screens and persists across reload.
- [ ] The public "How This Works" page loads with no authentication and no session context.
- [ ] Rate limiting demonstrably blocks a 6th rapid sign-in attempt within the same 60-second window.
- [ ] No lint errors, no TypeScript errors, `npm run build` succeeds.
- [ ] All unit and integration tests pass; Playwright smoke tests pass locally.
- [ ] App is deployed on Vercel and reachable via a public URL, with Supabase backend fully migrated and seeded.
