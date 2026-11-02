import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectResumeRoutes } from '../resume-route.mjs';
import { fileURLToPath } from 'node:url';
import { aggregatorPostingId, isAggregatorUrl, postingUrlRelation } from '../url-key.mjs';

const routes = [
  { id: 'java', label: 'Java backend', signals: ['Java', 'Spring'] },
  { id: 'go', label: 'Go transition', signals: ['Go', 'Golang'] },
  { id: 'arch', label: 'Architecture', signals: ['архитектор', 'architect'] },
];
test('regional posting identities distinguish sibling vacancies and ignore tracking parameters', () => {
  for (const [one, two] of [
    ['https://hh.ru/vacancy/123', 'https://hh.ru/vacancy/124'],
    ['https://career.habr.com/vacancies/123', 'https://career.habr.com/vacancies/124'],
    ['https://geekjob.ru/vacancy/abc123', 'https://geekjob.ru/vacancy/abc124'],
    ['https://jobs.dou.ua/companies/example/vacancies/123/', 'https://jobs.dou.ua/companies/example/vacancies/124/'],
    ['https://djinni.co/jobs/123-java/', 'https://djinni.co/jobs/124-java/'],
  ]) {
    assert.equal(isAggregatorUrl(one), true);
    assert.notEqual(aggregatorPostingId(one)?.id, aggregatorPostingId(two)?.id);
    assert.equal(postingUrlRelation(one, one + '?utm_source=test'), 'same');
    assert.equal(postingUrlRelation(one, two), 'distinct');
  }
  assert.equal(isAggregatorUrl('https://hh.ru.evil.example/vacancy/123'), false);
});
test('resume routing respects word boundaries and exposes ambiguous/no-match cases', () => {
  assert.equal(selectResumeRoutes('JavaScript developer at Google', routes).matches.length, 0);
  assert.equal(selectResumeRoutes('Java / Spring engineer', routes).recommended, 'java');
  const ambiguous = selectResumeRoutes('Java Architect', routes);
  assert.equal(ambiguous.recommended, null); assert.equal(ambiguous.matches.length, 2);
  assert.equal(selectResumeRoutes('Senior Go backend', routes).recommended, 'go');
  assert.equal(selectResumeRoutes('Ведущий архитектор', routes).recommended, 'arch');
  assert.equal(selectResumeRoutes('Java', routes).needsReview, true);
  assert.throws(() => selectResumeRoutes('Java', [routes[0], routes[0]]), /duplicate/);
  assert.throws(() => selectResumeRoutes('Java', [{ id: 'x', label: 'X', signals: [] }]), /non-empty/);
});
test('resume-route CLI reads local input without changing it and supports an explicit config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regional-route-'));
  try {
    const jd = join(dir, 'jd.txt'); const config = join(dir, 'routes.yml');
    writeFileSync(jd, 'Java Architect');
    writeFileSync(config, 'routes:\n  - id: java\n    label: Java backend\n    signals: [Java]\n');
    const script = fileURLToPath(new URL('../resume-route.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, '--jd', jd, '--routes', config], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).recommended, 'java');
    const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0); assert.match(help.stdout, /Read-only/);
    const bad = spawnSync(process.execPath, [script, '--url', 'https://example.test'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
