import { describe, it, expect } from 'vitest';
import { FriendModeScoring, questionSimilarity } from './friendModeScoring';
import { ClassModeScoring } from './classModeScoring';
import type { Participant } from '../participant';
import type { ScoringContext } from './scoringStrategy';
import type { QuestionDefinition } from '../questions/questionSetProvider';

describe('Scoring Strategies', () => {
  const pA: Participant = { id: 'pA', sessionId: 's1', name: 'Alice', hasSubmitted: true };
  const pB: Participant = { id: 'pB', sessionId: 's1', name: 'Bob', hasSubmitted: true };

  const questions: QuestionDefinition[] = [
    { id: 'q-scale', mode: 'friend', text: 'Work rhythm', type: 'scale', sortOrder: 1 },
    { id: 'q-single', mode: 'friend', text: 'Active hours', type: 'single_choice', options: ['Morning', 'Night'], sortOrder: 2 },
    { id: 'q-multi', mode: 'friend', text: 'Roles', type: 'multi_select', options: ['Frontend', 'Backend', 'Design'], sortOrder: 3 },
  ];

  it('computes question similarity accurately across scale, single_choice, and multi_select', () => {
    const ctx: ScoringContext = {
      rankings: [],
      avoids: [],
      questionSet: { mode: 'friend', questions },
      answers: [
        { participantId: 'pA', questionId: 'q-scale', value: 1 },
        { participantId: 'pB', questionId: 'q-scale', value: 3 }, // diff 2 -> (1 - 2/4)*10 = 5.0
        { participantId: 'pA', questionId: 'q-single', value: 'Morning' },
        { participantId: 'pB', questionId: 'q-single', value: 'Morning' }, // exact match -> 10.0
        { participantId: 'pA', questionId: 'q-multi', value: ['Frontend', 'Backend'] },
        { participantId: 'pB', questionId: 'q-multi', value: ['Backend', 'Design'] }, // overlap 1, union 3 -> 1/3 * 10 = 3.333
      ],
    };

    const sim = questionSimilarity(pA, pB, ctx);
    // (5.0 + 10.0 + 3.333) / 3 = 18.333 / 3 = 6.111
    expect(sim).toBeCloseTo(6.111, 2);
  });

  it('friend mode scoring applies rank points bidirectionally and avoid penalty (ALG-5)', () => {
    const scoring = new FriendModeScoring();
    const ctx: ScoringContext = {
      rankings: [
        { participantId: 'pA', rankedParticipantId: 'pB', position: 1 }, // +5
        { participantId: 'pB', rankedParticipantId: 'pA', position: 2 }, // +4
      ],
      avoids: [
        { participantId: 'pA', avoidedParticipantId: 'pB' }, // -8
      ],
      questionSet: { mode: 'friend', questions: [] },
      answers: [],
    };

    const score = scoring.pairScore(pA, pB, ctx);
    // 5 + 4 + 0 - 8 = 1
    expect(score).toBe(1);
  });

  it('class mode scoring ignores rankings and avoid penalties (ALG-6)', () => {
    const scoring = new ClassModeScoring();
    const ctx: ScoringContext = {
      rankings: [
        { participantId: 'pA', rankedParticipantId: 'pB', position: 1 },
      ],
      avoids: [
        { participantId: 'pA', avoidedParticipantId: 'pB' },
      ],
      questionSet: {
        mode: 'class',
        questions: [{ id: 'q-single', mode: 'class', text: 'Style', type: 'single_choice', sortOrder: 1 }],
      },
      answers: [
        { participantId: 'pA', questionId: 'q-single', value: 'Online' },
        { participantId: 'pB', questionId: 'q-single', value: 'Online' },
      ],
    };

    const score = scoring.pairScore(pA, pB, ctx);
    expect(score).toBe(10); // pure question similarity, rank & avoid ignored
  });
});
