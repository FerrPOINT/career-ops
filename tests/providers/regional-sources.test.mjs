import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProviders, resolveProvider } from '../../providers/_registry.mjs';
import habr, { parseHabrCards } from '../../providers/habr-career.mjs';
import geekjob, { parseGeekJobCards } from '../../providers/geekjob.mjs';
import getmatch, { parseGetMatchCards } from '../../providers/getmatch.mjs';
import hh, { normalizeHH } from '../../providers/hh.mjs';
import dou from '../../providers/dou.mjs';
import djinni from '../../providers/djinni.mjs';
import { fileURLToPath } from 'node:url';

const habrCard = (id, { remote = true, city = 'Томск', title = 'Java &amp; Kafka' } = {}) => `<div class="vacancy-card"><time datetime="2026-11-03T10:00:00Z"></time><div class="vacancy-card__company"><a>Example &amp; Co</a></div><a class="vacancy-card__title-link" href="/vacancies/${id}">${title}</a><div class="chip-with-icon__text">Senior</div><div class="chip-with-icon__text">Опыт от 3 лет</div><div class="chip-with-icon__text">Возможна релокация</div>${remote ? '<div class="chip-with-icon__text">Можно удалённо</div>' : ''}<a href="?city_id=1"><div class="chip-with-icon__text">${city}</div></a></div></section>`;
const geekCard = (id, remote = true) => `<li class="collection-item avatar"><div class="info"><a href="/vacancy/${id}">Томск<br><span class="salary">200000</span></a></div><p class="vacancy-name"><a href="/vacancy/${id}" class="title">Backend &amp; APIs</a></p><p class="company-name"><a>Example &amp; Co</a></p>${remote ? '<span class="remote-label">remote</span>' : ''}</li>`;
const rss = (items = '') => `<rss><channel>${items}</channel></rss>`;
const djItem = (id) => `<item><title>Java &amp; Kafka</title><link>https://djinni.co/jobs/${id}-java/</link><description>&lt;p&gt;Build APIs&lt;/p&gt;</description></item>`;

test('regional entries use the existing registry and leave another provider routable', async () => {
  const providers = await loadProviders(fileURLToPath(new URL('../../providers/', import.meta.url)));
  for (const provider of [hh, habr, geekjob, getmatch, dou, djinni]) {
    assert.equal(resolveProvider({ provider: provider.id }, providers).provider.id, provider.id);
    assert.ok(provider.detect({ provider: provider.id }));
    for (const entry of [null, {}, { provider: 'other' }, { careers_url: 'https://evil.example' }]) assert.equal(provider.detect(entry), null);
  }
  assert.equal(resolveProvider({ provider: 'remoteok' }, providers).provider.id, 'remoteok');
});

test('Habr keeps city and confirmed remote separately and decodes entities before filtering', () => {
  const [job] = parseHabrCards(habrCard(123));
  assert.equal(job.title, 'Java & Kafka');
  assert.equal(job.company, 'Example & Co');
  assert.equal(job.location, 'Томск');
  assert.equal(job.url, 'https://career.habr.com/vacancies/123');
  assert.equal(parseHabrCards(habrCard(124, { city: '', remote: false }))[0].location, '');
  assert.equal(parseHabrCards(habrCard(125, { title: '&lt;script&gt;bad&lt;/script&gt;Java' }))[0].title, 'Java');
  const mixed = habrCard(126).replace('class="vacancy-card"', 'class="vacancy-card vacancy-card--bp"') + habrCard(127, { remote: false });
  assert.equal(parseHabrCards(mixed).length, 2);
  assert.equal(parseHabrCards(mixed)[1].isRemote, false);
  assert.equal(parseHabrCards(habrCard(128).replace('href="/vacancies/128"', 'href="https://evil.example/vacancies/128"')).length, 0);
});

