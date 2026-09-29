# Requirements Document — Fair Team Matcher

**Project type:** Personal/CV pet project
**Author:** Mian
**Purpose of this document:** Define what the system must do, precisely enough that Claude (or Mian, months later) can pick this up cold and know exactly what to build, without re-deriving decisions already made.

---

## 1. Problem Statement

In a friend group forming FYP (Final Year Project) teams, everyone wants the strongest coder on their team, but only two people can have him per team. Existing tools either randomize (which feels arbitrary) or need a "captain" system (which concentrates power unfairly). There is no tool that forms teams **fairly**, using what people actually want and how they actually work, without ranking anyone's skill.

A second, related use case: a Teaching Assistant needs to split a class of up to 50 students into balanced groups based on compatibility (working style, interests), without letting students rank each other and without the TA manually guessing who fits with whom.

## 2. Goals

- Form teams without randomness — every result must be explainable and reproducible from the same inputs.
- Never rate or rank anyone's skill or ability.
- No single person (a "captain") controls team formation.
- Fairness is measured mathematically: the worst-off team is made as good as possible, not the average team.
- Same core engine serves two real use cases: a friend group (Friend Mode) and a class (Class Mode).

## 3. Scope

### 3.1 In Scope
- Two modes: **Friend Mode** and **Class Mode** (see Section 5).
- A private ranking system (Friend Mode only).
- A compatibility-questions engine, with a different question set per mode.
- An optimization algorithm that forms the fairest possible grouping, and surfaces the top 2-3 alternative groupings (not just the winner) for transparency.
- An organizer-facing dashboard (create session, monitor progress, reveal results, view history, duplicate a past session, export results).
- Editing/removing a participant before a session locks.
- A per-team score breakdown (what drove the score — mutual picks, question similarity) shown alongside results.
- A participant-facing flow (identify self, answer questions, view result).
- A public, static "How This Works" page explaining the no-randomness/no-skill-rating philosophy.
- Dark mode.
- Basic rate-limiting/anti-abuse on the public sign-in endpoints.
- Deployment as a live, shareable web app (Vercel).

### 3.2 Out of Scope (for v1)
- Manual team **swapping** after results are revealed (participant edits/removals *before* lock are in scope — see above).
- Multi-organizer / multi-tenant support (one organizer per deployment is assumed for v1, though the schema should not actively prevent more later).
- Editing answers after submission.
- Any skill/competency rating of any participant.
- Notifications (email/SMS) — the shareable link is the only distribution mechanism.
- **ML-based weight learning** (using post-project feedback to tune the compatibility formula) — a good future extension, deliberately deferred and not part of v1.

## 4. Actors

| Actor | Description |
|---|---|
| **Organizer** | Creates a session, adds people, configures mode/team size, monitors progress, reveals results. Logs in (Supabase Auth if available, else env-based hardcoded credentials). |
| **Participant (Friend Mode)** | A friend added to a session. Opens the link, selects their own name from a dropdown, ranks teammates, optionally marks people to avoid, answers questions, then sees their own team and result reasoning. |
| **Student (Class Mode)** | A student pre-added to a session by roll number. Opens the link, signs in with their NU Google account (no name selection), answers questions only (no ranking). Does not see results — only the organizer does. |

### 4.1 Use Case Diagram

![Use Case Diagram](usecase.png)

## 5. Modes

### 5.1 Friend Mode
- Organizer manually adds each participant's name.
- Team size is **fixed at 3**. If the group size isn't divisible by 3, the remainder forms one smaller team (e.g. 11 people → three teams of 3 and one team of 2).
- Each participant privately:
  - Ranks their top 3–5 preferred teammates (minimum 3, maximum 5). Ranking is **mandatory** — no skipping.
  - Optionally marks people they'd prefer to avoid (soft penalty, never a hard exclusion rule).
  - Answers the Friend Mode compatibility questions (Section 7.1). All questions are mandatory.
- After reveal, each participant sees **their own team only**, plus a short explanation (e.g. "You and Sara picked each other," "High compatibility on work hours and role interest") and the team's fairness/balance score.

### 5.2 Class Mode
- Organizer (the TA) pre-adds students **by roll number only** — no names, no email typing. Entry is via a fast, low-friction form:
  - **Batch** (2 digits, e.g. `24`) and **Campus** (1 letter: `F`, `L`, or `I`) fields persist across entries.
  - **Roll Number** (exactly 4 digits) is typed and confirmed with Enter, which adds it to a running list (with a remove option) and clears just that field — Batch and Campus stay filled in for the next entry.
  - Each roll number (e.g. `24F-3053`) deterministically maps to exactly one expected university email (Section 5.2.1).
