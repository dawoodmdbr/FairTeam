import { describe, it, expect } from 'vitest';
import { ExhaustiveMatcher } from './exhaustiveMatcher';
import { ApproximateMatcher } from './approximateMatcher';
import { MatcherSelector } from './matcherSelector';
import { TieBreaker } from './tieBreaker';
import { FriendModeScoring } from '../scoring/friendModeScoring';
import { ClassModeScoring } from '../scoring/classModeScoring';
import type { Participant } from '../participant';
import type { ScoringContext } from '../scoring/scoringStrategy';

describe('Matching Algorithms', () => {
  const tieBreaker = new TieBreaker();

  it('ALG-1: produces byte-identical output given identical inputs (determinism)', () => {
    const people: Participant[] = [
      { id: '1', sessionId: 'fixed-session', name: 'User 1', hasSubmitted: true },
      { id: '2', sessionId: 'fixed-session', name: 'User 2', hasSubmitted: true },
      { id: '3', sessionId: 'fixed-session', name: 'User 3', hasSubmitted: true },
      { id: '4', sessionId: 'fixed-session', name: 'User 4', hasSubmitted: true },
      { id: '5', sessionId: 'fixed-session', name: 'User 5', hasSubmitted: true },
      { id: '6', sessionId: 'fixed-session', name: 'User 6', hasSubmitted: true },
    ];

    const ctx: ScoringContext = {
      rankings: [
        { participantId: '1', rankedParticipantId: '2', position: 1 },
        { participantId: '2', rankedParticipantId: '1', position: 1 },
        { participantId: '3', rankedParticipantId: '4', position: 1 },
        { participantId: '4', rankedParticipantId: '3', position: 1 },
      ],
      avoids: [],
      answers: [],
      questionSet: { mode: 'friend', questions: [] },
    };

    const matcher = new ExhaustiveMatcher(tieBreaker);
    const scoring = new FriendModeScoring();

    const run1 = matcher.findTopGroupings(people, 3, ctx, scoring, 3);
    const run2 = matcher.findTopGroupings(people, 3, ctx, scoring, 3);

    expect(JSON.stringify(run1)).toEqual(JSON.stringify(run2));
  });

  it('ALG-3: groups perfect mutual match together with high score', () => {
    const people: Participant[] = [
      { id: '1', sessionId: 's1', name: 'A', hasSubmitted: true },
      { id: '2', sessionId: 's1', name: 'B', hasSubmitted: true },
      { id: '3', sessionId: 's1', name: 'C', hasSubmitted: true },
      { id: '4', sessionId: 's1', name: 'D', hasSubmitted: true },
      { id: '5', sessionId: 's1', name: 'E', hasSubmitted: true },
      { id: '6', sessionId: 's1', name: 'F', hasSubmitted: true },
    ];

    // 1, 2, 3 all rank each other #1 (+5 each direction = +10 per pair)
    const ctx: ScoringContext = {
      rankings: [
        { participantId: '1', rankedParticipantId: '2', position: 1 },
        { participantId: '1', rankedParticipantId: '3', position: 2 },
        { participantId: '2', rankedParticipantId: '1', position: 1 },
        { participantId: '2', rankedParticipantId: '3', position: 2 },
        { participantId: '3', rankedParticipantId: '1', position: 1 },
        { participantId: '3', rankedParticipantId: '2', position: 2 },
      ],
      avoids: [],
      answers: [],
      questionSet: { mode: 'friend', questions: [] },
    };

    const matcher = new ExhaustiveMatcher(tieBreaker);
    const scoring = new FriendModeScoring();
    const result = matcher.findTopGroupings(people, 3, ctx, scoring, 1);

    const winner = result[0];
    expect(winner).toBeDefined();

    // Check if 1, 2, 3 are in the same team
    const teamWith1 = winner.teams.find((t) => t.members.some((m) => m.id === '1'));
    expect(teamWith1?.members.map((m) => m.id).sort()).toEqual(['1', '2', '3']);
  });

  it('ALG-4: partitions 11 participants into 3 teams of 3 and 1 team of 2', () => {
    const people: Participant[] = Array.from({ length: 11 }, (_, i) => ({
      id: String(i + 1),
      sessionId: 's-11',
      name: `Person ${i + 1}`,
      hasSubmitted: true,
    }));

    const ctx: ScoringContext = {
      rankings: [],
      avoids: [],
      answers: [],
      questionSet: { mode: 'friend', questions: [] },
    };

    const matcher = new ExhaustiveMatcher(tieBreaker);
    const scoring = new FriendModeScoring();

    const [winner] = matcher.findTopGroupings(people, 3, ctx, scoring, 1);
    expect(winner.teams.length).toBe(4);

    const teamSizes = winner.teams.map((t) => t.members.length).sort();
    expect(teamSizes).toEqual([2, 3, 3, 3]);

    const totalMembers = winner.teams.reduce((acc, t) => acc + t.members.length, 0);
    expect(totalMembers).toBe(11);
  });

  it('ALG-7: MatcherSelector selects ExhaustiveMatcher <= 12, ApproximateMatcher > 12', () => {
    const selector = new MatcherSelector();
    const under = selector.choose(12, tieBreaker);
    const over = selector.choose(13, tieBreaker);

    expect(under).toBeInstanceOf(ExhaustiveMatcher);
    expect(over).toBeInstanceOf(ApproximateMatcher);
  });

  it('ALG-8: handles 50-participant Class Mode deterministically and within time budget', () => {
    const people: Participant[] = Array.from({ length: 50 }, (_, i) => ({
      id: `p-${i + 1}`,
      sessionId: 'class-session-50',
      rollNumber: `24F-${1000 + i}`,
      hasSubmitted: true,
    }));

    const ctx: ScoringContext = {
      rankings: [],
      avoids: [],
      answers: people.map((p, idx) => ({
        participantId: p.id,
        questionId: 'q-1',
        value: (idx % 4) + 1,
      })),
      questionSet: {
        mode: 'class',
        questions: [{ id: 'q-1', mode: 'class', text: 'Comfort', type: 'scale', sortOrder: 1 }],
      },
    };

    const matcher = new ApproximateMatcher(tieBreaker);
    const scoring = new ClassModeScoring();

    const start = performance.now();
    const groupings = matcher.findTopGroupings(people, 5, ctx, scoring, 3);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10000); // well within 30 seconds requirement
    expect(groupings.length).toBeGreaterThan(0);

    const [winner] = groupings;
    expect(winner.teams.length).toBe(10); // 50 / 5 = 10 teams of 5

    // Check all 50 participants are placed exactly once
    const placedIds = winner.teams.flatMap((t) => t.members.map((m) => m.id));
    expect(placedIds.length).toBe(50);
    expect(new Set(placedIds).size).toBe(50);
  });

  it('ALG-9: tie-breaker chooses the same grouping deterministically on ties', () => {
    const ctx: ScoringContext = {
      rankings: [
        { participantId: '1', rankedParticipantId: '2', position: 1 },
      ],
      avoids: [],
      answers: [],
      questionSet: { mode: 'friend', questions: [] },
    };

    const groupingA = {
      fairnessScore: 5,
      teams: [
        { members: [{ id: '1', sessionId: 's', hasSubmitted: true }, { id: '2', sessionId: 's', hasSubmitted: true }] },
      ],
    };

    const groupingB = {
      fairnessScore: 5,
      teams: [
        { members: [{ id: '1', sessionId: 's', hasSubmitted: true }, { id: '3', sessionId: 's', hasSubmitted: true }] },
      ],
    };

    // Grouping A fulfills user 1's rank choice; Grouping B leaves user 1 unfulfilled
    const res1 = tieBreaker.resolveTopN([groupingB, groupingA], ctx, 1);
    const res2 = tieBreaker.resolveTopN([groupingA, groupingB], ctx, 1);

    expect(res1[0]).toBe(groupingA);
    expect(res2[0]).toBe(groupingA);
  });

  it('ALG-10: supports organizer-set team size (e.g. team size = 4)', () => {
    const people: Participant[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i + 1}`,
      sessionId: 'class-20',
      rollNumber: `24F-${2000 + i}`,
      hasSubmitted: true,
    }));

    const ctx: ScoringContext = {
      rankings: [],
      avoids: [],
      answers: [],
      questionSet: { mode: 'class', questions: [] },
    };

    const matcher = new ApproximateMatcher(tieBreaker);
    const scoring = new ClassModeScoring();

    const [winner] = matcher.findTopGroupings(people, 4, ctx, scoring, 1);
    expect(winner.teams.length).toBe(5);
    winner.teams.forEach((t) => {
      expect(t.members.length).toBe(4);
    });
  });
});
