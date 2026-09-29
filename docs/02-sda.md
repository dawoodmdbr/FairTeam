# Software Design & Architecture (SDA) — Fair Team Matcher

**Purpose of this document:** Define the internal architecture, class responsibilities, and applied design principles/patterns precisely enough to implement directly from this file, and to let Claude re-derive the whole design from reading this alone.

---

## 1. Architectural Style

**Layered architecture**, with dependencies pointing inward (Dependency Inversion):

```
Presentation (React components, pages)
        ↓
Application (MatchingService, session orchestration)
        ↓
Domain (Participant, Session, Team, ScoringStrategy, MatchingAlgorithm — pure logic, no framework code)
        ↓
Infrastructure (Supabase repositories, Auth adapter)
```

- **Domain layer has zero dependency on Supabase or React.** It is pure TypeScript — this is what makes the matching algorithm unit-testable without a database and reusable if the backend ever changes.
- **Infrastructure implements domain-defined interfaces** (Repository pattern), never the reverse. This is the Dependency Inversion Principle (SOLID-D) applied at the architecture level.

## 2. Class Diagram

![Class Diagram](class_diagram.png)

## 2.1 Session Lifecycle

![Session Lifecycle](lifecycle_diagram.png)

`SessionLifecycleManager` is the single source of truth for which actions are legal in which state — e.g. `canEdit(session)` returns true only in `draft`/`open`, which is what actually enforces Requirements §6.1 (the participant-editing window) rather than leaving that check scattered across UI code.

## 3. Core Classes & Responsibilities

