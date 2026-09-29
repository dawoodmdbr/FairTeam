# Test Plan — Fair Team Matcher

**Purpose of this document:** A concrete set of test cases derived directly from the Requirements doc, so correctness (especially of the matching algorithm) can be verified and re-verified after any change.

---

## 1. Test Levels

| Level | What it covers | Notes |
|---|---|---|
| **Unit tests** | Domain layer: `ScoringStrategy` implementations, `FairnessCalculator`, `TieBreaker`, `MatchingAlgorithm` implementations | No database or network needed — this is the payoff of keeping the domain layer pure (SDA §1) |
| **Integration tests** | Repositories against a real/local Supabase instance; `MatchingService` end-to-end with real repositories | Verifies persistence and orchestration together |
| **Manual/E2E tests** | Full user flows in a browser: organizer creating a session, participants submitting, reveal, result visibility | Since there's no CI requirement for this pet project, these can be run manually before each deploy |

## 2. Core Algorithm Test Cases

| ID | Scenario | Input | Expected Result |
|---|---|---|---|
| ALG-1 | Deterministic output | Run the same session's matching twice with identical data | Both runs produce byte-identical groupings and scores |
| ALG-2 | Everyone ranks the same person first | 6 people, all rank Person X as #1 | X ends up on the team whose other members X *also* ranked highly and/or has strong question compatibility with — not an arbitrary pair |
| ALG-3 | Perfect mutual match exists | 3 people who all rank each other #1 and have identical question answers | They are grouped together with the maximum possible FairnessScore |
| ALG-4 | Group not divisible by 3 (Friend Mode) | 11 participants | Output is 3 teams of 3 + 1 team of 2; the team of 2 is not penalized to an unreasonably low score purely for being smaller |
| ALG-5 | Avoid list respected (soft) | A and B mark each other as "avoid," but are otherwise highly compatible with no one else | A and B end up separated *if* a comparable-quality alternative grouping exists; the system does not crash or produce an invalid grouping if avoiding is impossible |
| ALG-6 | No ranking submitted at all (Class Mode or an all-skip Friend Mode edge case) | RankPoints = 0 for all pairs | Matching falls back to pure QuestionSimilarity and still produces a valid, deterministic grouping |
| ALG-7 | Exhaustive vs. approximate threshold | Run with participant count just below and just above `EXHAUSTIVE_THRESHOLD` | Below: `ExhaustiveMatcher` is used. Above: `MatcherSelector` switches to `ApproximateMatcher` automatically |
| ALG-8 | 50-participant Class Mode | 50 synthetic participants, Class Mode question answers only | Completes in a reasonable time (define a target, e.g. under 30 seconds) and returns a valid grouping with no participant omitted or duplicated |
| ALG-9 | Tie-break determinism | Construct two groupings with intentionally equal FairnessScore | The same grouping is chosen every time, per the documented tie-break order (Requirements §8.3) |
| ALG-10 | Organizer-set team size (Class Mode) | Team size = 4, 20 participants | Produces 5 teams of 4, no leftovers; if not evenly divisible, same "smaller last team" rule as Friend Mode applies |

## 3. Class Mode Authentication Test Cases

| ID | Scenario | Expected Result |
|---|---|---|
| AUTH-1 | Valid roll number, correct campus | Organizer pre-adds `24F-3053`; student signs in as `f243053@cfd.nu.edu.pk` | Sign-in succeeds, participant identified as `24F-3053` |
| AUTH-2 | Roll number not pre-added | Student signs in with a valid-format NU email whose derived roll number isn't on the list | Rejected with a clear error message; no participant record created |
| AUTH-3 | Wrong campus for a listed roll number | `24F-3053` is pre-added, but sign-in comes from `f243053@lhr.nu.edu.pk` | Rejected — campus in the email must match the campus in the pre-added roll number |
| AUTH-4 | Non-NU email | Student attempts sign-in with a Gmail or other non-NU address | Rejected — domain not in `{cfd.nu.edu.pk, lhr.nu.edu.pk, isb.nu.edu.pk}` |
| AUTH-5 | Unsupported NU campus | Email from an NU subdomain other than cfd/lhr/isb | Rejected — only the three configured campuses are accepted |
| AUTH-6 | Double sign-in attempt | Same roll number tries to sign in and submit twice | Second attempt blocked (same rule as NFR-6, keyed by roll number instead of name) |
| AUTH-7 | Fast entry UI correctness | Organizer sets Batch=`24`, Campus=`F`, enters Roll=`3053`, hits Enter, then Roll=`3054`, hits Enter | Both `24F-3053` and `24F-3054` appear in the running list; Batch and Campus remain unchanged between entries |
| AUTH-8 | Roll number field validation | Organizer types a 3-digit or 5-digit roll number | Rejected/flagged — roll number must be exactly 4 digits |
| AUTH-9 | Friend Mode unaffected | Run a Friend Mode session end-to-end | Name-dropdown identification still works exactly as before; no Google sign-in involved |

## 4. New Feature Test Cases

