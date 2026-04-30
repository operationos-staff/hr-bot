/**
 * paginate(fetchPage, options) — универсальный helper для cursor-less пагинации.
 *
 * Используется для HH /negotiations/response (где первая страница даёт 50 откликов
 * из 113 — без итерации мы видим только треть).
 *
 * @param {Function} fetchPage — async (page: number) => { items: any[], pages?: number }
 * @param {Object}   [options]
 * @param {number}   [options.perPage=50]   — размер страницы (на нём детектится «последняя страница» по items.length<perPage)
 * @param {number}   [options.maxPages=10]  — защита от бесконечного цикла, если API не вернёт meta.pages
 * @returns {Promise<any[]>} плоский массив всех items
 */
export async function paginate(fetchPage, { perPage = 50, maxPages = 10, pageDelayMs = 0 } = {}) {
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0 && pageDelayMs > 0) {
      // Небольшая пауза между страницами — снижает нагрузку на ddos-guard HH
      // при сборе откликов из 5+ вакансий за один цикл.
      await new Promise(r => setTimeout(r, pageDelayMs));
    }
    const data = await fetchPage(page);
    const items = Array.isArray(data?.items) ? data.items : [];
    all.push(...items);

    // Конец данных: страница неполная
    if (items.length < perPage) break;

    // API сообщил общее число страниц — стопаемся достигнув последней
    if (typeof data?.pages === 'number' && page >= data.pages - 1) break;
  }
  return all;
}
