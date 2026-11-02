#!/usr/bin/env node
// Routing hints only: these signals say which angle to review, never prove experience.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

export function selectResumeRoutes(text, routes) {
  if (!Array.isArray(routes) || routes.some((route) => !route?.id || !route?.label || !Array.isArray(route?.signals) || !route.signals.length || route.signals.some((signal) => typeof signal !== 'string' || !signal.trim()))) {
    throw new Error('routes must contain id, label and a non-empty list of literal signals');
  }
  if (new Set(routes.map((route) => route.id)).size !== routes.length) throw new Error('duplicate resume route id');
  const normalized = String(text).normalize('NFKC').toLocaleLowerCase('ru');
  const matches = routes.map((route) => ({
    id: route.id, label: route.label,
    signals: route.signals.filter((signal) => {
      const literal = signal.normalize('NFKC').toLocaleLowerCase('ru').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\p{L}\\p{N}])${literal}(?![\\p{L}\\p{N}])`, 'u').test(normalized);
    }),
  })).filter((route) => route.signals.length);
  return { recommended: matches.length === 1 ? matches[0].id : null, matches, needsReview: true };
}

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node resume-route.mjs --jd <local-text-file> [--routes <yaml-file>]\nRead-only hints. Review the full JD, factual gaps and current HH resume inventory before choosing.');
    return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--jd', '--routes'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('expected --jd <file> and optional --routes <file>');
    options[args[index]] = resolve(args[index + 1]);
  }
  if (!options['--jd']) throw new Error('--jd <local-text-file> is required; URLs are not fetched');
  const routesPath = options['--routes'] || resolve(getCareerOpsRoot(), 'config/resume-routes.yml');
  const config = load(readFileSync(routesPath, 'utf8'));
  console.log(JSON.stringify(selectResumeRoutes(readFileSync(options['--jd'], 'utf8'), config?.routes), null, 2));
}

if (isMainModule(import.meta.url)) {
  try { main(); } catch (error) { console.error(`resume-route: ${error.message}`); process.exitCode = 1; }
}
