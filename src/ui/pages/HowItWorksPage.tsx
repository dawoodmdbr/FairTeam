import React from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export const HowItWorksPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#1C1C1C] text-[#2B2B2B] dark:text-[#F0F0F0]">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#3B6EA5] dark:text-[#699DD8] sm:text-4xl mb-4">
            How Fair Team Matcher Works
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            A team formation system built on mathematical fairness, total privacy, and reproducible outcomes.
          </p>
        </div>

        <section className="space-y-8 text-base leading-relaxed">
          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold mb-3 text-[#3B6EA5] dark:text-[#699DD8] flex items-center gap-2">
              <span>🎯</span> No Randomness
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Traditional team formation tools rely on random shuffling, which creates arbitrary and often lopsided groups.
              Fair Team Matcher uses an exact optimization algorithm. Given identical inputs, it will always compute the
              exact same team assignments down to the byte.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold mb-3 text-[#3B6EA5] dark:text-[#699DD8] flex items-center gap-2">
              <span>🚫</span> Never Rating or Ranking Skill
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              No one's competency, coding level, GPA, or perceived skill is ever measured, stored, or requested. Teams are
              formed purely around <strong>working compatibility</strong>: weekly time commitment, schedule overlap,
              communication preferences, and role interests.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold mb-3 text-[#3B6EA5] dark:text-[#699DD8] flex items-center gap-2">
              <span>🛡️</span> Private Rankings in Friend Mode
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              When friends rank preferred teammates, those choices are strictly private. Not even the group organizer or
              team creator can view anyone's raw rankings or avoid markers. The database uses cryptographic Row-Level Security
              (RLS) that permanently denies client read access to ranking tables.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold mb-3 text-[#3B6EA5] dark:text-[#699DD8] flex items-center gap-2">
              <span>📐</span> Maximin Fairness Objective
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Most optimization tools try to maximize the <em>average</em> satisfaction score. The problem is that an
              average can be high even if one team is completely dysfunctional.
            </p>
            <div className="p-4 bg-gray-50 dark:bg-[#1E1E1E] rounded-lg border border-gray-200 dark:border-gray-700 font-mono text-sm">
              FairnessScore(grouping) = MIN(TeamScore) across all teams
            </div>
            <p className="text-gray-600 dark:text-gray-300 mt-4">
              Our algorithm searches for the partition that makes the <strong>least happy (weakest) team as strong as possible</strong>.
              This guarantees that no team is sacrificed for the benefit of others.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-xl font-bold mb-3 text-[#3B6EA5] dark:text-[#699DD8] flex items-center gap-2">
              <span>🔍</span> Full Transparency: Alternative Groupings
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              When results are revealed, the system displays the winning grouping alongside the top 2–3 runner-up groupings.
              These alternatives are display-only—the organizer cannot manually swap people or override the mathematical winner,
              preventing favoritism while proving that the chosen grouping genuinely outperformed other options.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};
