import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import { CsvResultExporter } from '../../domain/export/csvResultExporter';
import { PdfResultExporter } from '../../domain/export/pdfResultExporter';
import type { Session } from '../../domain/session';
import type { ExportableTeam, ScoreBreakdown } from '../../domain/export/resultExporter';
import type { StoredAlternativeGrouping } from '../../repositories/teamRepository';

export const ResultsOrganizerPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [teams, setTeams] = useState<ExportableTeam[]>([]);
  const [alternatives, setAlternatives] = useState<StoredAlternativeGrouping[]>([]);
  const [rawAnswers, setRawAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
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

      // Fetch Teams + Memberships
      const { data: teamsData, error: tErr } = await supabase
        .from('teams')
        .select('*, team_memberships(participant_id, participants(id, name, roll_number, has_submitted))')
        .eq('session_id', sessionId)
        .order('team_number');

      if (tErr) throw tErr;

      const formattedTeams: ExportableTeam[] = (teamsData ?? []).map((t) => {
        const memberships = t.team_memberships ?? [];
        return {
          teamNumber: t.team_number,
          fairnessScore: Number(t.fairness_score),
          scoreBreakdown: t.score_breakdown as ScoreBreakdown,
          members: memberships.map((m: any) => ({
            id: m.participants?.id ?? m.participant_id,
            sessionId: sessionId,
            name: m.participants?.name,
            rollNumber: m.participants?.roll_number,
            hasSubmitted: m.participants?.has_submitted ?? true,
          })),
        };
      });
      setTeams(formattedTeams);

      // Fetch Alternative Groupings (display-only)
      const { data: altData, error: altErr } = await supabase
        .from('alternative_groupings')
        .select('*')
        .eq('session_id', sessionId)
        .order('rank');

      if (altErr) throw altErr;
      setAlternatives(
        (altData ?? []).map((a) => ({
          id: a.id,
          sessionId: a.session_id,
          rank: a.rank,
          fairnessScore: Number(a.fairness_score),
          teamsSummary: a.teams_summary,
        }))
      );

      // If Class Mode, fetch raw answers for organizer inspection
      if (sess.mode === 'class') {
        const { data: qAns } = await supabase
          .from('question_responses')
          .select('*, question_definitions(text), participants(roll_number)')
          .in(
            'participant_id',
            formattedTeams.flatMap((t) => t.members.map((m) => m.id))
          );
        setRawAnswers(qAns ?? []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [sessionId]);

  const handleExportCsv = () => {
    if (!session || teams.length === 0) return;
    const exporter = new CsvResultExporter();
    const csvContent = exporter.export(session, teams);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fairteam-session-${session.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    if (!session || teams.length === 0) return;
    setExportingPdf(true);
    try {
      const exporter = new PdfResultExporter();
      const pdfBlob = await exporter.export(session, teams);

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fairteam-session-${session.id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`PDF generation failed: ${msg}`);
    } finally {
      setExportingPdf(false);
    }
  };

  const overallFairnessScore = teams.length > 0 ? Math.min(...teams.map((t) => t.fairnessScore)) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading results...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={session?.mode} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
              Matching Results
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Optimal team assignments with transparency breakdowns and alternative candidates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#252525] hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <span>📄</span> Export CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="px-3.5 py-2 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>📑</span> {exportingPdf ? 'Generating PDF...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Global Fairness Score Banner */}
        <div className="mb-8 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#1E2530] dark:to-[#1F2937] rounded-xl border border-blue-200 dark:border-blue-900/60 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#3B6EA5] dark:text-[#699DD8] mb-1">
              Grouping Fairness Score (Maximin Objective)
            </div>
            <div className="text-2xl font-extrabold text-[#2B2B2B] dark:text-white">
              {overallFairnessScore.toFixed(2)}{' '}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                (score of the worst-off team)
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              Optimal Grouping Found
            </span>
          </div>
        </div>

        {/* Winning Teams Display */}
        <div className="space-y-4 mb-10">
          <h2 className="text-base font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
            Official Teams ({teams.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map((t) => (
              <div
                key={t.teamNumber}
                className="bg-white dark:bg-[#252525] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                    <h3 className="font-bold text-base text-[#3B6EA5] dark:text-[#699DD8]">
                      Team {t.teamNumber}
                    </h3>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                      Score: {t.fairnessScore.toFixed(2)}
                    </span>
                  </div>

                  <ul className="space-y-1.5 mb-4 text-sm font-medium">
                    {t.members.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className="text-[#3B6EA5] dark:text-[#699DD8]">•</span>
                        <span>{m.name ?? m.rollNumber}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Score Breakdown (Explainability) */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                  {session?.mode === 'friend' && (
                    <div>
                      🤝 Mutual teammate picks:{' '}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {t.scoreBreakdown?.mutualPickCount ?? 0}
                      </span>
                    </div>
                  )}
                  <div>
                    📊 Average question similarity:{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {t.scoreBreakdown?.avgQuestionSimilarity?.toFixed(1) ?? 'N/A'}/10
                    </span>
                  </div>
                  {t.scoreBreakdown?.avoidPenaltyApplied && (
                    <div className="text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Avoid penalty applied to pair in this team
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alternative Groupings (Display-Only for Transparency) */}
        {alternatives.length > 0 && (
          <div className="p-6 bg-gray-50 dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-gray-700 mb-10">
            <div className="mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span>🔍</span> Alternative Groupings (Display-Only for Transparency)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                The runner-up groupings evaluated by the algorithm. Displayed to prove transparency—these cannot replace the mathematical winner.
              </p>
            </div>

            <div className="space-y-4">
              {alternatives.map((alt) => (
                <div
                  key={alt.rank}
                  className="p-4 bg-white dark:bg-[#252525] rounded-lg border border-gray-200 dark:border-gray-800 text-xs"
                >
                  <div className="flex items-center justify-between font-bold mb-2">
                    <span className="text-[#3B6EA5] dark:text-[#699DD8]">
                      Candidate #{alt.rank} Alternative
                    </span>
                    <span className="font-mono text-gray-500">
                      Fairness Score: {alt.fairnessScore.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                    {alt.teamsSummary.map((ts, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 dark:bg-[#1A1A1A] rounded">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          Team {idx + 1}:
                        </span>{' '}
                        {ts.memberDisplayNames.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Class Mode Raw Answers Table (Organizer Inspection only) */}
        {session?.mode === 'class' && rawAnswers.length > 0 && (
          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              Class Mode: Raw Student Submissions (Organizer Inspection)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Answers are visible only to the course instructor/TA. Students never see raw peer answers.
            </p>

            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-xs">
                <thead className="border-b dark:border-gray-700 text-gray-400 uppercase">
                  <tr>
                    <th className="py-2 px-3">Roll Number</th>
                    <th className="py-2 px-3">Question</th>
                    <th className="py-2 px-3">Answer Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800 font-mono">
                  {rawAnswers.map((ans, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="py-2 px-3 font-semibold text-gray-800 dark:text-gray-200">
                        {ans.participants?.roll_number}
                      </td>
                      <td className="py-2 px-3 font-sans text-gray-600 dark:text-gray-400">
                        {ans.question_definitions?.text}
                      </td>
                      <td className="py-2 px-3 text-[#3B6EA5] dark:text-[#699DD8]">
                        {JSON.stringify(ans.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
