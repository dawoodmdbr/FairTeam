import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ui/theme/ThemeProvider';

import { LoginPage } from './ui/pages/LoginPage';
import { DashboardPage } from './ui/pages/DashboardPage';
import { CreateSessionPage } from './ui/pages/CreateSessionPage';
import { LiveMonitorPage } from './ui/pages/LiveMonitorPage';
import { ResultsOrganizerPage } from './ui/pages/ResultsOrganizerPage';
import { ParticipantIdentifyPage } from './ui/pages/ParticipantIdentifyPage';
import { FriendRankPage } from './ui/pages/FriendRankPage';
import { QuestionsPage } from './ui/pages/QuestionsPage';
import { SubmittedPage } from './ui/pages/SubmittedPage';
import { ParticipantResultPage } from './ui/pages/ParticipantResultPage';
import { HowItWorksPage } from './ui/pages/HowItWorksPage';

const queryClient = new QueryClient();

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/create" element={<CreateSessionPage />} />
            <Route path="/session/:id/monitor" element={<LiveMonitorPage />} />
            <Route path="/session/:id/results" element={<ResultsOrganizerPage />} />
            <Route path="/session/:id" element={<ParticipantIdentifyPage />} />
            <Route path="/session/:id/rank" element={<FriendRankPage />} />
            <Route path="/session/:id/questions" element={<QuestionsPage />} />
            <Route path="/session/:id/submitted" element={<SubmittedPage />} />
            <Route path="/session/:id/result" element={<ParticipantResultPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
