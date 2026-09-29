import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-auto py-8 text-center text-xs text-gray-500 dark:text-gray-400">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span>Fair Team Matcher — Mathematical fairness without captains or skill ranking.</span>
        </div>
        <div className="flex gap-4">
          <Link to="/how-it-works" className="hover:underline">
            How It Works
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Source Spec
          </a>
        </div>
      </div>
    </footer>
  );
};
