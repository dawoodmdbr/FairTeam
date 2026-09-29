import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import { SupabaseQuestionSetProvider } from '../../infrastructure/supabase/supabaseQuestionSetProvider';
import type { Session } from '../../domain/session';
import type { QuestionDefinition } from '../../domain/questions/questionSetProvider';

export const QuestionsPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<QuestionDefinition[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const participantId = sessionStorage.getItem('ftm_participant_id');
  const participantName = sessionStorage.getItem('ftm_participant_name') || sessionStorage.getItem('ftm_participant_roll');

  useEffect(() => {
    if (!participantId) {
      navigate(`/session/${sessionId}`);
      return;
    }

    const loadQuestions = async () => {
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

        const qProvider = new SupabaseQuestionSetProvider(supabase);
        const qSet = await qProvider.getQuestionSet(sess.mode);
        setQuestions(qSet.questions);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, [sessionId, participantId, navigate]);

  const handleScaleSelect = (qId: string, val: number) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  const handleSingleChoiceSelect = (qId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: option }));
  };

  const handleMultiSelectToggle = (qId: string, option: string) => {
    setAnswers((prev) => {
      const currentList: string[] = prev[qId] || [];
      const updated = currentList.includes(option)
        ? currentList.filter((x) => x !== option)
        : [...currentList, option];
      return { ...prev, [qId]: updated };
    });
  };

  // Check if every question is answered
  const allAnswered = questions.length > 0 && questions.every((q) => {
    const val = answers[q.id];
    if (val === undefined || val === null) return false;
    if (q.type === 'multi_select') return Array.isArray(val) && val.length > 0;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      setError('All questions are mandatory. Please answer every question before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const rankings = JSON.parse(sessionStorage.getItem('ftm_rankings') || '[]');
      const avoids = JSON.parse(sessionStorage.getItem('ftm_avoids') || '[]');

      const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
        questionId: qId,
        value: val,
      }));

      const { data, error: submitErr } = await supabase.functions.invoke('submit-response', {
        body: {
          sessionId,
          participantId,
          answers: formattedAnswers,
          rankings,
          avoids,
        },
      });

      if (submitErr || data?.error) {
        throw new Error(data?.error?.message || submitErr?.message || 'Submission failed');
      }

      // Clear session submission cache
      sessionStorage.removeItem('ftm_rankings');
      sessionStorage.removeItem('ftm_avoids');
      sessionStorage.setItem('ftm_submitted', 'true');

      navigate(`/session/${sessionId}/submitted`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = questions.filter((q) => {
    const val = answers[q.id];
    if (val === undefined || val === null) return false;
    if (q.type === 'multi_select') return Array.isArray(val) && val.length > 0;
    return true;
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar mode={session?.mode} />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading questions...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={session?.mode} />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-[#3B6EA5] dark:text-[#699DD8] mb-1">
            {session?.mode === 'friend' ? 'Step 2 of 2' : 'Step 1 of 1'} — Compatibility Profile
          </div>
          <h1 className="text-2xl font-bold mb-1">Compatibility Questions</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Participant: <strong className="text-gray-800 dark:text-gray-200">{participantName}</strong>. Every question is mandatory to ensure balanced matchmaking.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1 font-medium">
            <span>Progress: {answeredCount} of {questions.length} answered</span>
            <span>{Math.round((answeredCount / (questions.length || 1)) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#3B6EA5] h-2 rounded-full transition-all duration-300"
              style={{ width: `${(answeredCount / (questions.length || 1)) * 100}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="p-5 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm"
            >
              <div className="flex items-start gap-2 mb-3">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {idx + 1}
                </span>
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                  {q.text} <span className="text-red-500">*</span>
                </label>
              </div>

              {/* Scale Type (1 to 5) */}
              {q.type === 'scale' && (
                <div>
                  <div className="flex justify-between items-center gap-2 my-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleScaleSelect(q.id, val)}
                        className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition ${
                          answers[q.id] === val
                            ? 'bg-[#3B6EA5] text-white border-[#3B6EA5] shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 px-1">
                    <span>1 (Strongly prefer left)</span>
                    <span>5 (Strongly prefer right)</span>
                  </div>
                </div>
              )}

              {/* Single Choice Type */}
              {q.type === 'single_choice' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(q.options ?? []).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSingleChoiceSelect(q.id, opt)}
                      className={`p-2.5 rounded-lg border text-xs font-medium text-left transition ${
                        answers[q.id] === opt
                          ? 'bg-[#3B6EA5] text-white border-[#3B6EA5] shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Multi Select Type */}
              {q.type === 'multi_select' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(q.options ?? []).map((opt) => {
                    const isSelected = (answers[q.id] || []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleMultiSelectToggle(q.id, opt)}
                        className={`p-2.5 rounded-lg border text-xs font-medium text-left transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-[#3B6EA5] text-[#3B6EA5] dark:text-[#699DD8] font-bold'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span>{opt}</span>
                        {isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting || !allAnswered}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition disabled:opacity-50 text-sm"
          >
            {submitting ? 'Submitting Responses...' : 'Submit Answers (Final)'}
          </button>
        </form>
      </main>

      <Footer />
    </div>
  );
};
