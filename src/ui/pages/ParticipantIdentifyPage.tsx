import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { Session } from '../../domain/session';
import type { Participant } from '../../domain/participant';

export const ParticipantIdentifyPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const loadSession = async () => {
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

        // If session is already revealed, send directly to results
        if (sess.status === 'revealed' || sess.status === 'locked') {
          navigate(`/session/${sessionId}/result`);
          return;
        }

        if (sess.status === 'expired') {
          setError('This session has expired and can no longer accept submissions.');
          return;
        }

        // Fetch participant list
        const { data: pData } = await supabase
          .from('participants')
          .select('*')
          .eq('session_id', sessionId);

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
        setError(`Failed to load session: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [sessionId, navigate]);

  const handleFriendIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedName) {
      setError('Please select your name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Invoke identify-participant edge function to enforce rate limiting & submission check
      const { data, error: idErr } = await supabase.functions.invoke('identify-participant', {
        body: {
          sessionId,
          mode: 'friend',
          name: selectedName,
        },
      });

      if (idErr || data?.error) {
        throw new Error(data?.error?.message || idErr?.message || 'Identification failed');
      }

      const participant = data.participant;
      sessionStorage.setItem('ftm_participant_id', participant.id);
      sessionStorage.setItem('ftm_participant_name', participant.name);

      // Friend Mode proceeds to Rank Teammates
      navigate(`/session/${sessionId}/rank`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClassGoogleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmailInput.trim()) {
      setError('Please enter your university Google email.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { data, error: idErr } = await supabase.functions.invoke('identify-participant', {
        body: {
          sessionId,
          mode: 'class',
          googleEmail: googleEmailInput.trim(),
        },
      });

      if (idErr || data?.error) {
        throw new Error(data?.error?.message || idErr?.message || 'Authentication rejected');
      }

      const participant = data.participant;
      sessionStorage.setItem('ftm_participant_id', participant.id);
      sessionStorage.setItem('ftm_participant_roll', participant.roll_number);

      // Class Mode skips ranking and goes directly to questions
      navigate(`/session/${sessionId}/questions`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={session?.mode} />

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-12 flex flex-col justify-center">
        <div className="bg-white dark:bg-[#252525] p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-center mb-6">
            <span className="text-4xl block mb-2">{session?.mode === 'friend' ? '👥' : '🎓'}</span>
            <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
              Identify Yourself
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {session?.mode === 'friend'
                ? 'Select your name from the group roster to continue.'
                : 'Sign in with your verified FAST-NUCES Google account.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs leading-relaxed text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {session?.mode === 'friend' ? (
            <form onSubmit={handleFriendIdentify} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 dark:text-gray-300 mb-1">
                  Your Name
                </label>
                <select
                  required
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm focus:ring-2 focus:ring-[#3B6EA5]"
                >
                  <option value="">-- Choose your name --</option>
                  {participants
                    .filter((p) => !p.hasSubmitted)
                    .map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedName}
                className="w-full py-2.5 bg-[#3B6EA5] hover:bg-[#2F5986] text-white font-medium rounded-lg transition disabled:opacity-50 text-sm shadow-sm"
              >
                {submitting ? 'Verifying...' : 'Continue to Teammate Ranking →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleClassGoogleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 dark:text-gray-300 mb-1">
                  NUCES Google Account Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. f243053@cfd.nu.edu.pk"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm font-mono focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Accepted domains: @cfd.nu.edu.pk, @lhr.nu.edu.pk, @isb.nu.edu.pk
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !googleEmailInput}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition disabled:opacity-50 text-sm shadow-sm flex items-center justify-center gap-2"
              >
                <span>Google</span>
                <span>{submitting ? 'Verifying...' : 'Authenticate with Google Email'}</span>
              </button>
            </form>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
