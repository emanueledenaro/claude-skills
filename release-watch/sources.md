# Sources, commands and edit map

Read by `release-watch` before the first probe. `rw.mjs probe` runs the checks below that a cloud session can reach; the rest are local or manual. Commands are read-only. Facts marked verified were run or read on 2026-10-07 or on the date given; unverified ones are inference or untested here.

## State file

`release-watch/state.json` in the repo, written only by `node release-watch/rw.mjs apply-state <area>` inside the PR that processed the area (areas: `cli`, `models`, `limits`, `mods`, `upstream`). Keys are a convention of this skill:

```json
{
  "checkedAt": "<ISO time>",
  "cli": "<last processed x.y.z>",
  "npmTags": { "latest": "", "next": "", "stable": "" },
  "models": ["<id>", "..."],
  "modsTypes": "<sha256 of mods/types/claude-code.d.ts>",
  "pageHashes": { "<page id>": "<sha256 of the slice>" },
  "upstreamSkills": { ".claude-plugin/plugin.json": "<sha256>", "CHANGELOG.md": "<sha256>" }
}
```

- `cli` is the newest version whose changelog was read, not the installed one. It moves only in a PR that processed a version with relevant lines, so quiet releases cost a shell grep each morning and nothing else.
- The first seed (2026-11-10) holds `cli` 2.1.293 and the model ids known before Fable 5.2, so the first run catches that backlog. Every other key was baselined the same day.
- The older `~/.claude/release-watch/state.json` is obsolete. Its Desktop and installed-CLI keys are not kept: those checks have no memory (section 2).

## 1. Claude Code (verified)

```
claude --version                                                  # local only
curl -s https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags   # what the probe reads; verified 2026-11-10
curl -sL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md   # read only when the version moved
gh release list -R anthropics/claude-code -L 5                    # local only: a cloud session's GitHub proxy serves attached repos only
```

- npm tags: `latest`, `next`, `stable`. `stable` lags about one week and is what `autoUpdatesChannel: "stable"` follows; a new model can need a version newer than `stable`.
- GitHub release tags are `vX.Y.Z`; the release body repeats the `CHANGELOG.md` entry. `CHANGELOG.md` has `## <version>` headings, newest first. Raw copy: `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`. The version heading is the change detector: the file is fetched only when npm `latest` is newer than `state.json`'s `cli`, then every `## <version>` section after it is grepped with the probe's pattern (shell, no model).
- Notes of one version: `gh api repos/anthropics/claude-code/releases/tags/v<x.y.z> --jq .body`.
- Docs also publish a changelog page and a weekly digest (`https://code.claude.com/docs/en/whats-new/index.md`). The digest lags the CLI by weeks: not a poll target.
- Extra words worth grepping in changelog sections besides the list in `SKILL.md`: `--cloud`, `--ref`, `--on-branch`, `autoUpdatesChannel`, `promptCacheTtl`, `skillOverrides`, `plugin`.
- Update behavior: `claude update` prints `Claude Code is up to date (<version>)` or `Successfully updated from <old> to version <new>`. Homebrew, WinGet and apk installs do not auto-update by default and print `Claude is up to date!` with no version, so read the version from `claude --version`, never from that line. `claude doctor` is read-only and shows the `Auto-updates` line. `DISABLE_AUTOUPDATER` stops only the background check; `DISABLE_UPDATES` also blocks `claude update` and `claude install`.
- `claude respawn [--all]` restarts background sessions on the current version: after an update, running background sessions keep the old one until then.

## 2. Desktop bundled version

