import { fetchTextWithRetry, sleep } from './_http.mjs';
// Adapted from Fighter90/career-ops-ui, MIT; see docs/FORK_SOURCES.md.
// Public Habr Career search, configured under job_boards with provider: habr-career.
import { decodeEntities } from './_html-entities.mjs';
import { htmlToText } from './_html-to-text.mjs';
import { intInRange } from './_config-utils.mjs';
const HABR_BASE = 'https://career.habr.com';
const stripDecoded = (text) => htmlToText(text);
const QUALIFICATION_CHIP =
  /^(?:junior|middle|senior|lead|intern|стаж[её]р|младший|средний|старший|ведущий)(?![\p{L}\p{N}])/iu;

// CAR-142 — a meta chip that merely is not the remote marker or a
// qualification is not necessarily a city: the relocation notice
// («Возможна релокация») and employment types («Полный рабочий день»,
// «Полная занятость», «Стажировка») sit in the same row, and a city-less
// card used to wear the relocation text as its `location`. These chips are
// never candidates.
const RELOCATION_CHIP = /релок|reloc|переезд/i;
const EMPLOYMENT_CHIP =
  /рабоч(?:ий|их) (?:день|час)|час(?:а|ов) в день|день в неделю|занятость|график|стажировк|волонт[её]р|вахтов|проектная|оформлени|командировк/i;
// CAR-142 rev-3 #3 — «Опыт от 3 лет» passes every filter above but is an
// experience REQUIREMENT, not a city: the chip-order fallback used to wear it
// as `location` (a fabricated place). ASCII `\b` never bounds Cyrillic, so
// the lookahead follows the QUALIFICATION_CHIP pattern.
const EXPERIENCE_CHIP = /^опыт(?![\p{L}\p{N}])/iu;
// Habr marks the real city structurally — it links the chip to the
// city-filtered board (?city_id=…) and/or carries a location icon class
// (the Cyrillic «с» in loсation is Habr's own). Preferred over chip order.
const LOCATION_HINT = /city_id=|meta_lo[сc]ation|svg-icon-(?:lo[сc]ation|earth|map)/i;

/**
 * CAR-142 — pick the city chip from a card's meta row. Every chip keeps the
 * markup BETWEEN it and the previous chip (its "lead"): the location link
 * and icon class live there, so a structurally marked chip wins over an
 * earlier chip that merely passes the text filters.
 */
function pickCityChip(metaBlock) {
  const chips = [];
  const re = /chip-with-icon__text">([^<]+)</g;
  let m, end = 0;
  while ((m = re.exec(metaBlock)) !== null) {
    chips.push({ lead: metaBlock.slice(end, m.index), text: decodeEntities(m[1].trim()) });
    end = m.index + m[0].length;
  }
  const isCity = (c) =>
    c.text && c.text !== 'Можно удалённо'
    && !QUALIFICATION_CHIP.test(c.text)
    && !RELOCATION_CHIP.test(c.text)
    && !EMPLOYMENT_CHIP.test(c.text)
    && !EXPERIENCE_CHIP.test(c.text);
  return (chips.find((c) => isCity(c) && LOCATION_HINT.test(c.lead)) || chips.find(isCity) || {}).text || '';
}

