import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { Participant } from '../../domain/participant';

export const FriendRankPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [candidates, setCandidates] = useState<Participant[]>([]);
  const [rankedList, setRankedList] = useState<Participant[]>([]);
  const [avoidIds, setAvoidIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const currentParticipantId = sessionStorage.getItem('ftm_participant_id');
  const currentParticipantName = sessionStorage.getItem('ftm_participant_name');

  useEffect(() => {
    if (!currentParticipantId) {
      navigate(`/session/${sessionId}`);
      return;
    }

    const loadCandidates = async () => {
      try {
        const { data, error: pErr } = await supabase
          .from('participants')
          .select('*')
          .eq('session_id', sessionId);

        if (pErr) throw pErr;

        // Exclude self from candidates list
        const others = (data ?? [])
          .filter((p) => p.id !== currentParticipantId)
          .map((p) => ({
            id: p.id,
            sessionId: p.session_id,
            name: p.name,
            rollNumber: p.roll_number,
            hasSubmitted: p.has_submitted,
          }));

        setCandidates(others);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadCandidates();
  }, [sessionId, currentParticipantId, navigate]);

  const handleAddToRank = (p: Participant) => {
    if (rankedList.length >= 5) {
      setError('You can rank at most 5 teammates.');
      return;
    }
    if (rankedList.some((item) => item.id === p.id)) return;
    setError(null);
    setRankedList((prev) => [...prev, p]);
  };

  const handleRemoveFromRank = (id: string) => {
    setRankedList((prev) => prev.filter((p) => p.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...rankedList];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    setRankedList(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === rankedList.length - 1) return;
    const next = [...rankedList];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    setRankedList(next);
  };

  const toggleAvoid = (id: string) => {
    setAvoidIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleProceed = () => {
    if (rankedList.length < 3) {
      setError('You must rank at least 3 teammates before proceeding.');
      return;
    }
    if (rankedList.length > 5) {
      setError('You can rank at most 5 teammates.');
      return;
    }

    // Save rankings in sessionStorage
    const rankings = rankedList.map((p, idx) => ({
      participantId: currentParticipantId,
      rankedParticipantId: p.id,
      position: idx + 1,
    }));

    const avoids = avoidIds.map((avoidedId) => ({
      participantId: currentParticipantId,
      avoidedParticipantId: avoidedId,
    }));

    sessionStorage.setItem('ftm_rankings', JSON.stringify(rankings));
    sessionStorage.setItem('ftm_avoids', JSON.stringify(avoids));

    navigate(`/session/${sessionId}/questions`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar mode="friend" />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading teammates...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode="friend" />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-[#3B6EA5] dark:text-[#699DD8] mb-1">
            Step 1 of 2 — Teammate Preferences
          </div>
          <h1 className="text-2xl font-bold mb-1">
            Rank Your Preferred Teammates
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Logged in as <strong className="text-gray-800 dark:text-gray-200">{currentParticipantName}</strong>. Your rankings are private and never shown to anyone.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Selected Rankings */}
        <div className="mb-6 p-5 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Your Top 3–5 Ranked Teammates ({rankedList.length}/5)
            </h2>
            <span className="text-[11px] font-semibold text-gray-400">
              {rankedList.length < 3 ? `Need ${3 - rankedList.length} more` : '✓ Requirement met'}
            </span>
          </div>

          {rankedList.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              Click &quot;+ Add&quot; from the available friends list below to rank them.
            </div>
          ) : (
            <div className="space-y-2">
              {rankedList.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border border-gray-200 dark:border-gray-700 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#3B6EA5] text-white flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      (+{5 - idx} points)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveUp(idx)}
                      className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === rankedList.length - 1}
                      onClick={() => handleMoveDown(idx)}
                      className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromRank(p.id)}
                      className="ml-2 text-red-500 font-bold hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Candidates */}
        <div className="mb-6 p-5 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-3">
            Available Friends
          </h2>

          <div className="grid grid-cols-2 gap-2">
            {candidates
              .filter((c) => !rankedList.some((r) => r.id === c.id))
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleAddToRank(c)}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-left transition"
                >
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-[#3B6EA5] dark:text-[#699DD8] font-bold ml-1">+ Add</span>
                </button>
              ))}
          </div>
        </div>

        {/* Avoid List (Soft Penalty) */}
        <div className="mb-8 p-5 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <span>⚠️</span> People to Avoid (Optional)
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Applies a soft penalty (-8 pts) during optimization. Never a hard exclusion.
            </p>
          </div>

          <div className="space-y-1.5 mt-3">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={avoidIds.includes(c.id)}
                  onChange={() => toggleAvoid(c.id)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span className={avoidIds.includes(c.id) ? 'line-through text-gray-400' : ''}>
                  {c.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleProceed}
          disabled={rankedList.length < 3}
          className="w-full py-3 bg-[#3B6EA5] hover:bg-[#2F5986] text-white font-medium rounded-xl transition disabled:opacity-50 text-sm shadow-sm"
        >
          Proceed to Compatibility Questions →
        </button>
      </main>

      <Footer />
    </div>
  );
};
