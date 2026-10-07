# Sources, commands and edit map

Read by `release-watch` before the first probe. Commands are read-only. Facts marked verified were run or read on 2026-10-07; unverified ones are inference or untested here.

## State file

`~/.claude/release-watch/state.json`, one small object. Keys are a convention of this skill, not a Claude Code format:

```json
{
  "checkedAt": "<ISO time>",
  "cli": "<x.y.z>",
  "desktopBundled": "<x.y.z or null>",
  "npmTags": { "latest": "", "next": "", "stable": "" },
  "changelogSha": "",
  "modsTypesSha": "",
  "models": ["<id>", "..."],
  "pageHashes": { "<url>": "<sha256 of the diffed text>" },
  "upstreamSkills": { "plugin.json": "", "CHANGELOG.md": "", "<category>/<skill>": "<blob sha>" }
}
```

## 1. Claude Code (verified)

```
claude --version
npm view @anthropic-ai/claude-code dist-tags --json
gh release list -R anthropics/claude-code -L 5
gh api repos/anthropics/claude-code/contents/CHANGELOG.md --jq .sha
```

- npm tags: `latest`, `next`, `stable`. `stable` lags about one week and is what `autoUpdatesChannel: "stable"` follows; a new model can need a version newer than `stable`.
- GitHub release tags are `vX.Y.Z`; the release body repeats the `CHANGELOG.md` entry. `CHANGELOG.md` has `## <version>` headings, newest first. Raw copy: `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`. The blob sha above changes whenever the file does, so it is a change detector that downloads nothing.
- Notes of one version: `gh api repos/anthropics/claude-code/releases/tags/v<x.y.z> --jq .body`.
- Docs also publish a changelog page and a weekly digest (`https://code.claude.com/docs/en/whats-new/index.md`). The digest lags the CLI by weeks: not a poll target.
- Extra words worth grepping in changelog sections besides the list in `SKILL.md`: `--cloud`, `--ref`, `--on-branch`, `autoUpdatesChannel`, `promptCacheTtl`, `skillOverrides`, `plugin`.
- Update behavior: `claude update` prints `Claude Code is up to date (<version>)` or `Successfully updated from <old> to version <new>`. Homebrew, WinGet and apk installs do not auto-update by default and print `Claude is up to date!` with no version, so read the version from `claude --version`, never from that line. `claude doctor` is read-only and shows the `Auto-updates` line. `DISABLE_AUTOUPDATER` stops only the background check; `DISABLE_UPDATES` also blocks `claude update` and `claude install`.
- `claude respawn [--all]` restarts background sessions on the current version: after an update, running background sessions keep the old one until then.

## 2. Desktop bundled version

