---
name: skill-audit
description: "Audit of Claude Code skills, the person's own and third-party, for trigger quality, token cost and risk: description length and trigger wording, body size, progressive disclosure, duplication between skills, stale facts, dangerous instructions, frontmatter fields, skillOverrides, and measured always-on and on-invoke tokens, ending in a short report with concrete edits. Use when asked to review, audit, trim, vet, validate or test a skill, when a skill fails to trigger or triggers at the wrong time, when the skills listing or the context feels heavy, before enabling a third-party skill (a whole plugin is vetted with smart-mods first), and after writing or changing any SKILL.md, in any project."
---

Decide what each skill costs, whether it triggers when it should, and whether it is safe, then report concrete edits. Writing a new skill is `skill-creator`'s job; this skill checks what exists. Related rules: `model-mix` (models and budget), `smart-ultracode` (fan-out over many skills), `verified-research` (checking a fact a skill states), `release-watch` (facts gone stale upstream), `context-hygiene` (session-level cost), `smart-mods` (a plugin that ships a mod), `coordinator-method` (how edits land). The person's own rules win: an audit may shorten or move a rule of `coordinator-method`, `model-mix` or `smart-ultracode`, never weaken it. Field tables, shell recipes, the danger list and the report template are in `reference.md`: read it when a step says so.

## 1. Scope

- Name what is audited: one skill, the person's folder, a skills repo, a third-party skill before install, or the whole listing. Skills live in `~/.claude/skills`, a project's `.claude/skills`, plugins and the bundled set.
- Audit the installed copy, because that is what loads, and edit the repo source. When both exist, `diff -r <repo>/<name> ~/.claude/skills/<name>`: drift is a finding.
- Bundled and enterprise skills are out of scope. Symlinked skills belong to another tool: measure them, change nothing in the target.
- A third-party skill is never rewritten: adapt around it, and the levers are settings (section 4).

## 2. Measure first, with no model

Cost model: every listed skill pays its name, description and `when_to_use` in every session (about 100 tokens each). The listing cuts description plus `when_to_use` at 1,536 characters. The body loads when the skill is invoked and then stays for the session. After auto-compaction each invoked skill is re-attached with its first 5,000 tokens, within 25,000 for all, most recent first. So the rules that must survive go first in the body.

- Inventory (lines, description characters, files, flags): the snippet in `reference.md`.
- Tokens per skill: `claude --plugin-dir <skill folder> plugin details <name>` prints always-on and on-invoke tokens (estimates). One call per skill folder: the parent folder fails. In 2.1.292 it worked on a plain folder and through a symlink.
- Validity: `claude plugin validate <skills dir> --strict --json` names syntax and schema errors. In tests it accepted a folder named `skills` or one containing a `skills` folder, and a repo root with another name failed with "No manifest found": copy the skill into a temp `skills` folder. A broken SKILL.md loads with empty metadata, so it never triggers but still runs by `/name`. Validate does not follow symlinks: give it the real path.
- In a session: `/skills` then `t` sorts by tokens; `/doctor` lists unused user-installed skills; `/usage` shows the share of recent usage by skill, subagent, plugin and MCP server (approximate, local history only); `/context` shows what fills the window.
- `/skill-doctor` (v2.1.252+) reports each skill's cost and use and flags skills never invoked, excluding bundled and enterprise skills. Unverified here: it needs feature-flag fetching and was not run on this machine or in the Desktop bundle. If it is missing, use `/skills` and `plugin details`.
- Keep the scale: in one coordinator session skills were about 1% of a 1M window and messages 49%. Fix trigger quality and oversized bodies before shaving description tokens.

## 3. Check each skill

