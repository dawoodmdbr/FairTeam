import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Domain logic inlined for Edge Function execution
const RANK_POINTS = [5, 4, 3, 2, 1];
const AVOID_PENALTY = 8;
const EXHAUSTIVE_THRESHOLD = 12;
const MAX_ITERATIONS = 2000;

interface Participant {
  id: string;
  sessionId: string;
  name?: string;
  rollNumber?: string;
  hasSubmitted: boolean;
}

interface QuestionDef {
  id: string;
  mode: string;
  text: string;
  type: string;
  options?: any;
  sortOrder: number;
}

interface ScoringContext {
  rankings: { participantId: string; rankedParticipantId: string; position: number }[];
  avoids: { participantId: string; avoidedParticipantId: string }[];
  answers: { participantId: string; questionId: string; value: any }[];
  questions: QuestionDef[];
}

function questionSimilarity(aId: string, bId: string, ctx: ScoringContext): number {
  const aAnswers = ctx.answers.filter((x) => x.participantId === aId);
  const bAnswers = ctx.answers.filter((x) => x.participantId === bId);
  let total = 0;
  let count = 0;

  for (const q of ctx.questions) {
    const aVal = aAnswers.find((x) => x.questionId === q.id)?.value;
    const bVal = bAnswers.find((x) => x.questionId === q.id)?.value;
    if (aVal === undefined || bVal === undefined) continue;
    count++;

    if (q.type === 'scale') {
      const diff = Math.abs(Number(aVal) - Number(bVal));
      total += (1 - diff / 4) * 10;
    } else if (q.type === 'single_choice') {
      total += aVal === bVal ? 10 : 0;
    } else if (q.type === 'multi_select') {
      const aArr = Array.isArray(aVal) ? aVal : [];
      const bArr = Array.isArray(bVal) ? bVal : [];
      const aSet = new Set(aArr);
      const bSet = new Set(bArr);
      const overlap = aArr.filter((v: any) => bSet.has(v)).length;
      const union = new Set([...aArr, ...bArr]).size;
      total += union === 0 ? 0 : (overlap / union) * 10;
    }
  }

  return count > 0 ? total / count : 0;
}

function pairScore(aId: string, bId: string, mode: string, ctx: ScoringContext): number {
  let score = questionSimilarity(aId, bId, ctx);
  if (mode === 'friend') {
    const rankAB = ctx.rankings.find((r) => r.participantId === aId && r.rankedParticipantId === bId);
    const rankBA = ctx.rankings.find((r) => r.participantId === bId && r.rankedParticipantId === aId);
    if (rankAB) score += RANK_POINTS[rankAB.position - 1] ?? 0;
    if (rankBA) score += RANK_POINTS[rankBA.position - 1] ?? 0;

    const avoided = ctx.avoids.some(
      (av) =>
        (av.participantId === aId && av.avoidedParticipantId === bId) ||
        (av.participantId === bId && av.avoidedParticipantId === aId)
    );
    if (avoided) score -= AVOID_PENALTY;
  }
  return score;
}

