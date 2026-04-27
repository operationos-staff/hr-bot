import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useEffect } from 'react';
import { applyTelegramTheme, tg } from '@/lib/telegram';

export function Layout() {
  const location = useLocation();

  useEffect(() => {
    applyTelegramTheme();
  }, []);

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
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