Verified: Desktop keeps its own copy at `%APPDATA%\Claude\claude-code\<version>\claude.exe`, and running it with `--version` printed the same version as the folder name. The folder layout is not documented by Anthropic, so it can change. The documented way is `/status` in a local Code-tab session, whose Claude Code row shows the bundled version (https://code.claude.com/docs/en/plugins/mods/overview, "Turn mods on or off"); it needs a session, so the probe above is for unattended runs. `About Claude` shows only the Desktop app version, not the bundled one.

```powershell
Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1 | ForEach-Object { & "$($_.FullName)\claude.exe" --version }
```

Git Bash: `ls "$APPDATA/Claude/claude-code/"`, then run the newest `claude.exe --version`. The pipeline above was not run as written; the folder listing and the `--version` call were.

- The bundle is usually older than the CLI. List the CHANGELOG sections between the two versions and name the fixes it lacks (Windows, `/loop`, background wakeups).
- Known feature floors from the docs: local scheduled tasks need Desktop 1.1.5368 or later (a Desktop app version, not a Claude Code one); `claude --desktop` needs Claude Code 2.1.285 or later.
- Several version folders: which one the app runs is unverified.

## 3. Models (verified, except fetch and hash stability)

- Overview: `https://platform.claude.com/docs/en/about-claude/models/overview` (canonical path moved to `/docs/en/models/overview`). New models appear as table columns.
- Deprecations: `https://platform.claude.com/docs/en/about-claude/model-deprecations`. It has a `Model status` table and dated `### YYYY-MM-DD: ...` history headings. Some active models are in this table only, not in the overview columns: parse both.
- Retirement needs at least 60 days' notice, and a "not sooner than" date is only a floor. A model with no deprecation entry cannot be retired within 60 days of today (inference from the notice rule).
- Alias warning: the docs do not say which version an alias such as `haiku` points to; compare full ids.
- Fetch and hash: unverified. `curl` was blocked in the research session, so plain fetch and the stability of these pages' hashes were not tested. Calibrate as in `SKILL.md` section 3.

Git Bash:

```
curl.exe -sL <url> | sha256sum
```

PowerShell (no `sha256sum`, and `curl` is an alias of `Invoke-WebRequest` in Windows PowerShell 5.1):

```powershell
$t=(Invoke-WebRequest <url> -UseBasicParsing).Content; [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t))) -replace '-'
```

A fetch error is "not checked", never "unchanged".

## 4. Plans and limits

Pages (hash their text; support articles show only a relative "Last Updated", so the date is not a detector):

- `https://support.claude.com/en/articles/11049741-what-is-the-max-plan`
- `https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan`
- `https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan`
- `https://support.claude.com/en/articles/12429409-manage-usage-credits`
- `https://code.claude.com/docs/en/routines` (usage and limits section)

Compare only the numbers the person's skills state: the 5-hour and weekly reset rules, the Max 20x versus Pro ratio, the routine caps (verified on 2026-10-07: minimum schedule interval 1 hour, schedule runs 100 per hour per account, Run now plus API 30 per hour per routine). Plan prices are on these pages too; no skill states them, so a price change needs no edit.

## 5. Mods API

- Contract: `https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts`. Change detector: `gh api repos/anthropics/claude-code/contents/mods/types/claude-code.d.ts --jq .sha`.
- Docs pages to diff: `https://code.claude.com/docs/en/plugins/mods/{api,reference,events,interface,create,admin}.md`. The reference states the version it is accurate for ("as of v2.1.NNN"); a newer number there than in `smart-mods` is a signal.
- There is no separate mods API version number or compatibility policy (none found). Whether breaking changes are flagged in the changelog is unknown.
- A mod reads the installed version with `$.session.version` and plan limits with `$.session.usage()`.
- On a change, tell the person to re-check installed mods with `claude plugin validate <dir>` and `claude plugin test`, and to prefer the types Claude Code writes for the installed build. Never edit a mod from this skill.

## 6. Matt Pocock's skills

- Upstream is `mattpocock/skills` (verified 2026-10-07): `skills/<category>/<name>/SKILL.md`, categories engineering, productivity, misc, in-progress, deprecated, plus `.claude-plugin/plugin.json` (plugin `mattpocock-skills`) and `CHANGELOG.md`.
- Installed copies under `~/.claude/skills` are plain folders with no lock entry, from an older release with older names (`matt-bridge` lists both sets). Never diff them against upstream by sha: they always differ. Compare upstream with the last-seen upstream sha in the state file (`upstreamSkills`).
- Cheap gate first, per call `--jq .sha`: `gh api repos/mattpocock/skills/contents/.claude-plugin/plugin.json` and `gh api repos/mattpocock/skills/contents/CHANGELOG.md`. Both unchanged: skip the rest.
- Else per category `gh api repos/mattpocock/skills/contents/skills/<category> --jq '[.[].name]'`: a changed list means a skill was added, renamed or removed, so check the name map in `matt-bridge`. Then per skill `gh api repos/mattpocock/skills/contents/skills/<category>/<name>/SKILL.md --jq .sha`. A different sha means read the diff; it never means copy it over: `matt-bridge` adapts around his text and never rewrites it.

## 7. Edit map

Which skill holds the line a change probably touches. Find the line with `grep -n` on the old value.

| Change | Look in |
| --- | --- |
| New or retiring model, Haiku 5.x | `model-mix/SKILL.md` Models table and the Haiku bullet; model ids anywhere else |
| 5-hour, weekly or reset rules, plan ratios | `model-mix/SKILL.md` Plan profiles; `model-mix/budget.md` Overrides |
| Routine or scheduled-task limits | `overnight`, `cloud-worker`, and `model-mix` routine bullet |
| Version floors, mods API | `smart-mods/SKILL.md` sections 2 and 3, `smart-mods/writing.md`, `smart-mods/testing.md`; `mod-ui` |
| Windows fixes now in the bundle | `windows-ops`; `overnight` (runtime choice) |
| `--cloud`, `--ref`, `--on-branch`, `/model` in cloud sessions | `cloud-worker`; `model-mix` Cloud session bullet; `coordinator-method` launch recipe |
| Skill listing, frontmatter fields, audit commands | `skill-audit`; `context-hygiene` |
| Matt's skill names or flow | `matt-bridge` |

Skills named here may not all be installed: skip a row whose skill is missing.

## 8. Scheduling

Only after the person says yes in chat, one option at a time. Cheapest first. Every option draws from the same 5-hour and weekly budget as interactive use (routines and scheduled tasks: "same as interactive sessions", no per-run figure published), so run the budget check in `model-mix` before adding a frequent schedule, and take a before and after reading of the first run (`budget.md`, Run cost). Cadence: daily is enough for the CLI version, weekly for models, limits, mods and upstream skills.

- **OS scheduler, no model (Windows Task Scheduler running a probe script):** zero model use when nothing changed, and the script calls `claude -p` only on change. Unverified: it is an inference, not a documented pattern, and Task Scheduler was not inspected on this machine. The script does not exist yet; write it from the commands above and test it by hand first. `claude --bare` needs `ANTHROPIC_API_KEY` and cannot use a Max login, so do not use it here.
- **Desktop local scheduled task:** runs only while the app is open and the computer awake; a missed run gets one catch-up run within 7 days; minimum interval 1 minute; Name, Description, Instructions with permission mode and model pickers, Schedule, folder, optional worktree; needs Desktop 1.1.5368 or later. It always starts a Claude session (shell-only is not documented). In Manual permission mode it stalls when a tool needs approval, so the shell and fetch commands need allow rules. Model per `model-mix`, own folder, no worktree.
- **Cloud routine (`/schedule` or the routines page):** runs without the machine, minimum interval 1 hour, clones a GitHub repo on every run and is skipped, then turned off after 72 hours, when GitHub is disconnected. It runs without permission prompts and with all connectors included by default, so remove every connector. A green status only means the session ended without an infrastructure error. It cannot see this machine, so it cannot read the Desktop bundle or the state file here: keep the state in the repo (inference) and limit it to the GitHub and web sources.
- The prompt of any scheduled run is self-contained and shell-first: run the commands, stop silent when nothing changed, otherwise write the report. It never edits skills.