| ID | Scenario | Expected Result |
|---|---|---|
| FEAT-1 | Edit participant before lock | Organizer edits a Friend Mode name (or Class Mode roll number) while session is `open` | Change is saved; no orphaned responses from the old value |
| FEAT-2 | Remove participant before lock | Organizer removes a participant who hasn't submitted yet | Participant and any partial data removed cleanly; submission counter updates |
| FEAT-3 | Edit/remove blocked after lock | Organizer attempts to edit/remove a participant after reveal | Rejected — `SessionLifecycleManager.canEdit()` returns false once `locked` |
| FEAT-4 | Duplicate session | Organizer duplicates a past Class Mode session | New draft session created with same mode, team size, and question set reference; zero participants and zero answers carried over |
| FEAT-5 | Export CSV | Organizer exports a revealed session | CSV contains all teams, members, and fairness scores; opens correctly in a spreadsheet app |
| FEAT-6 | Export PDF | Organizer exports a revealed session | PDF is generated and downloadable, matching the on-screen results |
| FEAT-7 | Alternative groupings shown | Reveal a session with a clear best grouping and at least one meaningfully different near-best grouping | Exactly the winning grouping plus up to 2 alternatives are shown, each with a distinct fairness score, ordered best to worst |
| FEAT-8 | Alternative groupings not selectable as final | Attempt to promote an alternative grouping to be the "real" result | No such action exists — alternatives are display-only (Requirements §8.5) |
| FEAT-9 | Score breakdown accuracy | Compare a team's displayed breakdown (mutual picks, avg similarity) against manually calculated values from raw data | Displayed numbers match the manual calculation |
| FEAT-10 | Session expiry | An `open` session with no reveal action sitting past the configured inactivity window | Session automatically transitions to `expired`; further submissions are rejected |
| FEAT-11 | Dark mode toggle | Toggle dark mode on a participant-facing and an organizer-facing screen | Theme switches correctly on both; preference persists on reload |
| FEAT-12 | Public info page accessible without auth | Visit the "How This Works" page while logged out and with no session context | Page loads normally, no login prompt, no session data required or shown |
| FEAT-13 | Rate limiting on sign-in | Rapidly repeat failed Class Mode sign-in attempts from the same identifier | Further attempts are throttled/blocked per `RateLimiter`, with a clear message rather than a silent failure |

## 5. Session & Flow Test Cases

| ID | Scenario | Expected Result |
|---|---|---|
| FLOW-1 | Organizer creates a Friend Mode session | Session stored with mode locked, correct team size (3), shareable link generated |
| FLOW-2 | Organizer creates a Class Mode session with uploaded list | All uploaded names/roll numbers appear as participants; organizer-set team size stored |
| FLOW-3 | Participant selects a name already marked as submitted | Rejected — cannot resubmit or impersonate an already-submitted participant |
| FLOW-4 | Participant tries to skip a question | Blocked — "Next"/"Submit" stays disabled until every question (and ranking, if Friend Mode) is answered |
| FLOW-5 | Organizer views live monitor before all submit | Correct "X of Y submitted" count, updates as more people submit |
| FLOW-6 | Organizer reveals with some participants still not submitted | Reveal proceeds (not blocked); only submitted participants are included in matching |
| FLOW-7 | Friend Mode result visibility | Each participant sees only their own team + reasoning; cannot view other teams |
| FLOW-8 | Class Mode result visibility | Students see only a generic "submitted" confirmation; only the organizer sees full results and raw answers |
| FLOW-9 | Organizer attempts a manual swap after reveal | Not possible — no such control exists in the UI (Requirements §3.2, out of scope) |
| FLOW-10 | Past Sessions list | A previously revealed session appears in the organizer's dashboard with correct status |

## 6. Non-Functional Test Cases

| ID | Requirement Tested | How to Verify |
|---|---|---|
| NFR-TEST-1 | NFR-1 (determinism) | Same as ALG-1 |
| NFR-TEST-2 | NFR-2 (no skill rating) | Code review + data model check: confirm no field anywhere stores a skill/ability value |
| NFR-TEST-3 | NFR-3 (rankings private) | Attempt to fetch another participant's raw ranking via the organizer or another participant's session — must be inaccessible (enforced by Supabase row-level security policy) |
| NFR-TEST-4 | NFR-4 (Class Mode answers organizer-only) | Attempt to fetch raw answers as a student — must be inaccessible |
| NFR-TEST-5 | NFR-6 (no double submit / no edit) | Try submitting twice from the same participant identity — second attempt rejected |
| NFR-TEST-6 | NFR-7 (no skipping) | Same as FLOW-4 |
| NFR-TEST-7 | NFR-9 (organizer auth required) | Attempt session-management actions (create, add participants, reveal) while logged out — must be rejected |
| NFR-TEST-8 | NFR-10 (Class Mode domain/roll-number restriction) | Same as AUTH-2 through AUTH-5 above |
| NFR-TEST-9 | NFR-11 (export) | Same as FEAT-5, FEAT-6 |
| NFR-TEST-10 | NFR-12 (rate limiting) | Same as FEAT-13 |
| NFR-TEST-11 | NFR-13 (session expiry) | Same as FEAT-10 |
| NFR-TEST-12 | NFR-14 (dark mode) | Same as FEAT-11 |
| NFR-TEST-13 | NFR-15 (public info page) | Same as FEAT-12 |

## 7. Edge Cases Worth Explicit Coverage
- Minimum viable session: 3 participants (Friend Mode) → exactly one team.
- A participant ranks fewer than the 3 minimum → should be blocked at submission (ranking is mandatory, min 3).
- A participant tries to rank themselves → must be prevented/filtered out.
- Duplicate names in a Class Mode upload → organizer should be warned; system should not silently merge two different students into one participant record.

## 8. Traceability
Every test ID above maps back to a specific Requirements or SDA section, so a failing test always points to exactly which design decision it's checking.