test('Habr walks pages, deduplicates, honors a probe and reports changed markup', async () => {
  const requests = [];
  const context = { fetchText: async (url, options) => {
    requests.push(url); assert.equal(options.redirect, 'error');
    return new URL(url).searchParams.get('page') === '1' ? habrCard(123) + '<a href="?page=2&amp;q=Java">2</a>' : habrCard(123) + habrCard(124, { remote: false });
  } };
  const jobs = await habr.fetch({ habr: { query: 'Java', only_remote: true } }, context);
  assert.equal(requests.length, 2); assert.equal(jobs.length, 1); assert.equal(jobs[0].location, 'Томск, Remote');
  assert.equal(jobs[0].postedAt, Date.parse('2026-11-03T10:00:00Z'));
  requests.length = 0;
  await habr.fetch({}, { ...context, maxPages: 1 }); assert.equal(requests.length, 1);
  assert.deepEqual(await habr.fetch({}, { fetchText: async () => '<div class="no-content__title">Поиск не дал результатов</div>' }), []);
  await assert.rejects(habr.fetch({}, { fetchText: async () => '<html>Loading</html>' }), /markup missing/);
  await assert.rejects(habr.fetch({}, { fetchText: async () => '<style>.vacancy-card{}</style>' }), /markup missing/);
  await assert.rejects(habr.fetch({}, { fetchText: async () => '<div class="vacancy-card"><a href="/vacancies/12">Unparsed</a></div>' }), /parser found no cards/);
});

test('GeekJob parses each card once, uses path pagination and preserves neighboring onsite jobs', async () => {
  const requests = [];
  const context = { fetchText: async (url, options) => {
    requests.push(url); assert.equal(options.redirect, 'error');
    return '<ul id="serplist">' + (new URL(url).pathname === '/vacancies' ? geekCard('abc1') + '<a href="/vacancies/2">2</a>' : geekCard('abc2', false)) + '</ul>';
  } };
  const jobs = await geekjob.fetch({}, context);
  assert.equal(jobs.length, 2); assert.equal(new URL(requests[1]).pathname, '/vacancies/2');
  assert.equal(jobs[0].title, 'Backend & APIs'); assert.equal(jobs[0].company, 'Example & Co');
  assert.equal(jobs[0].location, 'Томск, Remote'); assert.equal(jobs[1].location, 'Томск');
  assert.equal(parseGeekJobCards(geekCard('abc1') + geekCard('abc1')).length, 1);
  requests.length = 0;
  assert.equal((await geekjob.fetch({ geekjob: { only_remote: true } }, context)).length, 1);
  await geekjob.fetch({}, { ...context, maxPages: 1 });
  assert.equal(requests.length, 3);
  assert.deepEqual(await geekjob.fetch({}, { fetchText: async () => '<ul id="serplist"></ul>' }), []);
  await assert.rejects(geekjob.fetch({}, { fetchText: async () => '<html>Loading</html>' }), /markup missing/);
});

test('GetMatch JS shell fails visibly instead of asserting an unverified empty result', async () => {
  await assert.rejects(getmatch.fetch({}, { fetchText: async (_url, options) => { assert.equal(options.redirect, 'error'); return '<html><script>loading</script></html>'; } }), /unavailable/);
  await assert.rejects(getmatch.fetch({}, { maxPages: 1, fetchText: async () => '<div data-testid="vacancies-empty"></div>' }), /unavailable/);
  assert.equal(parseGetMatchCards('<a href="/vacancies/123-java">Java</a><footer>remote</footer>')[0].location, '');
  assert.equal(parseGetMatchCards('<a href="/vacancies/../api">Invalid</a>').length, 0);
});

test('pagination has a hard local ceiling even if a source advertises endless pages', async () => {
  for (const provider of [hh, habr, geekjob]) {
    let calls = 0;
    const context = {
      sleep: async () => {},
      fetchJson: async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); return { pages: 999999, items: [{ id: calls, name: 'Java' }] }; },
      fetchText: async (_url, options) => {
        calls++; assert.equal(options.redirect, 'error');
        return provider.id === 'habr-career'
          ? habrCard(calls) + `<a href="?page=${calls + 1}&amp;q=Java">Next</a>`
          : '<ul id="serplist">' + geekCard(calls.toString(16)) + `</ul><a href="/vacancies/${calls + 1}">Next</a>`;
      },
    };
    const warnings = []; const warn = console.warn;
    console.warn = (value) => warnings.push(value);
    try {
      await provider.fetch({ max_pages: 1000000 }, context);
      assert.equal(calls, provider.id === 'hh' ? 20 : 50);
      assert.equal(warnings.length, 1);
    } finally { console.warn = warn; }
  }
});

