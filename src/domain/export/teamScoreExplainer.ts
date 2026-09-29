import type { Participant } from '../participant';
import type { ScoringContext } from '../scoring/scoringStrategy';
import type { TeamCandidate } from '../matching/matchingAlgorithm';
import type { ScoreBreakdown } from './resultExporter';

/**
 * TeamScoreExplainer — produces the human-readable + numeric score breakdown for a team.
 * Keeps "how do we explain a score" separate from "how do we compute a score" (SRP).
 * Breakdown includes: mutual-pick count, avg question similarity, avoid-penalty presence.
 */
export class TeamScoreExplainer {
  explain(team: TeamCandidate, ctx: ScoringContext): ScoreBreakdown {
    const members = team.members;
    let mutualPickCount = 0;
    let questionSimilarityTotal = 0;
    let pairCount = 0;
    let avoidPenaltyApplied = false;

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        pairCount++;

        // Count mutual picks (both ranked each other).
        const aRankedB = ctx.rankings.some(
          (r) => r.participantId === a.id && r.rankedParticipantId === b.id
        );
        const bRankedA = ctx.rankings.some(
          (r) => r.participantId === b.id && r.rankedParticipantId === a.id
        );
        if (aRankedB && bRankedA) mutualPickCount++;

        // Accumulate question similarity for the pair.
        questionSimilarityTotal += computePairQuestionSimilarity(a, b, ctx);

        // Check if either party marked the other as avoid.
        const avoided = ctx.avoids.some(
          (av) =>
            (av.participantId === a.id && av.avoidedParticipantId === b.id) ||
            (av.participantId === b.id && av.avoidedParticipantId === a.id)
        );
        if (avoided) avoidPenaltyApplied = true;
      }
    }

    const avgQuestionSimilarity = pairCount > 0 ? questionSimilarityTotal / pairCount : 0;

    return { mutualPickCount, avgQuestionSimilarity, avoidPenaltyApplied };
  }

  /** Produces a plain-language explanation string for the team's score. */
  explainText(
    team: TeamCandidate,
    ctx: ScoringContext,
    breakdown: ScoreBreakdown
  ): string {
    const lines: string[] = [];
    if (breakdown.mutualPickCount > 0) {
      lines.push(
        `${breakdown.mutualPickCount} mutual teammate pick${breakdown.mutualPickCount > 1 ? 's' : ''} within this team`
      );
    }
    lines.push(
      `Average compatibility score: ${breakdown.avgQuestionSimilarity.toFixed(1)}/10`
    );
    if (breakdown.avoidPenaltyApplied) {
      lines.push('Note: "avoid" preference present within this team (soft penalty applied)');
    }
    void team;
    void ctx;
    return lines.join(' · ');
  }
}

/** Computes pure question similarity (0–10 scale) for a pair, without ranking or avoid. */
function computePairQuestionSimilarity(
  a: Participant,
  b: Participant,
  ctx: ScoringContext
): number {
  const aAnswers = ctx.answers.filter((ans) => ans.participantId === a.id);
  const bAnswers = ctx.answers.filter((ans) => ans.participantId === b.id);
  let total = 0;
  let count = 0;

  for (const question of ctx.questionSet.questions) {
    const aVal = aAnswers.find((x) => x.questionId === question.id)?.value;
    const bVal = bAnswers.find((x) => x.questionId === question.id)?.value;
    if (aVal === undefined || bVal === undefined) continue;
    count++;

    if (question.type === 'scale') {
      const diff = Math.abs(Number(aVal) - Number(bVal));
      total += (1 - diff / 4) * 10;
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

  return count > 0 ? total / count : 0;
}
