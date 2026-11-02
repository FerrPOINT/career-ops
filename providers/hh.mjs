import { fetchJsonWithRetry, sleep } from './_http.mjs';
// Public HeadHunter API only. HTML search is excluded by the source policy.
// Configure in job_boards: { provider: hh, hh: { query: Java, site: hh.ru } }.
import { intInRange } from './_config-utils.mjs';
import { htmlToText } from './_html-to-text.mjs';

export const HH_SITES = new Set(['hh.ru', 'rabota.by', 'hh.kz', 'hh.uz', 'hh1.az', 'headhunter.ge', 'headhunter.kg']);

export function normalizeHH(row, site) {
  if (!row || typeof row.name !== 'string' || !row.name.trim() || !/^\d+$/.test(String(row.id))) return null;
  const remote = (Array.isArray(row.work_format) && row.work_format.some((item) => item?.id === 'REMOTE')) || row.schedule?.id === 'remote';
  const job = {
    title: htmlToText(row.name), company: htmlToText(row.employer?.name || ''),
    url: `https://${site}/vacancy/${row.id}`,
    location: [htmlToText(row.area?.name || ''), remote ? 'Remote' : ''].filter(Boolean).join(', '),
    externalId: String(row.id),
  };
  const date = Date.parse(row.published_at);
  if (Number.isFinite(date)) job.postedAt = date;
  const description = htmlToText([row.snippet?.requirement, row.snippet?.responsibility].filter(Boolean).join(' '));
  if (description) job.description = description;
  // The core salary contract is annual. Do not guess the period or gross/net
  // of HH amounts: the posting remains the source for compensation checks.
  return job;
}

export default {
  id: 'hh',
  detect(entry) { return entry?.provider === 'hh' ? { url: 'https://api.hh.ru/vacancies' } : null; },
  async fetch(entry, ctx) {
    const options = entry.hh || {};
    const site = options.site || 'hh.ru';
    if (!HH_SITES.has(site)) throw new Error('hh: unsupported site; use an official HeadHunter market');
    const cap = Math.min(intInRange(entry.max_pages, 5, 1, 20), intInRange(ctx.maxPages, 20, 1, 20));
    const jobs = new Map();
    for (let page = 0; page < cap; page++) {
      const params = new URLSearchParams({ text: String(options.query || ''), host: site, order_by: 'publication_time', per_page: '100', page: String(page) });
      if (options.area != null) params.set('area', String(options.area));
      if (options.period_days != null) params.set('period', String(intInRange(options.period_days, 3, 1, 30)));
      if (options.only_remote === true) params.set('work_format', 'REMOTE');
      let data;
      try {
        data = await fetchJsonWithRetry(ctx, `https://api.hh.ru/vacancies?${params}`, { redirect: 'error' });
      } catch (error) {
        // No auth/captcha bypass, user-agent rotation, or HTML fallback.
        if (ctx.maxPages) throw error;
        if ([401, 403, 429].includes(error.status)) error.message = `hh: API access unavailable (HTTP ${error.status}); use the Codex in-app browser or supplied JD text`;
        throw error;
      }
      if (!data || !Array.isArray(data.items) || !Number.isInteger(data.pages) || data.pages < 0) throw new Error('hh: invalid API envelope (expected items and pages)');
      for (const row of data.items) {
        const job = normalizeHH(row, site);
        if (job?.title) jobs.set(job.url, job);
      }
      if (!data.items.length || page + 1 >= data.pages) break;
      if (page + 1 === cap) { if (!ctx.maxPages) console.warn('hh: partial API window; narrow the query or raise max_pages (hard cap 20)'); break; }
      await sleep(400, ctx);
    }
    return [...jobs.values()];
  },
};
