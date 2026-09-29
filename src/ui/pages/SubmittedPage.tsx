import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { supabase } from '../../infrastructure/supabase/supabaseClient';
import type { Session } from '../../domain/session';

export const SubmittedPage: React.FC = () => {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data) {
          setSession({
            id: data.id,
            mode: data.mode,
            teamSize: data.team_size,
            status: data.status,
            createdBy: data.created_by,
            createdAt: data.created_at,
            expiresAt: data.expires_at,
          });
        }
      });
  }, [sessionId]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar mode={session?.mode} />

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-16 flex flex-col justify-center text-center">
        <div className="bg-white dark:bg-[#252525] p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="w-14 h-14 bg-green-100 dark:bg-green-950/60 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
            ✓
          </div>

          <h1 className="text-2xl font-bold mb-2">Responses Submitted!</h1>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Your answers have been securely recorded. You cannot edit or resubmit.
          </p>

          {session?.mode === 'friend' ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-900 dark:text-blue-200 mb-6 text-left leading-relaxed">
              <strong>What happens next:</strong> Once your organizer reveals the final teams, you can return to this page to view <em>your own team only</em> and the mathematical reason for your placement.
            </div>
          ) : (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 mb-6 text-left leading-relaxed">
              <strong>Class Mode Notice:</strong> In Class Mode, results and student answers are accessible only to the course instructor/TA. Your instructor will announce the final team assignments in class or via LMS.
            </div>
          )}

          {session?.mode === 'friend' && (
            <Link
              to={`/session/${sessionId}/result`}
              className="inline-block w-full py-2.5 bg-[#3B6EA5] hover:bg-[#2F5986] text-white text-xs font-semibold rounded-lg shadow-sm transition"
            >
              Check for Revealed Results →
            </Link>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};
