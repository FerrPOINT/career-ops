import { fetchTextWithRetry, sleep } from './_http.mjs';
// Inspired by Fighter90/career-ops-ui (MIT); adapted to current public /vacancies cards.
// Configure under job_boards: { provider: geekjob, geekjob: { query: Java } }.
import { htmlToText } from './_html-to-text.mjs';
import { intInRange } from './_config-utils.mjs';

export function parseGeekJobCards(html) {
  const jobs = new Map();
  for (const match of String(html).matchAll(/<li\b[^>]*class="[^"]*collection-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    const heading = block.match(/<p\b[^>]*class="[^"]*vacancy-name[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
    const link = heading.match(/<a\b[^>]*href="\/vacancy\/([a-f\d]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = htmlToText(link[2]);
    if (!title) continue;
    const company = htmlToText(block.match(/<p\b[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const address = htmlToText(block.match(/<div\b[^>]*class="info"[^>]*>\s*<a[^>]*>([\s\S]*?)(?:<br\s*\/?\s*>|<\/a>)/i)?.[1] || '');
    const remote = /class="[^"]*remote-label[^"]*"/i.test(block);
    const url = `https://geekjob.ru/vacancy/${link[1]}`;
    jobs.set(url, { title, company, url, location: [address, remote ? 'Remote' : ''].filter(Boolean).join(', ') });
  }
  return [...jobs.values()];
}

export default {
  id: 'geekjob',
  detect(entry) { return entry?.provider === 'geekjob' ? { url: 'https://geekjob.ru/vacancies' } : null; },
  async fetch(entry, ctx) {
    const options = entry.geekjob || {};
    const cap = Math.min(intInRange(entry.max_pages, 10, 1, 50), intInRange(ctx.maxPages, 50, 1, 50));
    const jobs = new Map();
    const seen = new Set();
    for (let page = 1; page <= cap; page++) {
      const params = new URLSearchParams({ qs: String(options.query || '') });
      const path = page === 1 ? '/vacancies' : `/vacancies/${page}`;
      const html = await fetchTextWithRetry(ctx, `https://geekjob.ru${path}?${params}`, { redirect: 'error' });
      if (!/id="(?:serplist|paginator)"/i.test(html)) throw new Error('geekjob: listing markup missing, not an empty result');
      const rows = parseGeekJobCards(html);
      if (!rows.length && /href="\/vacancy\/[a-f\d]+"/i.test(html)) throw new Error('geekjob: postings present but parser found no cards');
      let added = 0;
      for (const job of rows) {
        if (!seen.has(job.url)) added++;
        seen.add(job.url);
        if (options.only_remote === true && !job.location.includes('Remote')) continue;
        jobs.set(job.url, job);
      }
      const next = new RegExp(`href="/vacancies/${page + 1}(?:[?"/])`);
      if (!next.test(html)) break;
      if (!added && rows.length && page > 1) throw new Error('geekjob: pagination repeated a page; results are incomplete');
      if (page === cap) { if (!ctx.maxPages) console.warn('geekjob: partial result; raise max_pages (hard cap 50)'); break; }
      await sleep(400, ctx);
    }
    return [...jobs.values()];
  },
};
