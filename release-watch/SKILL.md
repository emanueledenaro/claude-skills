---
name: release-watch
description: "Checks for upstream changes that should update the person's skills and mods: new Claude Code releases and changelog entries, the Desktop app's bundled Claude Code version, new or retiring models (the Haiku 5.5 slot in model-mix), plan and limit changes, mods API changes, upstream changes to Matt Pocock's skills. Shell and hashes first, no model unless something changed; the output is a list of concrete edits, never the edits themselves. Use when asked whether anything new shipped, after a Claude Code update, when a feature or fix seems missing, when a model release or retirement may touch model-mix, or before changing a skill on a version, price or limit fact, in any project."
---

Decide whether anything outside the person's setup changed, and which skill line that touches. The probe is shell commands with no model; a model reads only what changed. Skill and mod rules that depend on a version or a limit live in `model-mix`, `smart-mods`, `coordinator-method` and `overnight`; this skill only finds the drift and proposes the edit. Sources, exact commands and the edit map are in `sources.md`: read it before the first probe.

## 1. Gate

- Run when asked, after `claude update` or a new session on a newer version, or when a skill's version floor, model id or limit looks wrong.
- Do not run it on a schedule, and do not create a routine or scheduled task, without the person's yes in chat. Any schedule is a standing configuration: say so. Pick the option from "Scheduling" in `sources.md`, cheapest first; only a cloud routine goes through the built-in `schedule` skill.
- Read-only: nothing is posted to GitHub, no login or credential is opened, no skill or mod is edited. Quote at most 15 words from any page.

## 2. Probe with no model

- Keep the last-seen values in one file, `~/.claude/release-watch/state.json`: CLI version, Desktop bundled version, CHANGELOG blob sha, mods types blob sha, the model ids seen, one text hash per watched page, one sha per watched upstream skill. A missing key means first run: record the values, report them as the baseline, propose nothing.
- Run the commands in `sources.md` for each area. Compare each value with the stored one. Equal everywhere: say "nothing changed", update the timestamp and stop. This is the usual result, and it costs no model call.
- Prefer `gh api` for GitHub sources (verified: tags, blob shas). For docs and support pages, hash the page text, not a date: support articles show only a relative "Last Updated".
- A fetch that fails or is blocked is "not checked", never "unchanged". Say which area was not checked and why.

## 3. Calibrate before trusting a hash

Plain fetch of the docs and support pages, and the stability of their hashes, is unverified. Before the first schedule, and before believing the first "changed":

- Fetch each watched page twice in a row and compare the hashes. If they differ with nothing changed, hash only the part you diff (the model-id table, the usage section, the headings) instead of the whole page.
- If plain fetch is blocked, a model-based fetch works but spends a call per page. Then check weekly, not daily, and tell the person.
- Record in the state file which pages hash stably.

## 4. Read only what changed

- **Claude Code:** read only the `## <version>` sections of `CHANGELOG.md` between the last-seen and the latest version. Grep them for `model`, `mod`, `prompt.`, `$.model`, `agent.spawn`, `effort`, `schedule`, `routine`, `/usage`, `limit`, `Windows`, `PowerShell`, `CRLF`; ignore the rest.
- **Desktop:** `/status` in a local Code-tab session shows the bundled version on its Claude Code row (mods overview docs), but that needs a session. With no person and no model, read it from the folder `%APPDATA%\Claude\claude-code\` and run the newest `claude.exe --version` there; that layout is undocumented. Never assume it equals the CLI. If several version folders exist, which one the app uses is unverified: take the newest and say so. If the folder is missing, ask the person once.
- **Models:** diff the ids in the models overview and the `Model status` table of the deprecations page, both. Some models appear only in the second. Flag any new id, any new Haiku above 4.5, and any retirement within 30 days. A "not sooner than" date is a floor, not a retirement date.
- **Plans and limits:** on a changed hash, summarize the diff and compare it with the numbers in `model-mix/budget.md` and the plan table in `model-mix/SKILL.md`.
- **Mods:** the contract is `mods/types/claude-code.d.ts` on GitHub, which can be older than the installed version, plus the "as of v2.1.NNN" marker in the mods reference. The types Claude Code writes for the installed build win.
- **Matt Pocock's skills:** upstream is `mattpocock/skills` (`skills/<category>/<name>/SKILL.md`, categories engineering, productivity, misc, in-progress, deprecated). Compare each upstream sha with the last-seen upstream sha in the state file, never with the installed copy: the installed copies are an older release with older names (see `matt-bridge`). Start from the plugin and `CHANGELOG.md` shas, and list each category's names to catch added, renamed or removed skills.

When the interpreting step needs a model (a long diff), one agent, per `model-mix`, no fan-out.

## 5. Report

One short block per area (version, Desktop, models, limits, mods, Matt):

- old -> new, and the command or URL used.
- the skill file and line to change: find it with `grep -n` on the old value, and quote the line. Use the edit map in `sources.md`.
- the proposed new text, or "no edit needed".
- what a new feature needs: a version floor, and whether the Desktop bundle meets it.

Order by what breaks something first: a retired model, a removed API, a changed limit, then new features. Then ask which edits to make. Edits go through the normal rules of the skill concerned; a new model slot follows the trial rule written in `model-mix`.

## Done when

- [ ] Every area is marked changed, unchanged or not checked, with the reason for "not checked".
- [ ] State file updated with the new last-seen values, and only after the report is shown.
- [ ] Each proposed edit names a file and a line, or says none is needed.
- [ ] No routine, scheduled task or skill edit was made without the person's yes.
