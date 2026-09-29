import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { EnvCredentialsAuthGate } from '../../infrastructure/envAuthGate';
import { supabase } from '../../infrastructure/supabase/supabaseClient';

export const Navbar: React.FC<{ mode?: 'friend' | 'class' }> = ({ mode }) => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const envAuth = new EnvCredentialsAuthGate();
  const isEnvAuth = localStorage.getItem('ftm_env_auth') === 'authenticated_organizer';

  const handleLogout = async () => {
    envAuth.logout();
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-[#1C1C1C]/80 backdrop-blur-sm sticky top-0 z-50 transition-colors">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold text-lg text-[#3B6EA5] dark:text-[#699DD8] tracking-tight flex items-center gap-2">
            <span>⚖️</span>
            <span>Fair Team Matcher</span>
          </Link>
          {mode && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                mode === 'friend'
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'
                  : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
              }`}
            >
              {mode === 'friend' ? 'Friend Mode' : 'Class Mode'}
            </span>
          )}
        </div>

        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            to="/how-it-works"
            className="text-gray-600 dark:text-gray-300 hover:text-[#3B6EA5] dark:hover:text-[#699DD8] transition-colors"
          >
            How This Works
          </Link>

          <Link
            to="/dashboard"
            className="text-gray-600 dark:text-gray-300 hover:text-[#3B6EA5] dark:hover:text-[#699DD8] transition-colors"
          >
            Dashboard
          </Link>

          {isEnvAuth && (
            <button
              onClick={handleLogout}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Sign out
            </button>
          )}

          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </nav>
      </div>
    </header>
  );
};