function teamScore(members: Participant[], mode: string, ctx: ScoringContext): number {
  if (members.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      total += pairScore(members[i].id, members[j].id, mode, ctx);
      pairs++;
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

function groupingScore(teams: { members: Participant[] }[], mode: string, ctx: ScoringContext): number {
  const scores = teams.map((t) => teamScore(t.members, mode, ctx));
  return Math.min(...scores);
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function generatePartitions(
  remaining: Participant[],
  teamSize: number,
  current: { members: Participant[] }[],
  results: { members: Participant[] }[][]
): void {
  if (remaining.length === 0) {
    results.push([...current]);
    return;
  }
  if (remaining.length <= teamSize) {
    results.push([...current, { members: remaining }]);
    return;
  }

  const [first, ...rest] = remaining;
  const combos = combinations(rest, teamSize - 1);
  for (const combo of combos) {
    const group = { members: [first, ...combo] };
    const nextRemaining = rest.filter((p) => !combo.includes(p));
    generatePartitions(nextRemaining, teamSize, [...current, group], results);
  }
}

function deterministicSeed(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

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

function resolveTopN(
  sorted: { teams: { members: Participant[] }[]; fairnessScore: number }[],
  ctx: ScoringContext,
  n: number
) {
  if (sorted.length === 0) return [];
  const topScore = sorted[0].fairnessScore;
  const tied = sorted.filter((g) => g.fairnessScore === topScore);

  if (tied.length > 1) {
    tied.sort((a, b) => {
      // 1. Unfulfilled choices
      const aUnf = countUnfulfilled(a, ctx);
      const bUnf = countUnfulfilled(b, ctx);
      if (aUnf !== bUnf) return aUnf - bUnf;

      // 2. Average pair score
      if (a.fairnessScore !== b.fairnessScore) return b.fairnessScore - a.fairnessScore;

      // 3. Lexicographic ID
      const aKey = a.teams.map((t) => t.members.map((m) => m.id).sort().join(',')).sort().join('|');
      const bKey = b.teams.map((t) => t.members.map((m) => m.id).sort().join(',')).sort().join('|');
      return aKey.localeCompare(bKey);
    });
  }

  const winner = tied[0];
  const rest = sorted.filter((g) => g !== winner);
  return [winner, ...rest].slice(0, n);
}

function countUnfulfilled(grouping: { teams: { members: Participant[] }[] }, ctx: ScoringContext): number {
  let count = 0;
  const allIds = grouping.teams.flatMap((t) => t.members.map((m) => m.id));
  for (const id of allIds) {
    const theirRankings = ctx.rankings.filter((r) => r.participantId === id);
    if (theirRankings.length === 0) continue;
    const team = grouping.teams.find((t) => t.members.some((m) => m.id === id));
    if (!team) continue;
    const teammateIds = team.members.filter((m) => m.id !== id).map((m) => m.id);
    const gotRanked = theirRankings.some((r) => teammateIds.includes(r.rankedParticipantId));
    if (!gotRanked) count++;
  }
  return count;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const client = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: { code: 'bad_request', message: 'Missing sessionId' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify session state
    const { data: session, error: sErr } = await client
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sErr || !session) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: 'Session not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status !== 'open') {
      return new Response(
        JSON.stringify({
          error: {
            code: 'invalid_status',
            message: `Cannot reveal results for a session in status '${session.status}'.`,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch submitted participants
    const { data: participantsRaw, error: pErr } = await client
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('has_submitted', true);

    if (pErr) throw pErr;

    const participants: Participant[] = (participantsRaw ?? []).map((p) => ({
      id: p.id,
      sessionId: p.session_id,
      name: p.name,
      rollNumber: p.roll_number,
      hasSubmitted: p.has_submitted,
    }));

    if (participants.length < 2) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'insufficient_participants',
            message: 'At least 2 submitted participants are required to compute matching.',
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch rankings, avoids, questions, and answers
    const pIds = participants.map((p) => p.id);
    const { data: qDefs } = await client
      .from('question_definitions')
      .select('*')
      .eq('mode', session.mode)
      .order('sort_order');

    const { data: answersRaw } = await client
      .from('question_responses')
      .select('*')
      .in('participant_id', pIds);

    const { data: rankingsRaw } = await client
      .from('ranking_responses')
      .select('*')
      .in('participant_id', pIds);

    const { data: avoidsRaw } = await client
      .from('avoid_responses')
      .select('*')
      .in('participant_id', pIds);

    const ctx: ScoringContext = {
      rankings: (rankingsRaw ?? []).map((r) => ({
        participantId: r.participant_id,
        rankedParticipantId: r.ranked_participant_id,
        position: r.position,
      })),
      avoids: (avoidsRaw ?? []).map((a) => ({
        participantId: a.participant_id,
        avoidedParticipantId: a.avoided_participant_id,
      })),
      answers: (answersRaw ?? []).map((a) => ({
        participantId: a.participant_id,
        questionId: a.question_id,
        value: a.value,
      })),
      questions: (qDefs ?? []).map((q) => ({
        id: q.id,
        mode: q.mode,
        text: q.text,
        type: q.type,
        options: q.options,
        sortOrder: q.sort_order,
      })),
    };

    let topGroupings: { teams: { members: Participant[] }[]; fairnessScore: number }[] = [];

    if (participants.length <= EXHAUSTIVE_THRESHOLD) {
      // Exhaustive Matcher
      const allPartitions: { members: Participant[] }[][] = [];
      generatePartitions(participants, session.team_size, [], allPartitions);

      const scored = allPartitions.map((teams) => ({
        teams,
        fairnessScore: groupingScore(teams, session.mode, ctx),
      }));

      scored.sort((a, b) => b.fairnessScore - a.fairnessScore);
      topGroupings = resolveTopN(scored, ctx, 3);
    } else {
      // Approximate Matcher (deterministic local search)
      const seed = deterministicSeed(sessionId);
      const rng = mulberry32(seed);

      const sorted = [...participants].sort((a, b) => a.id.localeCompare(b.id));
      let current: { members: Participant[] }[] = [];
      for (let i = 0; i < sorted.length; i += session.team_size) {
        current.push({ members: sorted.slice(i, i + session.team_size) });
      }

      let currentScore = groupingScore(current, session.mode, ctx);
      const seenGroupings = [{ teams: current, fairnessScore: currentScore }];

      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const teamCount = current.length;
        if (teamCount < 2) break;
        const teamA = Math.floor(rng() * teamCount);
        let teamB = Math.floor(rng() * teamCount);
        while (teamB === teamA) teamB = Math.floor(rng() * teamCount);

        const memA = Math.floor(rng() * current[teamA].members.length);
        const memB = Math.floor(rng() * current[teamB].members.length);

        const candidate = current.map((t) => ({ members: [...t.members] }));
        const tmp = candidate[teamA].members[memA];
        candidate[teamA].members[memA] = candidate[teamB].members[memB];
        candidate[teamB].members[memB] = tmp;

        const candidateScore = groupingScore(candidate, session.mode, ctx);
        if (candidateScore > currentScore) {
          current = candidate;
          currentScore = candidateScore;
          seenGroupings.push({ teams: current, fairnessScore: currentScore });
        }
      }

      seenGroupings.sort((a, b) => b.fairnessScore - a.fairnessScore);
      topGroupings = resolveTopN(seenGroupings, ctx, 3);
    }

    const winner = topGroupings[0];
    const alternatives = topGroupings.slice(1);

    // Save Winning Teams & Memberships
    for (let i = 0; i < winner.teams.length; i++) {
      const t = winner.teams[i];
      const tScore = teamScore(t.members, session.mode, ctx);

      // Score breakdown computation
      let mutualPicks = 0;
      let qSimTotal = 0;
      let pairs = 0;
      let avoidPenalty = false;

      for (let x = 0; x < t.members.length; x++) {
        for (let y = x + 1; y < t.members.length; y++) {
          const aId = t.members[x].id;
          const bId = t.members[y].id;
          pairs++;
          qSimTotal += questionSimilarity(aId, bId, ctx);

          const aRankB = ctx.rankings.some((r) => r.participantId === aId && r.rankedParticipantId === bId);
          const bRankA = ctx.rankings.some((r) => r.participantId === bId && r.rankedParticipantId === aId);
          if (aRankB && bRankA) mutualPicks++;

          if (
            ctx.avoids.some(
              (av) =>
                (av.participantId === aId && av.avoidedParticipantId === bId) ||
                (av.participantId === bId && av.avoidedParticipantId === aId)
            )
          ) {
            avoidPenalty = true;
          }
        }
      }

      const avgQSim = pairs > 0 ? qSimTotal / pairs : 0;
      const scoreBreakdown = {
        mutualPickCount: mutualPicks,
        avgQuestionSimilarity: avgQSim,
        avoidPenaltyApplied: avoidPenalty,
      };

      const { data: teamRow, error: teamErr } = await client
        .from('teams')
        .insert({
          session_id: sessionId,
          team_number: i + 1,
          fairness_score: tScore,
          score_breakdown: scoreBreakdown,
        })
        .select()
        .single();

      if (teamErr) throw teamErr;

      // Memberships
      const memberships = t.members.map((m) => ({
        team_id: teamRow.id,
        participant_id: m.id,
      }));

      const { error: memErr } = await client.from('team_memberships').insert(memberships);
      if (memErr) throw memErr;
    }

    // Save Alternative Groupings (Display-only)
    for (let r = 0; r < alternatives.length; r++) {
      const alt = alternatives[r];
      const teamsSummary = alt.teams.map((t) => ({
        memberDisplayNames: t.members.map((m) => m.name ?? m.rollNumber ?? m.id),
        fairnessScore: teamScore(t.members, session.mode, ctx),
      }));

      await client.from('alternative_groupings').insert({
        session_id: sessionId,
        rank: r + 2,
        fairness_score: alt.fairnessScore,
        teams_summary: teamsSummary,
      });
    }

    // Transition session: revealed -> locked
    await client.from('sessions').update({ status: 'revealed' }).eq('id', sessionId);
    await client.from('sessions').update({ status: 'locked' }).eq('id', sessionId);

    return new Response(
      JSON.stringify({
        success: true,
        fairnessScore: winner.fairnessScore,
        teamsCount: winner.teams.length,
        alternativesCount: alternatives.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { code: 'server_error', message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
