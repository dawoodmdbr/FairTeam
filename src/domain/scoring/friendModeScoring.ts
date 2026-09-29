import type { Participant } from '../participant';
import type { ScoringContext, ScoringStrategy } from './scoringStrategy';

/** Points awarded by rank position (index 0 = 1st choice = 5 pts). */
const RANK_POINTS = [5, 4, 3, 2, 1] as const;

/** Fixed penalty subtracted when either party in a pair marked the other as "avoid". */
export const AVOID_PENALTY = 8;

/** Friend Mode scoring: includes ranking points, question similarity, and avoid penalty.
 * Implements ScoringStrategy for Friend Mode sessions. */
export class FriendModeScoring implements ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number {
    let score = 0;

    // Ranking points — sum both directions so mutual ranking scores higher.
    const rankAB = ctx.rankings.find(
      (r) => r.participantId === a.id && r.rankedParticipantId === b.id
    );
    const rankBA = ctx.rankings.find(
      (r) => r.participantId === b.id && r.rankedParticipantId === a.id
    );
    if (rankAB) score += RANK_POINTS[rankAB.position - 1] ?? 0;
    if (rankBA) score += RANK_POINTS[rankBA.position - 1] ?? 0;

    score += questionSimilarity(a, b, ctx);

    // Avoid penalty — soft, never a hard exclusion.
    const avoided = ctx.avoids.some(
      (av) =>
        (av.participantId === a.id && av.avoidedParticipantId === b.id) ||
        (av.participantId === b.id && av.avoidedParticipantId === a.id)
    );
    if (avoided) score -= AVOID_PENALTY;

    return score;
  }
}

/**
 * Computes normalized question similarity (0–10 per question, averaged across all questions)
 * between two participants. Shared by both scoring strategies.
 *
 * - scale: 1-diff/maxDiff * 10
 * - single_choice: exact match = 10, mismatch = 0
 * - multi_select: Jaccard overlap * 10
 */
export function questionSimilarity(
  a: Participant,
  b: Participant,
  ctx: ScoringContext
): number {
  const aAnswers = ctx.answers.filter((ans) => ans.participantId === a.id);
  const bAnswers = ctx.answers.filter((ans) => ans.participantId === b.id);
  let total = 0;
  let scoredCount = 0;

  for (const question of ctx.questionSet.questions) {
    const aVal = aAnswers.find((x) => x.questionId === question.id)?.value;
    const bVal = bAnswers.find((x) => x.questionId === question.id)?.value;
    if (aVal === undefined || bVal === undefined) continue;

    scoredCount++;
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

  const questionCount = scoredCount || 1;
  return total / questionCount; // average normalized similarity across questions
}
