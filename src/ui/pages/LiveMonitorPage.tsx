import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { Session } from '../../domain/session';
import type { Participant } from '../../domain/participant';

export const LiveMonitorPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit participant before lock
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const navigate = useNavigate();

  const fetchStatus = async () => {
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

      if (sess.status === 'revealed' || sess.status === 'locked') {
        navigate(`/session/${sessionId}/results`);
        return;
      }

      const { data: pData, error: pErr } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (pErr) throw pErr;

      setParticipants(
        (pData ?? []).map((p) => ({
          id: p.id,
          sessionId: p.session_id,
          name: p.name ?? undefined,
          rollNumber: p.roll_number ?? undefined,
          hasSubmitted: p.has_submitted,
        }))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const shareableUrl = `${window.location.origin}/session/${sessionId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveParticipant = async (pId: string) => {
    if (!session || (session.status !== 'draft' && session.status !== 'open')) {
      alert('Cannot remove participants once session is locked or expired.');
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('participants')
        .delete()
        .eq('id', pId);

      if (delErr) throw delErr;
      setParticipants((prev) => prev.filter((p) => p.id !== pId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Remove failed: ${msg}`);
    }
  };

  const handleSaveEdit = async (pId: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) return;

    try {
      const updateData =
        session?.mode === 'friend' ? { name: trimmed } : { roll_number: trimmed };

      const { error: updErr } = await supabase
        .from('participants')
        .update(updateData)
        .eq('id', pId);

      if (updErr) throw updErr;

      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id !== pId) return p;
          return session?.mode === 'friend'
            ? { ...p, name: trimmed }
            : { ...p, rollNumber: trimmed };
        })
      );
      setEditingId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Edit failed: ${msg}`);
    }
  };

  const handleReveal = async () => {
    if (!sessionId) return;
    const submittedCount = participants.filter((p) => p.hasSubmitted).length;
    if (submittedCount < 2) {
      alert('At least 2 participants must submit responses before revealing.');
      return;
    }

    if (
      submittedCount < participants.length &&
      !window.confirm(
        `Only ${submittedCount} of ${participants.length} participants have submitted. Non-submitted participants will be excluded from team matching. Proceed with Reveal?`
      )
    ) {
      return;
    }

    setRevealing(true);
    setError(null);

    try {
      const { error: revErr } = await supabase.functions.invoke('reveal-session', {
        body: { sessionId },
      });

      if (revErr) throw revErr;
      navigate(`/session/${sessionId}/results`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Reveal error: ${msg}`);
      setRevealing(false);
    }
  };

  const submittedCount = participants.filter((p) => p.hasSubmitted).length;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading session status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={session?.mode} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
              Live Submission Monitor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Share the participation link and watch live progress before running match optimization.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Shareable Link Box */}
        <div className="mb-6 p-5 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Shareable Participant Link
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={shareableUrl}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-[#1E1E1E] text-xs font-mono select-all focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-medium rounded-lg transition"
            >
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Participants open this link to identify themselves and submit answers.
          </p>
        </div>

        {/* Live Progress Card */}
        <div className="mb-6 p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-3xl font-extrabold text-[#3B6EA5] dark:text-[#699DD8]">
                {submittedCount}{' '}
                <span className="text-lg font-normal text-gray-400">/ {participants.length}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider mt-1">
                Submissions Recorded
              </div>
            </div>

            <button
              onClick={handleReveal}
              disabled={revealing || submittedCount < 2}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition disabled:opacity-50 text-sm flex items-center gap-2"
            >
              <span>✨</span>
              <span>{revealing ? 'Computing Matches...' : 'Reveal Results'}</span>
            </button>
          </div>

          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden mb-6">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${participants.length > 0 ? (submittedCount / participants.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Participant Roster Table */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
            {participants.map((p, idx) => (
              <div
                key={p.id}
                className="py-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-5">{idx + 1}.</span>
                  {editingId === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="px-2 py-1 border rounded text-xs bg-transparent"
                      />
                      <button
                        onClick={() => handleSaveEdit(p.id)}
                        className="text-green-600 font-bold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {p.name ?? p.rollNumber}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {p.hasSubmitted ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium text-[11px] flex items-center gap-1">
                      <span>✓</span> Submitted
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium text-[11px]">
                      Pending
                    </span>
                  )}

                  {!p.hasSubmitted && editingId !== p.id && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(p.id);
                          setEditValue(p.name ?? p.rollNumber ?? '');
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        title="Edit participant before lock"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleRemoveParticipant(p.id)}
                        className="text-red-400 hover:text-red-600 text-sm font-bold"
                        title="Remove participant before lock"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
