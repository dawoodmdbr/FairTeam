# Fair Team Matcher

> **Mathematical fairness without captains or skill ranking.**

Fair Team Matcher is a pair-programming and team-formation web application designed to split groups into balanced teams without using random shuffling, without concentrated organizer power ("captains"), and without rating or ranking anyone's skill.

It serves two real-world use cases:
1. **Friend Mode:** Final Year Project (FYP) and hackathon friend groups. Fixed team size of 3 (remainders form one team of 2). Includes private teammate rankings (3–5 choices), optional soft-penalty avoid lists, and working-style compatibility questions.
2. **Class Mode:** Course instructors and Teaching Assistants splitting classes of up to 50 students into balanced groups. Configurable team size. Fast roll-number registration and verified Google OAuth authentication against FAST-NUCES campus domains (`cfd.nu.edu.pk`, `lhr.nu.edu.pk`, `isb.nu.edu.pk`). Raw answers and groupings are visible strictly to the course organizer.

---

## Architectural Principles & Clean Code

- **Layered Architecture with Dependency Inversion:** The `/domain` layer contains zero framework imports (no React, no Supabase, no external state libraries).
- **Strategy Pattern:** Scoring (`FriendModeScoring` vs `ClassModeScoring`) and Matching (`ExhaustiveMatcher` vs `ApproximateMatcher`) are interchangeable behind pure interfaces.
- **Strict Determinism:** Matching algorithms never use `Math.random()`. Search paths and tie-breakers are 100% deterministic (using `mulberry32` PRNG seeded by session ID).
- **Cryptographic Row-Level Security (RLS):** Private rankings and avoid responses have `for select using (false)` policies—preventing any client from reading raw peer ranking data.
- **Derive-Then-Check Auth:** Google accounts are verified server-side, mapped to expected roll numbers, and matched against pre-registered participant rosters.

---

## How the Fairness Algorithm Works

1. **Pairwise Compatibility Score:**
   $$\text{PairScore}(A, B) = \text{RankPoints}(A,B) + \text{QuestionSimilarity}(A,B) - \text{AvoidPenalty}(A,B)$$
   - $\text{RankPoints}$: 1st=5, 2nd=4, 3rd=3, 4th=2, 5th=1, unranked=0 (summed across both directions; always 0 in Class Mode).
   - $\text{QuestionSimilarity}$: Normalized 0–10 score across scale closeness, single-choice exact matches, and multi-select Jaccard overlap.
   - $\text{AvoidPenalty}$: Configurable subtraction (default 8 points) if either marked the other to avoid.

2. **Team & Grouping Score (Maximin Objective):**
   $$\text{TeamScore}(\text{team}) = \text{average}(\text{PairScore}) \text{ over all pairs in the team}$$
   $$\text{FairnessScore}(\text{grouping}) = \min_{\text{team} \in \text{grouping}} \text{TeamScore}(\text{team})$$
   The engine maximizes the **minimum** team score, guaranteeing the weakest team is as strong as possible.

3. **Deterministic Tie-Breaking:**
   1. Fewest participants with zero fulfilled ranking choices.
   2. Higher overall average pair score.
   3. Fixed lexicographic order by participant ID.

4. **Exhaustive vs. Approximate Matching:**
   - $\le 12$ participants: `ExhaustiveMatcher` evaluates all partitions.
   - $> 12$ participants: `ApproximateMatcher` executes deterministic hill-climbing local search over pairwise swaps.

---

## Supported Campuses (Class Mode)

Configured in `CampusDomainRegistry`:
- `F` $\rightarrow$ `cfd.nu.edu.pk` (Chiniot-Faisalabad)
- `L` $\rightarrow$ `lhr.nu.edu.pk` (Lahore)
- `I` $\rightarrow$ `isb.nu.edu.pk` (Islamabad)

---

## Local Setup & Development

See [`docs/05-setup-guide.md`](docs/05-setup-guide.md) for detailed credentials setup.

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and add your Supabase credentials:
```bash
cp .env.example .env.local
```

### 3. Run Locally
```bash
npm run dev
```

### 4. Run Quality Checks & Tests
```bash
npm run typecheck   # TypeScript strict type check
npm run lint        # ESLint flat config verification
npm test            # Vitest unit test suite (domain layer)
npm run test:integration # Vitest integration test suite
npm run build       # Vite production bundle build
```

---

## License

MIT
