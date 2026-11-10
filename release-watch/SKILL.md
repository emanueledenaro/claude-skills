---
name: release-watch
description: "Watches upstream for changes that make the person's skills stale, then fixes them: new Claude Code releases and changelog entries, new or retiring models and aliases (the Haiku, Sonnet and Opus rows of model-mix), prices, plan and limit changes, the mods API, Matt Pocock's skills. A shell probe with no model runs first; on a change the facts are verified, written to the skills on a branch, reviewed by Opus and merged when only facts changed, or left for the owner when a rule changed. Runs every morning as a cloud routine and on request. Use when asked whether anything new shipped, 'novità di Claude', 'nuovo modello', 'aggiorna le skill', after a Claude Code update, when a model release, price or limit may touch a skill, when a version or model fact looks wrong, or to set up or repair the daily routine, in any project."
---

Decide whether anything outside the repo changed, and when it did, update the skills that state it. The probe is `rw.mjs`: shell only, no model. A model starts only when the probe reports a change. Sources, exact commands and the edit map are in `sources.md`; the flow after a change is `apply.md`; the cloud routine's prompt is `routine.md`. Memory between runs is `state.json` in this folder, changed only by the PR that processed it.

## 1. Gate

- Runs: every morning as the cloud routine (section 4), or on request, after `claude update`, or when a skill's version floor, model id, price or limit looks wrong.
- Fixing the skills is the job now. Creating, changing or deleting the routine is a standing configuration: do it only after the person says yes in chat.
- Read-only toward everything outside this repo: no login, no credential, no post anywhere. Quote at most 15 words from a page.
- Never switch branches in the clone that the live skills are symlinked into. Work in a git worktree off `origin/main`.

## 2. Probe, no model

```
node release-watch/rw.mjs probe            # what a cloud run can see
node release-watch/rw.mjs probe --local    # adds the installed CLI version
```

- It compares npm dist-tags and the Claude Code changelog (read only when the version moved), model ids on the models pages, hashes of watched slices of docs and support pages, the mods types file, and Matt's `plugin.json` and `CHANGELOG.md`, against `state.json`. Exit 0 nothing to do, 10 something changed, 2 error.
- Nothing changed: say so in one line and stop. This is the usual result and costs no model call. Do not update the state.
- A source that fails to load is "not checked", never "unchanged". A key missing from `state.json` is a baseline: record it, propose no edit.
- Local only, never in the cloud: the Desktop bundled version, the installed CLI, and drift between installed skill copies and this repo. They have no stored memory; compare the value with the skills' version floors. Installed-skill drift belongs to `project-setup`.
- Plain fetch works for every watched URL (checked 2026-11-10) and the slices hash the same twice. If a page breaks that, fix the slice in `rw.mjs`; do not hash a whole page that changes with its build.

## 3. A change: verify, edit, review, merge or wait

`apply.md` has the steps. In short:

1. Group the changes by area and verify every statement the skills make about the area (`verified-research`, official sources, a Sonnet verifier that did not write the claim). Unverified claims are not written.
2. Edit every affected skill and `README.md` on `chore/release-watch-<yyyy-mm-dd>`, one commit per area, `git-conventions` headers, and advance `state.json` in the same PR.
3. Run `node release-watch/rw.mjs classify origin/main HEAD`. It is the only judge of fact versus rule.
4. Open the PR, get an Opus high review of the diff against the sources, apply its fixes as new commits.
5. FACT: squash-merge it yourself on the reviewed head. RULE: leave it open, label `needs-owner`, first line `NEEDS OWNER`, one plain paragraph on the rule change.

Fact means only version numbers, dates, model ids, prices and ratios, rate numbers with a unit, URLs and quotes of a source line, changed one for one. A rule is anything else: which model or effort a role gets, any always, never or only sentence, a new or removed step or row, a budget threshold, a new model slot. A mixed run splits into two PRs when clean, else waits as one. Upstream skills (Matt's) and unverified claims also wait.

## 4. The daily routine

Set up once, after this PR is merged (the routine clones the default branch). Docs: https://code.claude.com/docs/en/routines ("Create a scheduled task", "Add a schedule trigger"). Cloud tasks need a claude.ai login (not an API key) and GitHub access for this repo (`/web-setup`, or the Claude GitHub App).

1. Open https://claude.ai/code/routines and click **New task** (**New routine** on some accounts), or run `/schedule` in a terminal outside a cloud session.
2. Name `release-watch`. Prompt, one line: `Read release-watch/routine.md in this repository and do exactly what it says.`
3. Repository: this one. Environment: **Default** (Trusted network access reaches every watched domain).
4. Model **Sonnet**, effort **high**, in the prompt box selector.
5. Connectors tab: remove all.
6. Trigger **Schedule**, daily. For exactly 08:00 Rome time use **Custom** with `CRON_TZ=Europe/Rome 0 8 * * *`; a plain cron is in UTC and would drift by an hour with daylight saving. A run on the hour can start several minutes late; `7 8` starts closer.
7. **Create**, then **Run now** once and read the transcript: a quiet day prints one line.

It uses the same plan usage as interactive sessions, so run the budget check in `model-mix` before enabling it and read the weekly percent before and after its first change day. Unverified points are listed in `sources.md` section 8.

## Done when

- [ ] Every area is marked changed, unchanged or not checked, with the reason.
- [ ] Each fact written has an opened, dated official source, or is under "Not applied".
- [ ] `classify` ran on the final head; FACT PRs merged on the reviewed sha, RULE PRs wait with the label.
- [ ] `state.json` moved only inside the PR that processed the area.
- [ ] No routine was created or changed without the person's yes.
