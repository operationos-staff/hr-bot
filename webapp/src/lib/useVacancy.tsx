/**
 * Контекст текущей выбранной вакансии (D5).
 * - null = «Все вакансии» (показываем всё, без фильтра)
 * - string = id вакансии из БД
 *
 * Сохраняется в localStorage между сессиями. При перезаходе в Mini App
 * пользователь оказывается на той же вакансии, что и в прошлый раз.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const LS_KEY = 'bot-hh-habr.selected-vacancy-id';

type VacancyCtx = {
  selectedVacancyId: string | null;
  setSelectedVacancyId: (id: string | null) => void;
};

const Ctx = createContext<VacancyCtx | undefined>(undefined);

export function VacancyProvider({ children }: { children: ReactNode }) {
  const [selectedVacancyId, _setSelectedVacancyId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw && raw !== 'null' ? raw : null;
    } catch {
      return null;
    }
  });

  const setSelectedVacancyId = (id: string | null) => {
    _setSelectedVacancyId(id);
    try {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    } catch { /* приватный режим браузера */ }
  };

  // На случай восстановления, если в LS лежит id, которого больше нет в БД —
  // не делаем ничего здесь, сама страница рейтинга вернёт пустой список,
  // пользователь сможет переключиться на «Все».

  useEffect(() => {
    // Просто placeholder для возможного будущего sync.
  }, []);

  return (
    <Ctx.Provider value={{ selectedVacancyId, setSelectedVacancyId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useVacancy(): VacancyCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVacancy must be used inside VacancyProvider');
  return v;
}