- Organizer sets team size (not fixed — any size the organizer chooses).
- Supports up to 50 participants.
- No ranking exists in this mode.
- **Identification is via Google Sign-In**, restricted to NUCES (NU) email domains only. A student authenticates with Google; the system derives their roll number from the authenticated email and checks it against the organizer's pre-added list. If there's no match (wrong roll number, wrong campus, or a non-NU email), the sign-in is **rejected with a clear error message** — no anonymous or unlisted student can submit.
- Each student answers the Class Mode compatibility questions (Section 7.2). All mandatory. No name is collected or needed — the roll number is the sole identifier.
- Only the **organizer** ever sees results — raw per-student answers, the final groups, and the fairness score. Students see nothing after submitting.
- Same no-double-submission rule as Friend Mode (NFR-6) applies, keyed by roll number.

#### 5.2.1 Roll Number ↔ Email Mapping
Format: `<2-digit batch><campus letter>-<4-digit roll number>` (e.g. `24F-3053`).

Derived university email: `<campus letter, lowercase><batch><roll number>@<campus domain>` (e.g. `24F-3053` → `f243053@cfd.nu.edu.pk`).

| Campus Letter | Domain |
|---|---|
| `F` | `cfd.nu.edu.pk` (Chiniot-Faisalabad) |
| `L` | `lhr.nu.edu.pk` (Lahore) |
| `I` | `isb.nu.edu.pk` (Islamabad) |

This mapping is data-driven (a small lookup table), not hardcoded logic — adding a new campus later means adding a row, not changing code (see SDA, `CampusDomainRegistry`). Only these three campuses are supported for now; any other domain (including other NU subdomains not listed here, and all non-NU emails) is rejected.

## 6. Session Flow (both modes)

1. Organizer logs in and creates a session, choosing Friend Mode or Class Mode. This choice locks in which question set loads and whether ranking is collected. A session starts in **draft** status.
2. Organizer adds participants (manual entry for Friend Mode; fast roll-number entry for Class Mode). While the session is still in draft/open status (i.e., **before it locks**), the organizer can **edit or remove** a participant to fix mistakes — this is not possible once the session locks (Section 6.2).
3. Organizer shares the single session link with the group. Session status moves to **open**.
4. Each participant opens the link and identifies themselves:
   - **Friend Mode:** selects their own name from a dropdown (no login, no password).
   - **Class Mode:** signs in with their NU Google account; the system validates it against the pre-added roll number list (Section 5.2.1) and rejects anything that doesn't match.
5. Participant answers all required questions (+ ranking/avoid, if Friend Mode). No skipping allowed. No editing after submit.
6. Organizer's dashboard shows **live submission status** ("8 of 12 submitted") before reveal.
7. Organizer clicks **Reveal**. The algorithm runs and results are computed, including the winning grouping and the next 2-3 best alternative groupings (Section 8.5) for transparency. Session status moves to **revealed**, and then **locks** — no further participant edits, no manual swaps.
8. Results are shown per mode's visibility rule (Section 5.1 / 5.2), including each team's score breakdown (Section 8.6).
9. Organizer can **export results** (CSV or PDF) at any point after reveal (Section 9, NFR-11).
10. The session (config + anonymized-or-not answers, depending on mode + final grouping) is stored in Supabase and appears in the organizer's **Past Sessions** list. From there, the organizer can also **duplicate** a session's configuration (mode, team size, question set) to start a new one without re-entering setup from scratch (Section 6.3).

### 6.1 Participant Editing Window
Editing or removing a participant is only allowed while the session has **not yet locked** (i.e., before Reveal). This avoids the inconsistent state of changing who's in a session after people have already answered questions about their (now different) group of peers.

### 6.2 Session Lifecycle States
```
draft → open → revealed → locked
                  ↘ expired (if configured to auto-expire after a period of inactivity)
```
- **draft:** organizer is still adding participants; link not yet shared meaningfully (or shared but nothing depends on immutability yet).
- **open:** link is live, participants are submitting.
- **revealed:** algorithm has run, results exist.
- **locked:** the terminal, immutable state after reveal — no edits, no swaps, ever.
- **expired:** an old, never-revealed session that has aged out (Section 9, NFR-13) — mainly a safeguard against a forgotten open link being used long after the fact.

