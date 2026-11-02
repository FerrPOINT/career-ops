---
name: career-ops-regional
description: Search and triage Russian and neighboring job markets with this fork's providers; select resume angles and prepare reviewed applications without automatic submission.
---

# Regional career workflow

Locate the checkout by walking upward from this file to `AGENTS.md` and `modes/`.
Read its instructions and `docs/FORK_WORKFLOW_RU.md` before a regional search,
resume-route decision, or application preparation. Read `docs/FORK_SOURCES.md`
when choosing sources or interpreting a failed scan. Use the existing career-ops
mode router for evaluation, tracker, CV, cover letters and interviews.

Use `node doctor.mjs --json` before a workflow that needs candidate facts. Missing
CV/profile is onboarding, never permission to score against example data. Use
the current visible HH resume as factual authority; review additions to cv.md
with the user. Never infer commercial Go tenure, titles, dates or metrics.

Use the existing `scan.mjs` and provider registry. Start with a dry run and a
small query set. Treat RSS results as recent windows, not full market coverage.
Do not interpret unavailable HTML, HTTP 403, CAPTCHA or login as zero vacancies.
Do not rotate user agents, accounts or networks to bypass restrictions.

For HH pages and interactive browser checks, use only Codex in-app browser.
Stop for login, security, payment, CAPTCHA or permission prompts. Present exact
edits and obtain explicit action-time confirmation before saving a resume,
changing its visibility or sending an application. Preserve every workplace and
the complete experience base across variants; isolate shared workplace text
before any role-specific save.

`node resume-route.mjs --jd <file>` gives literal direction hints, not a fit
score or proof of skills. Inspect all matches, factual gaps and the current
resume inventory. Do not silently choose among ambiguous routes. Do not change
cv.md just to switch a route, and do not mark an application Applied until the
actual submission is confirmed.

Keep personal configuration in the user layer. Do not enable schedules, send
Telegram/email notifications, or start external application flows as a side
effect of setup. Update this fork by reviewed Git integration; the upstream
system updater is not a fork merge tool.
