import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { RankingPage } from './pages/RankingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { CandidateDetailPage } from './pages/CandidateDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { VacanciesPage } from './pages/VacanciesPage';
import { VacancyProvider } from './lib/useVacancy';
import { isInTelegram } from './lib/telegram';
import { OutsideTelegramGate } from './components/OutsideTelegramGate';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  // Если фронт открыт ВНЕ Telegram (старые карточки канала с прежним URL),
  // показываем заглушку с deeplink на бота вместо пустого экрана и 401-ошибок.
  if (!isInTelegram) {
    return <OutsideTelegramGate />;
  }
  return (
    <QueryClientProvider client={qc}>
      <VacancyProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<RankingPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/inbox" element={<ApplicationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/vacancies" element={<VacanciesPage />} />
              <Route path="/candidate/:source/:externalId" element={<CandidateDetailPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </VacancyProvider>
    </QueryClientProvider>
  );
}
