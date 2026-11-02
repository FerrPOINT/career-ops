// Parser adapted from Fighter90/career-ops-ui (MIT), see docs/FORK_SOURCES.md.
// Public HTML only; /api/ is disallowed. A JS shell is unavailable, not empty.
import { htmlToText } from './_html-to-text.mjs';

export function parseGetMatchCards(html) {
  const anchors = [...String(html).matchAll(/<a\b[^>]*href="(\/vacancies\/[a-z\d][a-z\d-]*\/?)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const jobs = new Map();
  for (let index = 0; index < anchors.length; index++) {
    const match = anchors[index];
    const title = htmlToText(match[2]);
    if (!title || /^(все вакансии|all jobs)$/i.test(title)) continue;
    const block = html.slice(match.index + match[0].length, anchors[index + 1]?.index);
    const company = htmlToText(block.match(/class="[^"]*company[^"<>]*"[^>]*>([\s\S]*?)<\//i)?.[1] || '');
    const url = new URL(match[1], 'https://getmatch.ru').href;
    // The old scraper inferred remote from all markup after a link, including
    // the footer. No stable per-card workplace marker is verified currently.
    jobs.set(url, { title, company, location: '', url });
  }
  return [...jobs.values()];
}

export default {
  id: 'getmatch',
  detect(entry) { return entry?.provider === 'getmatch' ? { url: 'https://getmatch.ru/vacancies' } : null; },
  async fetch(entry, ctx) {
    const params = new URLSearchParams({ q: String(entry.getmatch?.query || '') });
    const html = await ctx.fetchText(`https://getmatch.ru/vacancies?${params}`, { redirect: 'error' });
    const jobs = parseGetMatchCards(html);
    // No stable empty-state marker is verified for the current JS application.
    if (!jobs.length) throw new Error('getmatch: public listing unavailable or changed; use the in-app browser, not the disallowed /api/');
    if (!ctx.maxPages) console.warn('getmatch: HTML preview only; completeness and remote status require page verification');
    return jobs;
  },
};
