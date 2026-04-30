import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { VacancyPicker } from './VacancyPicker';
import { useEffect, useRef } from 'react';
import { applyTelegramTheme, tg, tgStartParam } from '@/lib/telegram';

export function Layout() {
  const location = useLocation();
  const nav = useNavigate();
  const handledStartParam = useRef(false);
  // VacancyPicker показываем на основных страницах, прячем на детали кандидата, settings и vacancies
  const showVacancyPicker = !/^\/(candidate|settings|vacancies)/.test(location.pathname);

  useEffect(() => {
    applyTelegramTheme();
  }, []);

  // Deep-link: ?startapp=candidate_<source>_<external_id> → /candidate/:source/:externalId
  useEffect(() => {
    if (handledStartParam.current) return;
    if (!tgStartParam) return;
    handledStartParam.current = true;
    const m = /^candidate_([a-zA-Z0-9]+)_(.+)$/.exec(tgStartParam);
    if (m) {
      const [, source, externalId] = m;
      nav(`/candidate/${source}/${externalId}`, { replace: true });
    }
  }, [nav]);

  // Скроллим наверх при переходе между табами
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  // BackButton — показывать только не на корневых табах
  useEffect(() => {
    if (!tg?.BackButton) return;
    const isDeep = /^\/candidate\//.test(location.pathname);
    if (isDeep) tg.BackButton.show();
    else tg.BackButton.hide();
    const handler = () => history.back();
    const btn = tg.BackButton;
    btn.onClick(handler);
    return () => { btn.offClick(handler); };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-tg-bg pb-[calc(72px+env(safe-area-inset-bottom))]">
      <main className="mx-auto max-w-2xl">
        {showVacancyPicker && <VacancyPicker />}
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
