import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { EnvCredentialsAuthGate } from '../../infrastructure/envAuthGate';
import { supabase } from '../../infrastructure/supabase/supabaseClient';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Try Supabase Auth email/password if input looks like email
      if (username.includes('@')) {
        const { error: sbError } = await supabase.auth.signInWithPassword({
          email: username,
          password,
        });

        if (!sbError) {
          navigate('/dashboard');
          return;
        }
      }

      // 2. Check EnvCredentialsAuthGate fallback
      const envAuth = new EnvCredentialsAuthGate();
      const success = envAuth.login(username, password);

      if (success) {
        navigate('/dashboard');
      } else {
        setError('Invalid credentials. Check your username/password or environment settings.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C]">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#252525] p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-[#3B6EA5] dark:text-[#699DD8] mb-1">
              Organizer Login
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sign in to create sessions, manage students/friends, and reveal results.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 mb-1">
                Username or Email
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin or name@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6EA5]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-600 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#3B6EA5]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#3B6EA5] hover:bg-[#2F5986] text-white font-medium rounded-lg transition disabled:opacity-50 text-sm shadow-sm"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};
