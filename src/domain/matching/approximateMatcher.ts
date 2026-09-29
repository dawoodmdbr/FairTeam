import type { Participant } from '../participant';
import type { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import { FairnessCalculator } from './fairnessCalculator';
import { TieBreaker } from './tieBreaker';
import type { Grouping, MatchingAlgorithm, TeamCandidate } from './matchingAlgorithm';

/** Maximum iterations for the hill-climbing local search. */
export const MAX_ITERATIONS = 2000;

/**
 * Approximate matcher: deterministic hill-climbing local search over pairwise swaps.
 * Used when participantCount > EXHAUSTIVE_THRESHOLD (12).
 *
 * Determinism guarantee: uses mulberry32 PRNG seeded by hash(sessionId) — NOT Math.random().
 * Same sessionId always reproduces the same search path and result.
 */
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
    // Deterministic PRNG seed derived from session ID — never from wall-clock or Math.random().
    const seed = deterministicSeed(people[0]?.sessionId ?? '');
    const rng = mulberry32(seed);

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

/** Deterministic hash seed from session ID string. Returns 1 as fallback (never 0). */
function deterministicSeed(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

/**
 * Mulberry32 — deterministic 32-bit PRNG.
 * Same seed always produces the same sequence. Never uses Math.random().
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable, deterministic initial partition: sort by participant ID, chunk sequentially.
 * This ensures the approximate matcher's starting point is reproducible.
 */
function initialPartition(people: Participant[], teamSize: number): TeamCandidate[] {
  const sorted = [...people].sort((a, b) => a.id.localeCompare(b.id));
  const teams: TeamCandidate[] = [];
  for (let i = 0; i < sorted.length; i += teamSize) {
    teams.push({ members: sorted.slice(i, i + teamSize) });
  }
  return teams;
}

function pickTwoDistinctTeamIndices(
  teamCount: number,
  rng: () => number
): [number, number] {
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