| Class | Responsibility | GRASP Pattern | SOLID Principle(s) Applied |
|---|---|---|---|
| `MatchingService` | Orchestrates the full flow: create session, add participants, trigger reveal. The only class the UI talks to for these actions. | **Controller** (coordinates use cases), **Facade** (hides subsystem complexity) | SRP (only orchestrates, doesn't compute scores itself), DIP (depends on repository/strategy interfaces, not concrete classes) |
| `QuestionSetProvider` | Given a `Mode` (Friend/Class), returns the correct `QuestionSet`. New question sets can be added without touching any other class. | **Creator** (knows how to make `QuestionSet` objects) | **OCP** — adding a new mode/question set means adding a new provider entry, not editing existing scoring or UI code |
| `ScoringStrategy` (interface) + `FriendModeScoring` / `ClassModeScoring` | Compute `PairScore(A, B)` for two participants. Friend Mode includes ranking points; Class Mode does not. | **Expert** (each strategy has exactly the data it needs to compute its own score) | **OCP** (new scoring rules = new strategy class) + **LSP** (both strategies are fully substitutable behind the same interface) |
| `MatchingAlgorithm` (interface) + `ExhaustiveMatcher` / `ApproximateMatcher` | Given a list of participants and team size, return the grouping with the best `FairnessScore`. | **Expert** | **OCP** + **LSP** — `MatchingService` never needs to know which one is running |
| `MatcherSelector` | Decides, based on participant count, whether to use `ExhaustiveMatcher` or fall back to `ApproximateMatcher`. | **Pure Fabrication** (this decision doesn't naturally belong to any domain object) | SRP — isolates the "which algorithm" decision from the algorithms themselves |
| `FairnessCalculator` | Computes `TeamScore` (average pair score in a team) and `FairnessScore` (MIN across teams) for any candidate grouping. | **Pure Fabrication**, **Expert** (has all pair scores needed) | SRP |
| `TieBreaker` | Given multiple groupings with equal `FairnessScore`, applies the deterministic tie-break rules (Requirements §8.3). | **Pure Fabrication** | SRP |
| `Session`, `Participant`, `Team` | Plain domain entities holding their own data. | **Information Expert** (each knows its own state) | SRP |
| `SessionRepository`, `ParticipantRepository`, `ResponseRepository`, `TeamRepository` (interfaces) + `Supabase*Repository` (implementations) | Persistence boundary. Domain and application code depend only on the interfaces. | **Pure Fabrication**, **Indirection** (decouples domain from Supabase specifics) | **DIP** — swapping Supabase for another DB later only means writing new implementations, zero change to `MatchingService` |
| `AuthGate` (interface) + `SupabaseAuthGate` / `EnvCredentialsAuthGate` | Verifies **organizer** identity before allowing session-management actions. Two implementations because Supabase Auth may or may not be enabled. | **Pure Fabrication** | **OCP**, **DIP** — the app depends on `AuthGate`, not on which auth mechanism is active |
| `ParticipantAuthGate` (interface) + `NameSelectAuthGate` / `GoogleRollNumberAuthGate` | Verifies **participant** identity before allowing submission. Friend Mode uses name selection; Class Mode uses Google sign-in validated against a roll number. | **Expert**, **Pure Fabrication** | **OCP**, **LSP** — `MatchingService` calls the same `authenticate()` method regardless of mode |
| `RollNumberMapper` | Converts between a roll number (`24F-3053`) and its expected university email (`f243053@cfd.nu.edu.pk`), and back. | **Pure Fabrication** | SRP — isolates a fiddly string-format rule from everything else |
| `CampusDomainRegistry` | Small lookup table: campus letter → email domain (`F`→`cfd.nu.edu.pk`, `L`→`lhr.nu.edu.pk`, `I`→`isb.nu.edu.pk`). | **Pure Fabrication** | **OCP** — a new campus is a new data row, not a code change |
| `SessionLifecycleManager` | Owns valid session state transitions (`draft → open → revealed → locked`, or `→ expired`) and rejects any action that doesn't fit the current state (e.g. editing a participant on a locked session). | **State** (GRASP treats this as Pure Fabrication holding the state-machine logic) | SRP — no other class needs to know the full transition table |
| `ResultExporter` (interface) + `CsvResultExporter` / `PdfResultExporter` | Turn a revealed session's results into a downloadable file. | **Pure Fabrication**, **Expert** | **OCP** — a new export format is a new implementation, not a change to `MatchingService` |
| `TeamScoreExplainer` | Produces the human-readable + numeric score breakdown for a team (mutual picks count, avg. question similarity, avoid-penalty impact). | **Pure Fabrication** | SRP — keeps "how do we explain a score" separate from "how do we compute a score" (`FairnessCalculator`) |
| `SessionCloneService` | Duplicates a past session's **configuration only** (mode, team size, question set reference) into a new draft session — no participants, no answers carried over. | **Creator** | SRP |
| `RateLimiter` (interface) + `SupabaseRateLimiter` | Throttles repeated sign-in/identify attempts per identifier (IP or roll number) on public endpoints. | **Pure Fabrication** | **OCP**, **DIP** — swappable rate-limiting backend without touching the auth gates that use it |

## 4. Why These Patterns Solve the Real Requirements

- **Strategy pattern (`ScoringStrategy`, `MatchingAlgorithm`)** exists because the requirements *explicitly* demand two different scoring rules (Friend vs. Class) and two different computation strategies (exhaustive vs. approximate) that must be swappable **without changing the orchestration code**. This directly satisfies "open for extension, closed for modification" from the Requirements doc.
- **Repository pattern** exists because Supabase is an implementation detail, not a domain concept. If the database changes, or if this gets unit-tested in CI without a live database, nothing in `MatchingService` or the scoring/matching classes needs to change.
- **Pure Fabrication classes** (`FairnessCalculator`, `TieBreaker`, `MatcherSelector`) exist because "fairness scoring" and "tie-breaking" aren't naturally the responsibility of any single domain entity (a `Team` shouldn't need to know how to compare itself against other candidate teams) — inventing a class purely for this responsibility keeps `Session`/`Participant`/`Team` simple data holders (high cohesion, low coupling).

## 5. Reveal-Results Flow (Sequence)

![Reveal Flow](sequence_flow.png)

## 5.1 Class Mode Authentication Flow

![Class Mode Auth Flow](auth_flow.png)

`GoogleRollNumberAuthGate` never trusts a roll number the student types — it only trusts the email Google itself returns after OAuth, then derives what roll number *should* produce that email and checks it against the organizer's pre-added list. This ordering (derive-then-check, not check-then-trust-input) is what makes NFR-10 actually enforceable rather than just a UI-level suggestion.

## 6. Data Model (ER Diagram)

![ER Diagram](er_diagram.png)

Notes on the schema:
- `RankingResponse` and `AvoidResponse` self-reference `Participant` (a participant ranks/avoids other participants in the same session) — both are empty tables for any Class Mode session, since ranking doesn't exist there.
- `QuestionDefinition` is keyed by `mode`, which is how the Open/Closed question-set requirement is enforced at the data level: adding a question is an INSERT, not a schema or code change.
- `Team.fairness_score` is stored (not recomputed on every view) so results remain stable and cheap to display after reveal.
- `Participant.name` is used for Friend Mode; `Participant.roll_number` is used for Class Mode. Exactly one of the two is populated, never both, depending on the session's mode.
- `CampusDomain` is a small, rarely-changed reference table, not linked by foreign key from `Participant` — it's read by `RollNumberMapper` at authentication time, not stored per participant.

## 7. Algorithm Module Detail

```
MatcherSelector.choose(participantCount):
    if participantCount <= EXHAUSTIVE_THRESHOLD (tunable, ~12-14):
        return ExhaustiveMatcher
    else:
        return ApproximateMatcher

ExhaustiveMatcher.findTopGroupings(people, teamSize, n=3):
    for each way to partition people into groups of teamSize (remainder as smaller group):
        score = FairnessCalculator.groupingScore(partition)
        track the partition(s) with the highest scores
    return TieBreaker.resolve(top n distinct-scoring partitions)   // [0] = winner, [1..n-1] = alternatives

ApproximateMatcher.findTopGroupings(people, teamSize, n=3):
    start from a reasonable initial partition (e.g. sorted by a stable participant-ID order)
    seed = hash(sessionId)   // deterministic, not time-based
    repeat for a fixed number of iterations (or until no improving swap is found):
        propose a swap of two participants between two teams (order driven by `seed`, not by wall-clock randomness)
        if it improves FairnessScore, keep it
    return the best grouping found plus the best n-1 distinct groupings seen along the way
```

Both matchers return their result through the same `MatchingAlgorithm` interface, so `MatchingService` calls `findTopGroupings()` without knowing or caring which one ran — this is Liskov Substitution in practice, not just in theory. Only result `[0]` becomes the actual `Team`/`TeamMembership` rows; results `[1..n-1]` are stored as `AlternativeGrouping` rows for display only (Requirements §8.5) and are never selectable as the real outcome.

## 8. SOLID Summary (Project-Wide)

| Principle | Where Applied |
|---|---|
| **S**ingle Responsibility | Every class in §3 has exactly one reason to change (listed in its Responsibility column). |
| **O**pen/Closed | `ScoringStrategy`, `MatchingAlgorithm`, `QuestionSetProvider`, `AuthGate` — all extendable by adding new implementations, never by editing existing ones. |
| **L**iskov Substitution | Any `ScoringStrategy`, `MatchingAlgorithm`, or `AuthGate` implementation is fully interchangeable behind its interface — `MatchingService` never branches on which concrete type it has. |
| **I**nterface Segregation | Repository interfaces are split per entity (`SessionRepository`, `ParticipantRepository`, etc.) rather than one giant `DatabaseRepository`, so a class only depends on the methods it actually uses. |
| **D**ependency Inversion | `MatchingService` and all domain logic depend on interfaces (`*Repository`, `ScoringStrategy`, `MatchingAlgorithm`, `AuthGate`), never on Supabase or React directly. |

## 9. Folder Structure (maps directly to the layers above)

```
/src
  /domain
    session.ts, participant.ts, team.ts
    scoring/
      scoringStrategy.ts (interface)
      friendModeScoring.ts
      classModeScoring.ts
    matching/
      matchingAlgorithm.ts (interface)
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
      participantAuthGate.ts (interface)
      nameSelectAuthGate.ts
      googleRollNumberAuthGate.ts
      rollNumberMapper.ts
      campusDomainRegistry.ts
      rateLimiter.ts (interface)
    session/
      sessionLifecycleManager.ts
      sessionCloneService.ts
    export/
      resultExporter.ts (interface)
      csvResultExporter.ts
      pdfResultExporter.ts
      teamScoreExplainer.ts
  /application
    matchingService.ts
  /infrastructure
    supabase/
      supabaseSessionRepository.ts
      supabaseParticipantRepository.ts
      supabaseResponseRepository.ts
      supabaseTeamRepository.ts
      supabaseAuthGate.ts
      supabaseGoogleOAuthAdapter.ts (wraps Supabase Auth's Google provider)
      supabaseRateLimiter.ts
    envAuthGate.ts
  /repositories (interfaces only)
    sessionRepository.ts
    participantRepository.ts
    responseRepository.ts
    teamRepository.ts
    authGate.ts
  /ui
    pages/, components/
```

## 10. Traceability
- Implements Requirements §8 (algorithm), §10 (data model), §5 (mode differences).
- Consumed by Test Plan (each class here maps to a unit-test target) and Setup Guide (folder structure above is what gets scaffolded).