Verified: Desktop keeps its own copy at `%APPDATA%\Claude\claude-code\<version>\claude.exe`, and running it with `--version` printed the same version as the folder name. The folder layout is not documented by Anthropic, so it can change. The documented way is `/status` in a local Code-tab session, whose Claude Code row shows the bundled version (https://code.claude.com/docs/en/plugins/mods/overview, "Turn mods on or off"); it needs a session, so the folder probe below is for unattended local runs. A cloud routine cannot see this machine and skips it. `About Claude` shows only the Desktop app version, not the bundled one.

```powershell
Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1 | ForEach-Object { & "$($_.FullName)\claude.exe" --version }
```

macOS (verified 2026-10-07): `ls ~/Library/Application\ Support/Claude/claude-code/` lists one folder per version (`2.1.293`); inside it is a hashed folder, not a `claude` binary, so take the version from the folder name.

Git Bash: `ls "$APPDATA/Claude/claude-code/"`, then run the newest `claude.exe --version`. The pipeline above was not run as written; the folder listing and the `--version` call were.

- The bundle is usually older than the CLI. List the CHANGELOG sections between the two versions and name the fixes it lacks (Windows, `/loop`, background wakeups).
- Known feature floors from the docs: local scheduled tasks need Desktop 1.1.5368 or later (a Desktop app version, not a Claude Code one); `claude --desktop` needs Claude Code 2.1.285 or later.
- Several version folders: which one the app runs is unverified.

## 3. Models (verified)

- Overview: `https://platform.claude.com/docs/en/about-claude/models/overview` (canonical path moved to `/docs/en/models/overview`). New models appear as table columns.
- Deprecations: `https://platform.claude.com/docs/en/about-claude/model-deprecations`. It has a `Model status` table and dated `### YYYY-MM-DD: ...` history headings. Some active models are in this table only, not in the overview columns: parse both.
- Retirement needs at least 60 days' notice, and a "not sooner than" date is only a floor. A model with no deprecation entry cannot be retired within 60 days of today (inference from the notice rule).
- Aliases: the Claude Code model-config page (`https://code.claude.com/docs/en/model-config`) has a table of what `opus`, `sonnet` and `haiku` resolve to per provider, and the minimum Claude Code version for each new model. Diff it with the ids; on 2026-10-07 `haiku` is Haiku 5.5 on the Anthropic API from v2.1.293 and Haiku 4.5 elsewhere.
- Fetch and hash (verified 2026-11-10, from a local machine, not a cloud session): `https://platform.claude.com/docs/en/about-claude/models/overview.md`, `.../model-deprecations.md` and `https://code.claude.com/docs/en/<page>.md` return plain markdown, identical byte for byte on two fetches. The HTML version of the models page differs between fetches, so never hash it. Support articles are HTML: the probe hashes the text of the `<article>` element, which was identical on two fetches. The probe hashes a slice, not a page: dollar amounts and percentages for the overview, dates for the deprecations page, the alias lines for `model-config`, the limit lines for `routines`.

A fetch error is "not checked", never "unchanged". On Windows run `node release-watch/rw.mjs probe` from Git Bash or PowerShell; there is no per-shell hashing recipe any more.

## 4. Plans and limits

Pages (hash their text; support articles show only a relative "Last Updated", so the date is not a detector):

- `https://support.claude.com/en/articles/11049741-what-is-the-max-plan`
- `https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan`
- `https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan`
- `https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan`
- `https://support.claude.com/en/articles/12429409-manage-usage-credits`
- `https://code.claude.com/docs/en/routines` (usage and limits section)

Compare only the numbers the person's skills state: the 5-hour (Pro and Max; none on a verified Ultra account) and weekly reset rules, the Max (5×) and Ultra (10×) ratios against Pro, the Fable weekly limit, whether the Ultra weekly cap was halved against the old Max 20x (unverified on 2026-11-06), the routine caps (verified on 2026-10-07: minimum schedule interval 1 hour, schedule runs 100 per hour per account, Run now plus API 30 per hour per routine). Plan prices are on these pages too (Max $100/month, Ultra $200/month, read 2026-11-06 on the Max and Ultra pages, renamed from Max 5x and Max 20x on 2026-10-30); `model-mix` states them once in the plan profiles, so a price change needs that one edit.

## 5. Mods API

- Contract: `https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts`. Change detector: the probe's sha256 of the raw file (`https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts`, about 520 KB).
- Docs pages to diff: `https://code.claude.com/docs/en/plugins/mods/{api,reference,events,interface,create,admin}.md`. The reference states the version it is accurate for ("as of v2.1.NNN"); a newer number there than in `smart-mods` is a signal.
- There is no separate mods API version number or compatibility policy (none found). Whether breaking changes are flagged in the changelog is unknown.
- A mod reads the installed version with `$.session.version` and plan limits with `$.session.usage()`.
- On a change, tell the person to re-check installed mods with `claude plugin validate <dir>` and `claude plugin test`, and to prefer the types Claude Code writes for the installed build. Never edit a mod from this skill.

## 6. Matt Pocock's skills

- Upstream is `mattpocock/skills` (verified 2026-10-07): `skills/<category>/<name>/SKILL.md`, categories engineering, productivity, misc, in-progress, deprecated, plus `.claude-plugin/plugin.json` (plugin `mattpocock-skills`) and `CHANGELOG.md`.
- Installed copies under `~/.claude/skills` are plain folders with no lock entry, from an older release with older names (`matt-bridge` lists both sets). Never diff them against upstream by sha: they always differ. Compare upstream with the last-seen upstream sha in the state file (`upstreamSkills`).
- Cheap gate, and the only part a cloud run can do: the probe's sha256 of the raw `.claude-plugin/plugin.json` and `CHANGELOG.md`. A cloud session's GitHub proxy serves only the repositories attached to the session, so `gh api repos/mattpocock/skills/...` fails there. A change makes the PR owner-only (`apply.md` section 3); the routine lists the new changelog entries and does not rewrite `matt-bridge`.
- Locally, after a change, per category `gh api repos/mattpocock/skills/contents/skills/<category> --jq '[.[].name]'`: a changed list means a skill was added, renamed or removed, so check the name map in `matt-bridge`. Then per skill `gh api repos/mattpocock/skills/contents/skills/<category>/<name>/SKILL.md --jq .sha`. A different sha means read the diff; it never means copy it over: `matt-bridge` adapts around his text and never rewrites it.

## 7. Edit map

Which skill holds the line a change probably touches. Find the line with `grep -n` on the old value.

| Change | Look in |
| --- | --- |
| New or retiring model, an alias that resolves to another model | `model-mix/SKILL.md` Models table and the Haiku 5.5 bullets; model ids anywhere else |
| 5-hour, weekly or reset rules, plan ratios | `model-mix/SKILL.md` Plan profiles; `model-mix/budget.md` Overrides |
| Routine or scheduled-task limits | `overnight`, `cloud-worker`, and `model-mix` routine bullet |
| Version floors, mods API | `smart-mods/SKILL.md` sections 2, 3 and 6, `smart-mods/writing.md`, `smart-mods/testing.md`, `smart-mods/vetting.md`; `mod-ui` |
| Windows fixes now in the bundle | `windows-ops`; `overnight` (runtime choice) |
| `--cloud`, `--ref`, `--on-branch`, `/model` in cloud sessions | `cloud-worker`; `model-mix` Cloud session bullet; `coordinator-method` launch recipe |
| Skill listing, frontmatter fields, audit commands | `skill-audit`; `context-hygiene` |
| Matt's skill names or flow | `matt-bridge` |

Skills named here may not all be installed: skip a row whose skill is missing.

## 8. Scheduling: the cloud routine

Cloud scheduled tasks, formerly routines. Source: https://code.claude.com/docs/en/routines, read 2026-11-10. Setup steps are in `SKILL.md` section 4; the prompt is `routine.md`.

Documented:

- Available on Pro, Max, Ultra, Team and Enterprise. Created at https://claude.ai/code/routines or with `/schedule` (alias `/routines`) in a terminal; `/schedule` is not available inside a cloud session and needs a claude.ai login, not a Console API key.
- A schedule trigger takes a preset or a custom cron; expressions more often than once per hour are rejected. A five-field cron is read in UTC unless it starts with `CRON_TZ=<zone>`. A run on the hour can start several minutes late.
- Each run is a new full cloud session: the repository is cloned from its default branch, the prompt is the saved one, the model and effort come from the selector, all connectors are included by default (remove them). Auto mode is on unless unavailable; repeated classifier blocks stop the run and wait for a person.
- Claude pushes to `claude/`-prefixed branches unless the prompt names another branch. Branch protection or rulesets control where a run can push.
- Limits: scheduled runs 100 per hour per account; Run now plus API fires 30 per hour per task. Runs draw down subscription usage like interactive sessions, with no per-run figure published.
- Skipped, then turned off after 72 hours, when the GitHub connection is missing or expired.
- Cloud sessions reach Anthropic docs, support, platform, the npm registry and raw.githubusercontent.com on the default Trusted network access (https://code.claude.com/docs/en/cloud-environments, "Default allowed domains"). `gh pr` and `gh issue` fail there, because the GitHub proxy refuses GraphQL; `gh api repos/...` REST calls work for the attached repository.
- Node 22 is on `PATH` in the cloud VM, so `rw.mjs` runs as is.

Unverified, not tested because no routine was created:

- That the REST merge (`PUT /pulls/N/merge` with `merge_method=squash` and `sha`) is allowed through the GitHub proxy.
- That the auto mode classifier lets an unattended run merge a PR. The routine page says a fired prompt cannot act as consent for an action during the run.
- That a hand-typed `CRON_TZ=Europe/Rome 0 8 * * *` is accepted by the Custom field. The docs describe the prefix, not this exact input.
- That the Agent tool in a cloud session accepts `model` and `effort` per call, and that Haiku 5.5 is selectable there by id.
- That the probe's fetches work from the cloud VM. They were run from a local machine; the domains are on the allowlist.
- That `git ls-remote` of the branch list works through the proxy; if not, the probe says so and the routine stops when an open release-watch PR exists.
- The plan usage of one change day. Read the weekly percent before and after.