### 6.3 Session Duplication
The organizer can duplicate a past session's **configuration only** (mode, team size, question set reference) into a brand-new draft session with no participants and no answers carried over. This exists purely to save setup time for a recurring use case (e.g. a TA running the same Class Mode format every semester), not to clone actual student/friend data.

## 7. Compatibility Questions

Both question sets must be defined in a way that's **open for extension, closed for modification** — new questions can be added to either set without changing the scoring engine's code (see SDA, Section on the Strategy/Open-Closed design for `QuestionSet`).

### 7.1 Friend Mode Question Set (draft, editable)
| Question | Type | Scoring use |
|---|---|---|
| Weekly hours available for the project | Single choice: 0–5 / 5–10 / 10–15 / 15+ | Numeric bucket similarity |
| Work rhythm: early starter vs. last-minute pusher | Scale 1–5 | Numeric similarity |
| Most active hours | Single choice: Morning / Afternoon / Evening / Night | Exact-match bonus |
| Communication style: calls/meetings vs. async text | Scale 1–5 | Numeric similarity |
| Planning style: detailed task boards vs. figure-it-out-as-you-go | Scale 1–5 | Numeric similarity |
| Conflict handling: speaks up immediately vs. avoids confrontation | Scale 1–5 | Numeric similarity |
| Preferred role(s) | Multi-select, ranked: Frontend / Backend / Design / Docs / Testing / Management | Overlap/complement scoring |
| Topic interest | Multi-select: Web / Mobile / AI / ERP / Other | Overlap scoring |

### 7.2 Class Mode Question Set (draft, editable — deliberately different from Friend Mode)
| Question | Type | Scoring use |
|---|---|---|
| Weekly hours available for coursework project | Single choice: 0–5 / 5–10 / 10–15 / 15+ | Numeric bucket similarity |
| Prefers coding vs. testing vs. documentation | Multi-select, ranked | Complementary-role scoring |
| Prefers leading vs. following in a group | Scale 1–5 | Numeric similarity |
| Prior experience/comfort level in this course's subject area | Scale 1–5 | Numeric similarity (self-reported comfort, **not** a skill/grade rating) |
| Preferred meeting style: in-person vs. online | Single choice | Exact-match bonus |
| Work rhythm: early starter vs. last-minute pusher | Scale 1–5 | Numeric similarity |

> Note: "Prior experience/comfort level" is a self-reported comfort rating, not an instructor-assigned skill score — it stays consistent with the "no skill rating" rule because it is the student's own self-perception, used only to find people with a similar (or intentionally different, if you tune it later) comfort level, never to rank students against each other.

## 8. Fairness & Matching Algorithm Requirements

### 8.1 Pairwise Compatibility Score
```
PairScore(A, B) = RankPoints(A,B) + QuestionSimilarity(A,B) − AvoidPenalty(A,B)
```
- `RankPoints`: points by rank position if ranked (1st=5, 2nd=4, 3rd=3, 4th=2, 5th=1, unranked=0), summed across both directions (mutual ranking scores higher than one-sided). Always 0 in Class Mode.
- `QuestionSimilarity`: normalized 0–10 score from scale-question closeness + multi-select overlap.
- `AvoidPenalty`: fixed subtraction (default 8 points, configurable) if either party marked "avoid" on the other. Never a hard exclusion.

### 8.2 Team & Grouping Score
```
TeamScore(team) = average(PairScore) over all pairs in the team
FairnessScore(grouping) = MIN(TeamScore) across all teams in the grouping
```
The algorithm searches for the grouping that **maximizes FairnessScore** — i.e., makes the worst team as strong as possible, rather than maximizing the average.

### 8.3 Tie-Breaking (must be deterministic — no randomness anywhere)
1. Prefer the grouping with the fewest participants who got **zero fulfilled ranking choices**.
2. If still tied, prefer the grouping with the higher overall average PairScore.
3. If still tied, prefer the grouping that is lexicographically first by participant ID order (a fixed, arbitrary but deterministic final tiebreaker).

### 8.4 Computation Strategy
- **Exhaustive search** (try every possible grouping) is used first. This is only feasible for small participant counts.
- When exhaustive search is not feasible within a reasonable time budget, the system **automatically falls back to an approximate optimization method** (e.g., simulated annealing or local search / hill-climbing over swaps) that still respects the same FairnessScore objective and remains deterministic given a fixed seed derived from the session ID (not true randomness — same session always reproduces the same result).
- Target range: exhaustive works comfortably for ~6–14 participants; must work correctly (via fallback) up to 50.

