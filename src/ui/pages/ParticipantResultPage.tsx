import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { Session } from '../../domain/session';

interface MyTeamData {
  teamNumber: number;
  fairnessScore: number;
  scoreBreakdown: {
    mutualPickCount: number;
    avgQuestionSimilarity: number;
    avoidPenaltyApplied: boolean;
  };
  teammates: { id: string; name: string }[];
}

export const ParticipantResultPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [myTeam, setMyTeam] = useState<MyTeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const participantId = sessionStorage.getItem('ftm_participant_id');
  const participantName = sessionStorage.getItem('ftm_participant_name');

  useEffect(() => {
    const loadResults = async () => {
      if (!sessionId) return;
      try {
        const { data: sData, error: sErr } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sErr || !sData) throw new Error(sErr?.message || 'Session not found');

        const sess: Session = {
          id: sData.id,
          mode: sData.mode,
          teamSize: sData.team_size,
          status: sData.status,
          createdBy: sData.created_by,
          createdAt: sData.created_at,
          expiresAt: sData.expires_at,
        };
        setSession(sess);

        if (sess.status !== 'revealed' && sess.status !== 'locked') {
          setLoading(false);
          return;
        }

        // If Class Mode: student cannot view team assignments per Requirements §5.2
        if (sess.mode === 'class') {
          setLoading(false);
          return;
        }

        // Friend Mode: Query participant's own team only
        if (!participantId) {
          setError('No participant identity found in this browser. Please identify first.');
          setLoading(false);
          return;
        }

        // 1. Find participant's team_membership
        const { data: memData, error: memErr } = await supabase
          .from('team_memberships')
          .select('team_id')
          .eq('participant_id', participantId)
          .maybeSingle();

        if (memErr) throw memErr;

        if (!memData) {
          setError('You were not included in the revealed grouping.');
          setLoading(false);
          return;
        }

        // 2. Fetch that team and its members
        const { data: teamData, error: tErr } = await supabase
          .from('teams')
          .select('*, team_memberships(participant_id, participants(id, name))')
          .eq('id', memData.team_id)
          .single();

        if (tErr || !teamData) throw new Error(tErr?.message || 'Team data not found');

        const members = (teamData.team_memberships ?? []).map((m: any) => ({
          id: m.participants?.id ?? m.participant_id,
          name: m.participants?.name ?? 'Unknown',
        }));

        setMyTeam({
          teamNumber: teamData.team_number,
          fairnessScore: Number(teamData.fairness_score),
          scoreBreakdown: teamData.score_breakdown,
          teammates: members,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [sessionId, participantId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Checking result status...
        </div>
      </div>
    );
  }

  // Case 1: Session not yet revealed
  if (session && session.status !== 'revealed' && session.status !== 'locked') {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar mode={session.mode} />
        <main className="flex-1 max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center text-center">
          <div className="bg-white dark:bg-[#252525] p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <span className="text-4xl block mb-3">⏳</span>
            <h1 className="text-2xl font-bold mb-2">Results Not Yet Revealed</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Your organizer is currently collecting responses. Once the matching algorithm runs, your team assignment will appear right here.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-semibold rounded-lg"
            >
              Refresh Page
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Case 2: Class Mode (Students see only generic submission confirmation)
  if (session?.mode === 'class') {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar mode="class" />
        <main className="flex-1 max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center text-center">
          <div className="bg-white dark:bg-[#252525] p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <span className="text-4xl block mb-3">🎓</span>
            <h1 className="text-2xl font-bold mb-2">Class Mode Notice</h1>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              In Class Mode, team assignments and survey evaluations are managed directly by your course instructor/TA. Team allocations will be communicated in class or published on your course LMS.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode="friend" />

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">
            Results Officially Revealed
          </div>
          <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
            Your Matched Team
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Hey {participantName ?? 'there'}, here are your teammates and the reason for your group match.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {myTeam && (
          <div className="bg-white dark:bg-[#252525] p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-md space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-[#3B6EA5] dark:text-[#699DD8]">
                Team {myTeam.teamNumber}
              </h2>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Team Score: {myTeam.fairnessScore.toFixed(2)}
              </span>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Teammates
              </div>
              <ul className="space-y-2">
                {myTeam.teammates.map((m) => (
                  <li
                    key={m.id}
                    className={`p-2.5 rounded-lg border text-sm flex items-center justify-between ${
                      m.id === participantId
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-[#3B6EA5] font-bold text-[#3B6EA5] dark:text-[#699DD8]'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span>{m.name}</span>
                    {m.id === participantId && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#3B6EA5] text-white">
                        You
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Plain language explanation */}
            <div className="p-4 bg-gray-50 dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 space-y-2 leading-relaxed">
              <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <span>💡</span> Why you were paired together:
              </div>
              {myTeam.scoreBreakdown.mutualPickCount > 0 && (
                <div>
                  • You and your teammates mutually ranked each other in your top preferences ({myTeam.scoreBreakdown.mutualPickCount} mutual choice{myTeam.scoreBreakdown.mutualPickCount > 1 ? 's' : ''}).
                </div>
              )}
              <div>
                • Strong alignment on working style and project hours ({myTeam.scoreBreakdown.avgQuestionSimilarity.toFixed(1)}/10 compatibility index).
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/how-it-works"
            className="text-xs text-[#3B6EA5] dark:text-[#699DD8] hover:underline"
          >
            Learn more about the fairness algorithm →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
};
