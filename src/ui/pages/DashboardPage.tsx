import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import { SupabaseSessionRepository } from '../../infrastructure/supabase/supabaseSessionRepository';
import { SessionCloneService } from '../../domain/session/sessionCloneService';
import type { Session } from '../../domain/session';

export const DashboardPage: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const sessionRepo = new SupabaseSessionRepository(supabase);
  const cloneService = new SessionCloneService(sessionRepo);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch sessions for this organizer or all public demo sessions
      const { data, error: sbError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (sbError) throw sbError;

      const loaded: Session[] = (data ?? []).map((row) => ({
        id: row.id,
        mode: row.mode,
        teamSize: row.team_size,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));

      setSessions(loaded);
    } catch (err: unknown) {
      // If offline or mock, provide in-memory placeholder
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Failed to load sessions from Supabase:', msg);
      setError('Could not connect to live database. You can still create new sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDuplicate = async (session: Session) => {
    setDuplicatingId(session.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const createdBy = user ? user.id : 'env-organizer-id';

      const newSession = await cloneService.duplicateConfig({
        sourceSessionId: session.id,
        createdBy,
      });

      navigate(`/session/${newSession.id}/monitor`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Duplication failed: ${msg}`);
    } finally {
      setDuplicatingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8]">
              Organizer Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage team matching sessions, view past groupings, and duplicate templates.
            </p>
          </div>

          <Link
            to="/create"
            className="px-4 py-2.5 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-sm font-medium rounded-lg shadow-sm transition flex items-center gap-2"
          >
            <span>➕</span>
            <span>Create New Session</span>
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-24 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800">
            <span className="text-4xl mb-3 block">📋</span>
            <h3 className="text-lg font-semibold mb-1">No sessions yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Create your first Friend Mode or Class Mode session to get started.
            </p>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#3B6EA5] text-white rounded-lg text-sm font-medium hover:bg-[#2F5986]"
            >
              <span>➕</span>
              <span>Create Session</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-[#252525] p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        s.mode === 'friend'
                          ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'
                          : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {s.mode === 'friend' ? 'Friend Mode' : 'Class Mode'}
                    </span>

                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.status === 'revealed' || s.status === 'locked'
                          ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200'
                          : s.status === 'open'
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                          : s.status === 'expired'
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/60 text-yellow-800 dark:text-yellow-200'
                      }`}
                    >
                      {s.status.toUpperCase()}
                    </span>
                  </div>

                  <h3 className="font-semibold text-base">
                    Session <span className="font-mono text-sm text-gray-500">#{s.id.slice(0, 8)}</span>
                  </h3>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Team size: {s.teamSize} | Created: {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDuplicate(s)}
                    disabled={duplicatingId === s.id}
                    title="Duplicate configuration (mode & team size only)"
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-medium rounded-lg transition"
                  >
                    {duplicatingId === s.id ? 'Duplicating...' : 'Duplicate Config'}
                  </button>

                  {s.status === 'revealed' || s.status === 'locked' ? (
                    <Link
                      to={`/session/${s.id}/results`}
                      className="px-3.5 py-1.5 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-medium rounded-lg transition"
                    >
                      View Results
                    </Link>
                  ) : (
                    <Link
                      to={`/session/${s.id}/monitor`}
                      className="px-3.5 py-1.5 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-medium rounded-lg transition"
                    >
                      Live Monitor
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