### 8.5 Alternative Groupings (Transparency)
At reveal time, the system computes and stores not just the winning grouping but the **next 2-3 best distinct groupings** by FairnessScore (using the same tie-break rules to order them). These are shown to the organizer (both modes) so the result doesn't look like an arbitrary black box — a skeptical participant can see the winning grouping actually was the best of several real candidates, not the only one considered. Alternatives are for display only; the organizer cannot select an alternative to replace the actual result (that would reintroduce manual control, which Section 3.2 explicitly excludes).

### 8.6 Score Breakdown (Explainability)
Each revealed team is shown with a short, plain-language breakdown of what drove its FairnessScore, e.g.:
- Number of mutual ranking picks within the team (Friend Mode only)
- Average question similarity across the team's pairs
- Whether any "avoid" penalty was present and how it affected the outcome
This is the numeric/visual backing for the "why" explanation already required for Friend Mode participants (Section 5.1) and is shown to the organizer in both modes.

## 9. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Matching must be fully deterministic: same inputs → same output, always. |
| NFR-2 | No participant's raw skill or ability is ever measured, stored, or displayed. |
| NFR-3 | Friend Mode rankings are private — never shown to anyone, including the organizer, in raw form (only aggregated into scores). |
| NFR-4 | Class Mode raw answers are visible only to the organizer. |
| NFR-5 | The system must work for group sizes from ~6 up to 50. |
| NFR-6 | No participant can submit twice or edit after submitting. |
| NFR-7 | No question may be skipped. |
| NFR-8 | The app is deployed and publicly reachable via a shareable link (Vercel). |
| NFR-9 | Organizer actions (create session, add people, reveal) require organizer authentication. |
| NFR-10 | Class Mode sign-in accepts only Google accounts on `cfd.nu.edu.pk`, `lhr.nu.edu.pk`, or `isb.nu.edu.pk`, and only when the derived roll number is on the organizer's pre-added list. All other sign-ins are rejected with an explicit error message. |
| NFR-11 | The organizer can export a revealed session's results (teams, scores, breakdowns) as CSV and as PDF. |
| NFR-12 | The public sign-in/identify endpoints (both modes) are rate-limited to prevent abuse (e.g. repeated bogus Google sign-in attempts or dropdown-identity spam). |
| NFR-13 | A session that is opened but never revealed automatically moves to an **expired** state after a configurable period of inactivity, and can no longer accept submissions. |
| NFR-14 | The UI supports both light and dark mode. |
| NFR-15 | A public, unauthenticated "How This Works" page exists, requiring no login and no session context. |

## 10. Data Model (summary — full detail in SDA)
- `Session` (mode, team_size, status [draft/open/revealed/locked/expired], created_by, created_at, expires_at)
- `Participant` (session_id, name [Friend Mode] / roll_number [Class Mode], is_editable_until_locked)
- `CampusDomain` (letter, domain) — lookup table for `F`/`L`/`I` → NU campus email domains
- `RankingResponse` (Friend Mode only: participant_id, ranked_participant_id, position)
- `AvoidResponse` (Friend Mode only, optional: participant_id, avoided_participant_id)
- `QuestionResponse` (participant_id, question_id, answer_value)
- `QuestionDefinition` (mode, question_text, type, options) — the "open for extension" question sets
- `Team` (session_id, team_number, fairness_score, score_breakdown_json)
- `TeamMembership` (team_id, participant_id)
- `AlternativeGrouping` (session_id, rank, fairness_score, teams_summary_json) — the 2nd/3rd-best groupings, for display only
- `RateLimitAttempt` (identifier [IP or roll number], endpoint, attempted_at) — supports NFR-12

## 11. Assumptions & Constraints
- No participant identity verification beyond name selection — honesty of the group is assumed. This is a known, documented trade-off (see Design & UI doc, "Known Limitations").
- One organizer per deployment for v1; schema doesn't hard-block more later.
- Stack: React, TypeScript, Vite, Tailwind CSS, Supabase (DB + Auth), deployed on Vercel.

## 12. Traceability to Other Documents
- **SDA doc** — implements Sections 8, 10 as classes/modules with SOLID + GRASP.
- **Design & UI doc** — implements Sections 4, 6 as actual screens/wireframes.
- **Test Plan** — derives test cases directly from Sections 5, 7, 8, 9.
- **Setup Guide** — operational instructions to run what this document specifies.