- **Frontmatter:** `name` equals the folder, lowercase letters, digits and hyphens, at most 64, no `claude` or `anthropic`. `description` non-empty, under 1,024 characters, no XML tags, third person. Unknown fields are ignored without error, so a misspelled field silently does nothing: check each key against the table in `reference.md`.
- **Trigger:** the key use case comes first; it says what the skill does and "Use when" situations the person would not name; it carries the words they actually say, in Italian and English; no other description claims the same trigger (two owners and the wrong one fires); not so broad that it fires on unrelated work.
- **Body:** under 500 lines and 5k tokens (official limits; the house range is 40-120 lines). Catalogues, tables and templates go in files linked from SKILL.md one level deep with a "read when" line, and a reference file over 100 lines gets a table of contents. Deterministic steps become scripts that run, since only their output enters context. One default, not a menu of options.
- **Duplication:** a rule or table that appears in two skills, or in CLAUDE.md as well, stays in one place and the others point to it. Grep a distinctive line across folders.
- **Stale facts:** every version, date, model name, price, limit and path. Compare with `claude --version` and the changelog; a claim that needs a source goes to `verified-research`, upstream drift to `release-watch`. A fast-changing fact with no date, version or "unverified" mark is a finding.
- **Dangerous instructions:** the list in `reference.md`. A skill is instructions plus scripts that run with the person's permissions.
- **Pointers:** every skill, file and command a skill names exists on this platform, with Windows syntax where it runs here.
- **claude.ai upload:** only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools` pass. `context`, `paths` and `disable-model-invocation` break the upload: flag them when the skill is meant for claude.ai, Cowork or the Skills API.

## 4. Triage by invocation

Pick one verdict per skill:

- **keep:** used often, or named in CLAUDE.md or by another skill.
- **trim:** description or body over the limits above. Move catalogues to a reference file.
- **`disable-model-invocation: true`:** a procedure the person runs by name and never wants started on its own. Zero listing cost. It also stops preloading into subagents and, from v2.1.196, running from a scheduled task, so never set it on a skill that CLAUDE.md, another skill, a workflow or a subagent must load.
- **`skillOverrides`:** `name-only` for rare skills Claude should still find by name, `user-invocable-only` for a menu-only skill, `off` to hide it everywhere, Remote Control and the Agent SDK included. Plugin skills ignore it: disable those in `/plugin`.
- **merge or delete:** two skills with one job, or one nobody invokes.

After any override or description edit, rerun the trigger test: a skill hidden or shortened may stop firing.

## 5. Test before and after

- **Trigger test:** at least 3 prompts that should fire it and 3 that should not, in Italian and English, none naming the skill, each in a fresh session. Check that the Skill tool fired. Run the budget check in `model-mix` first: 6 or more fresh sessions spend plan usage. Run each prompt as a fresh headless session with `--model sonnet` and look for a Skill tool call in its stream-json output; the exact command is unverified, so calibrate it on one prompt and record it in `reference.md`. `skill-creator` tunes descriptions this way.
- **`claude plugin eval`** (v2.1.269+) runs cases with a with-versus-without baseline. It spends plan usage: run the budget check in `model-mix` first, pin `--model` to the full ID of each model the skill will run on (Sonnet and Opus; Haiku is not used), set `--judge-model` to the full ID of Opus 5.5 (judge row of `model-mix`, which names no ID: read it from the models page) because its default is the `haiku` alias, and cap `--max-cost-usd`. Its runs load no user settings, CLAUDE.md, MCP or other skills, so a pass says nothing about competition inside a crowded listing.
- Unverified: whether eval accepts a plain skill folder through `--plugin-dir` or as its target. Calibrate once on one small skill with a cost cap before planning around it; until then use the trigger test.

## 6. Report

- One block per skill, worst first, using the template in `reference.md`. Every edit names the file, the lines and the change (old to new, or "move lines a-b to `reference.md`"). No "consider shortening".
- End with totals: always-on tokens before and after, skills changed, and what was not measured and why.
- Many skills: measure in the shell, judge a few in the main session, and fan out only when `smart-ultracode` says the list is large. Vetting a third-party skill that ships scripts or hooks is security-critical work in `model-mix`; a plugin that may contain a mod is vetted with `smart-mods`.
- An audit edits nothing by itself.

## 7. Apply, only when asked

- Edits to the person's skills go on a branch and a PR per `coordinator-method`. After the merge, sync the installed copies and run section 2 again.
- `skillOverrides` and `disable-model-invocation` in settings are settings changes: ask first, and use `update-config`. In `/skills`, Space cycles a skill's state and Esc saves it to `.claude/settings.local.json`.
- Re-measure, and rerun the trigger test on every changed description.

## Done when

- Every skill in scope has a verdict and measured tokens, or a stated reason it was not measured.
- Every finding names its file and line, and every edit is concrete.
- Unverified items (`/skill-doctor`, eval on a plain folder, `/usage` per-skill numbers) are marked as such in the report.
- Triggers were retested after each change, and nothing was edited or switched without the person's ok.