test('HH API uses an official site allowlist, validates rows and never follows a denial into HTML', async () => {
  let calls = 0;
  await assert.rejects(hh.fetch({ hh: { site: 'localhost' } }, { fetchJson: async () => { calls++; } }), /unsupported site/);
  assert.equal(calls, 0);
  const denied = Object.assign(new Error('forbidden'), { status: 403 });
  await assert.rejects(hh.fetch({}, { fetchJson: async (url, options) => { calls++; assert.equal(new URL(url).hostname, 'api.hh.ru'); assert.equal(options.redirect, 'error'); throw denied; } }), /API access unavailable/);
  assert.equal(calls, 1);
  assert.equal(normalizeHH({ id: '../secret', name: 'Java' }, 'hh.ru'), null);
  assert.equal(normalizeHH({ id: 1, name: 'Java', work_format: {}, area: { name: 'Алматы' } }, 'hh.kz').url, 'https://hh.kz/vacancy/1');
  assert.equal(normalizeHH({ id: 1, name: 'Java', work_format: [{ id: 'REMOTE' }] }, 'hh.ru').location, 'Remote');
  const requests = [];
  const jobs = await hh.fetch({ hh: { site: 'hh.kz', only_remote: true, period_days: 3 } }, { fetchJson: async (url) => {
    requests.push(new URL(url)); return { pages: 2, items: [{ id: requests.length, name: 'Java' }] };
  } });
  assert.equal(jobs.length, 2); assert.equal(requests[1].searchParams.get('page'), '1');
  assert.equal(requests[0].searchParams.get('host'), 'hh.kz'); assert.equal(requests[0].searchParams.get('work_format'), 'REMOTE');
  await assert.rejects(hh.fetch({}, { fetchJson: async () => ({}) }), /invalid API envelope/);
  assert.deepEqual(await hh.fetch({}, { fetchJson: async () => ({ items: [], pages: 0 }) }), []);
});

test('RSS providers reject a broken feed, keep a real empty channel and use safe transport', async () => {
  for (const provider of [dou, djinni]) {
    assert.deepEqual(await provider.fetch({}, { fetchText: async (_url, options) => { assert.equal(options.redirect, 'error'); return rss(); } }), []);
    await assert.rejects(provider.fetch({}, { fetchText: async () => '<html>challenge</html>' }), /invalid RSS/);
  }
  const [job] = await dou.fetch({}, { fetchText: async () => rss('<item><title>Java в ExampleCo, віддалено</title><link>https://jobs.dou.ua/companies/example/vacancies/123/</link></item>') });
  assert.equal(job.company, 'ExampleCo'); assert.match(job.location, /віддалено/);
});

test('Djinni enrichment is opt-in, bounded and disabled in a health probe; no HTTP links are fetched', async () => {
  const requests = [];
  const context = { fetchText: async (url, options) => {
    requests.push(url); assert.equal(options.redirect, 'error');
    if (url.includes('/rss/')) return rss(djItem(123) + djItem(124));
    return '<script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"ExampleCo"},"jobLocationType":"TELECOMMUTE"}</script>';
  } };
  assert.equal((await djinni.fetch({}, context))[0].company, ''); assert.equal(requests.length, 1);
  requests.length = 0;
  assert.equal((await djinni.fetch({ djinni: { fetchDetails: true, detailLimit: 1 } }, context))[0].company, 'ExampleCo');
  assert.equal(requests.length, 2);
  requests.length = 0;
  await djinni.fetch({ djinni: { fetchDetails: true } }, { ...context, maxPages: 1 }); assert.equal(requests.length, 1);
  const noHttp = await djinni.fetch({}, { fetchText: async () => rss('<item><title>Java</title><link>http://djinni.co/jobs/123-java/</link></item>') });
  assert.equal(noHttp.length, 0);
  const denied = new Error('probe denied');
  await assert.rejects(djinni.fetch({}, { maxPages: 1, fetchText: async () => { throw denied; } }), (error) => error === denied);
});