export function parseHabrCards(html) {
  if (!html) return [];
  const out = [];
  // Paid and ordinary cards share the same source contract. The modifier
  // class must not drop real postings from the scan or merge two card bodies.
  const cardRe = /<div class="vacancy-card(?:\s+[^"<>]*)?">([\s\S]*?)(?=<div class="vacancy-card(?:\s+[^"<>]*)?">|<\/div>\s*<\/section>)/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const block = m[1];

    const titleMatch = block.match(
      /vacancy-card__title-link"\s+href="([^"]+)"[^>]*>\s*([^<]+?)\s*</
    );
    if (!titleMatch) continue;

    const id = (titleMatch[1].match(/^\/vacancies\/(\d+)\/?$/) || [])[1];
    if (!id) continue;
    const company = (block.match(
      /vacancy-card__company"[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*</
    ) || [])[1];
    const salary = (block.match(/basic-salary[^>]*>([^<]+)</) || [])[1];
    const date = (block.match(/<time[^>]*datetime="([^"]+)"/) || [])[1];

    // chip-with-icon__text yields experience level + remote tag
    const chips = [...block.matchAll(/chip-with-icon__text">([^<]+)</g)].map(
      (c) => c[1].trim()
    );

    const isRemote = chips.includes('Можно удалённо');
    const hasRelocation = chips.some((ch) => /релок|reloc/i.test(ch));
    // CAR-105 — the meta row is "qualification · remote marker · CITY"; the
    // city feeds `location` so the job map can geocode a real place instead
    // of the country string 'Russia' (a country centroid is exactly what the
    // geocoder refuses, so every Habr row landed in the map's no-location
    // bucket). Skills chips live in their own section AFTER the meta row and
    // are excluded by slicing at it; qualification levels, relocation,
    // employment-type and experience chips are excluded by name, and a
    // structurally marked city chip (?city_id= link / location icon) wins
    // over chip order (CAR-142).
    const metaEnd = block.indexOf('vacancy-card__skills');
    const metaBlock = metaEnd === -1 ? block : block.slice(0, metaEnd);
    const city = pickCityChip(metaBlock);
    out.push({
      id: id ? `habr-${id}` : `habr-${out.length}`,
      // Decode HTML entities BEFORE the title reaches title_filter and before
      // the company name flows on to the tracker/reports — the SSR cards arrive
      // escaped ("Changellenge &gt;&gt;", "ООО &quot;М-ТЕХ&quot;"), so an undecoded
      // "&" in a role silently failed a user's own "&" keyword (v1.210.1).
      title: stripDecoded(titleMatch[2].trim()),
      company: stripDecoded(company?.trim() || ''),
      url: HABR_BASE + `/vacancies/${id}`,
      salary: (salary || '').trim(),
      location: city || (isRemote ? 'Remote' : ''),
      isRemote,
      relocates: hasRelocation,
      workplaceType: isRemote ? 'Remote' : 'Onsite',
      date: date || '',
      snippet: chips.join(' · '),
      source: 'habr-career',
    });
  }
  return out;
}


export default {
  id: 'habr-career',
  detect(entry) { return entry?.provider === 'habr-career' ? { url: HABR_BASE + '/vacancies' } : null; },
  async fetch(entry, ctx) {
    const options = entry.habr || {};
    const cap = Math.min(intInRange(entry.max_pages, 10, 1, 50), intInRange(ctx.maxPages, 50, 1, 50));
    const jobs = new Map();
    for (let page = 1; page <= cap; page++) {
      const params = new URLSearchParams({ q: String(options.query || ''), type: 'all', sort: 'date', page: String(page) });
      if (options.only_remote === true) params.set('remote', '1');
      const html = await fetchTextWithRetry(ctx, `${HABR_BASE}/vacancies?${params}`, { redirect: 'error' });
      const hasCards = /<div\b[^>]*class="vacancy-card(?:\s|\")/i.test(html);
      const verifiedEmpty = /class="no-content__title"[^>]*>\s*Поиск не дал результатов\s*</i.test(html);
      if (!hasCards && !verifiedEmpty) throw new Error('habr-career: listing markup missing, not an empty result');
      const rows = parseHabrCards(html);
      if (!rows.length && /href=["']\/vacancies\/\d+/i.test(html)) throw new Error('habr-career: postings present but parser found no cards');
      for (const row of rows) {
        if (options.only_remote === true && !row.isRemote) continue;
        const job = { title: row.title, company: row.company, url: row.url, location: [row.location === 'Remote' ? '' : row.location, row.isRemote ? 'Remote' : ''].filter(Boolean).join(', ') };
        const date = Date.parse(row.date);
        if (Number.isFinite(date)) job.postedAt = date;
        if (job.title) jobs.set(job.url, job);
      }
      const next = new RegExp(`(?:[?&]|&amp;)page=${page + 1}(?:[&\"']|&amp;)`);
      if (!next.test(html)) break;
      if (page === cap) { if (!ctx.maxPages) console.warn('habr-career: partial result; raise max_pages (hard cap 50)'); break; }
      await sleep(400, ctx);
    }
    return [...jobs.values()];
  },
};
