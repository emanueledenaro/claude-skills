# project-setup reference

Read by `project-setup` before step 1. Checked 2026-11-10: Claude Code facts against 2.1.321 and the pages under `https://code.claude.com/docs/en/`; OpenCode facts against OpenCode 2.2.6 (V2) and the pages under `https://opencode.ai/docs/`. Settings, permissions, policies and memory change between releases: when this date is old, read the page again before writing a file.

Contents: Claude Code doc facts, OpenCode doc facts, Not confirmed, settings.json template, opencode.jsonc template, .gitignore lines, Instruction files, Inspect commands, Config load check, These skills (sync script, global block), Stack skills, Branch ruleset.

## Claude Code doc facts

Settings, `settings.md`:
- Project file `.claude/settings.json` is shared and committed. `.claude/settings.local.json` is personal. When Claude Code writes the local file it adds `**/.claude/settings.local.json` to the global git excludes; a file made by hand must be added to `.gitignore` by you.
- Files are strict JSON: a comment or trailing comma is a Settings Error at the next start.
- `$schema` is `https://json.schemastore.org/claude-code-settings.json`. The schema can lag the newest CLI, so a validation warning on a new key is not always a mistake.
- Precedence, highest first: managed, command line, project local, shared project, user. Lists such as `permissions.allow` merge across files.
- `/status` shows `Setting sources`. `claude doctor` (terminal, read-only, no session) reports invalid settings. `/doctor` in a session also proposes fixes.
- A broken file: a bad entry gives a Settings Warning and is skipped; invalid JSON or a schema-rejected value gives a Settings Error dialog at the start of an interactive session.
- `permissions.defaultMode` values `auto` and `bypassPermissions` do not take effect from project or local files (`settings.md`, `permissions.md`).

Permissions, `permissions.md`:
- Rules run deny, then ask, then allow; the first match decides, and an allow cannot carve an exception out of a deny.
- Syntax is `Tool` or `Tool(specifier)`, for example `Bash(npm run test *)`, `Read(./.env)`, `Read(./.env.*)`.
- `*` in a Bash rule matches any text including spaces. A trailing ` *` with a space also matches the bare command. Put `*` after the subcommand: Claude Code warns at startup about an allow rule with `*` before the subcommand. A `*` in the middle of a deny rule is allowed.
- Compound commands: every subcommand must match an allow rule; a deny or ask rule matches if any subcommand matches.
- A Bash rule is not a security boundary. `Bash(git push *)` does not match `git -C . push` or `git -c ... push`, and `Bash(rm *)` does not match `/bin/rm`. For real enforcement use sandboxing or a PreToolUse hook.
- `Read` deny rules cover built-in file tools, `@file` mentions and recognised read commands; a `.claudeignore` file has no effect. Use `Edit` and `Read` rules; `Write(path)`, `Glob(path)` and `Grep(path)` rules do not match.
- Project `permissions.allow` waits for the workspace trust dialog. `deny` and `ask` apply at once. Allow rules in `settings.local.json` skip that step while the file stays untracked.
- PowerShell rules have the same shape: `PowerShell(Remove-Item *)`. Cmdlet aliases are matched too, and matching is case-insensitive.
- On Windows, `Read`/`Edit` paths are normalised to POSIX form before matching (`C:\Users\x` becomes `/c/Users/x`); `//c/**/.env` matches `.env` files on that drive.
- Edits to permissions apply without a restart.
- Bare file names follow gitignore semantics: `Read(.env)` and `Read(**/.env)` are the same and match at any depth under the current directory. A deny or ask pattern that starts with `!` carves paths out of the rules listed before it, in the same settings file (`Read(*.env)` then `Read(!sample.env)`). A `!` listed first carves nothing out.
- Mods (`permissions.md`, "Precedence among rules, hooks, and mods"): with no managed settings and no Team or Enterprise `/login`, a mod that handles `tool.check` can approve a call that a deny rule refuses or a PreToolUse hook blocked. With managed settings or such a login, a deny stays a deny. A session on an API key or a long-lived `CLAUDE_CODE_OAUTH_TOKEN` counts as having no such login.
- Mods, `plugins/mods/overview.md` and `plugins/mods/admin.md`: `claude plugin validate <plugin dir>` prints `hooks:` and `calls:` lines for a mod without running it. `hooks:` lists the events it handles (look for `tool.check`).

Memory, `memory.md` and `claude-directory.md`:
- Project instructions live in `./CLAUDE.md` or `./.claude/CLAUDE.md`. `CLAUDE.local.md` is personal and is added to `.gitignore` by hand. The page advises keeping a file under 200 lines.
- `@path` imports work in CLAUDE.md: relative to the file, up to four levels deep, not expanded inside code spans or code blocks. An import from outside the working directory asks for approval.
- AGENTS.md: from v2.1.277 Claude Code reads `AGENTS.md` itself only when there is no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the working directory or above. If a CLAUDE.md exists, only CLAUDE.md files load. A `CLAUDE.md` that starts with `@AGENTS.md` is the documented way to share one file with other tools, and the file is not read twice.
- `/init` writes a starting CLAUDE.md. `/context` lists loaded memory files. `/doctor prompt-audit` (v2.1.283 and later) audits instruction files.
- `.claude/rules/` holds path-scoped rules.

Skills, `skills.md`:
- Project skills live in `.claude/skills/<skill-name>/SKILL.md`, committed. Claude Code loads them from the start directory and every parent up to the repository root. Skills in a folder below the start directory load when Claude first reads or edits a file there.
- `.claude/commands/x.md` and `.claude/skills/x/SKILL.md` both create `/x`.
- `disable-model-invocation: true` stops Claude from starting a skill on its own.

Subagents, `sub-agents.md`: project subagents are files in `.claude/agents/`, committed. A directory made after the session started is not seen until restart.

Hooks, `hooks-guide.md` and `debug-your-config.md`: hooks go under the `hooks` key of `.claude/settings.json`. There is no standalone hooks file for project or user config; only plugins load one. `matcher` is a string, with `|` to match several tools, never an array. `/hooks` lists what loaded.

MCP, `mcp.md`: project servers live under `mcpServers` in `.mcp.json` at the repo root, committed. A server from `.mcp.json` stays at "Pending approval" until the person runs `claude` interactively and approves it. `enableAllProjectMcpServers` or `enabledMcpjsonServers` committed in `.claude/settings.json` is ignored in an untrusted folder.

Skills installed by the `npx skills` CLI (`https://github.com/vercel-labs/skills`, README read through a search result 2026-11-09, version 1.7.6 found in the local npx cache): `npx skills list`, `npx skills update [skills]` with `-g` for global ones, `npx skills remove`. Its `update` reinstalls without asking again. On the machine this was written on, the directories sit in `~/.agents/skills`, symlinks in `~/.claude/skills` point to them, and `~/.agents/.skill-lock.json` holds `skills.<name>.source`. The lock file layout is observed, not documented.

GitHub rulesets, `https://docs.github.com/en/rest/repos/rules` (read 2026-11-09): `GET repos/{owner}/{repo}/rules/branches/{branch}` returns the rules that apply to a branch (an empty list means none). `POST repos/{owner}/{repo}/rulesets` creates a ruleset; rule types include `non_fast_forward`, `deletion` and `pull_request` (with the parameters shown below), and `~DEFAULT_BRANCH` is a valid ref pattern. Creating one needs admin on the repo.

Plugins, from `claude plugin --help` on 2.1.321 (not from a docs page): `install`, `update <plugin>`, `list`, `details <name>` (component inventory), `validate <path> --strict`, `marketplace add`.

## OpenCode doc facts

V2 only. V1 names (`permission`, `bash`, `task`, `enabled_providers`) are never written. Read 2026-11-10 from `https://opencode.ai/docs/<page>`; `opencode --version` gave v2.2.6.

Config, `config`:
- Project file is `opencode.jsonc` or `opencode.json` at the repo root, or the same name inside `.opencode/`. JSONC allows comments and trailing commas. `$schema` is `https://opencode.ai/config.json`.
- Precedence, lowest to highest: global `~/.config/opencode/opencode.json(c)`, project files, system directory (`/Library/Application Support/opencode` on macOS, `/etc/opencode` on Linux). Files inside `.opencode/` override direct files, so use one form per tree.
- MCP servers are `mcp.servers.<name>` in the config. Skill directories can be added with a `skills` array; extra instruction files with an `instructions` array.

Permissions, `permissions`:
- `permissions` is an ordered array of `{ "action", "resource", "effect" }`. Effect is `allow`, `deny` or `ask`. The last matching rule wins; no match means `ask`.
- Actions include `shell`, `read`, `edit`, `glob`, `grep`, `skill`, `subagent`, `webfetch`, `external_directory`, and `<server>_<tool>` for MCP tools.
- Wildcards: `*` matches zero or more characters including `/`, `?` one character, whole value. A shell pattern ending in ` *` also matches the bare command.
- Base policy of every agent: allow everything, ask for `*.env` and `*.env.*` reads, allow `*.env.example`. So an allow rule changes nothing until a broader `ask` stands before it.
- The shell scanner checks every subcommand of a compound command and fails closed on syntax it cannot analyse. The page says directory inference is best effort and to prefer a narrow allowlist.
- "Allow always" saves a project-scoped allow; a saved approval never overrides a configured `deny`.

Policies, `policies`:
- `policies` is an ordered array of `{ "action", "resource", "effect" }` with effect `allow` or `deny`. The last match wins; no match allows. A statement that fails validation is dropped with a warning in the server log.
- `tool.use` with resource `<action>:<value>` hard-denies a permission check after agent rules and saved approvals (`shell:pkill *`, `edit:*.env`, `read:*/.ssh/*`). A denied call fails with `Blocked by configuration policy`. An `allow` there never grants access; it only lifts an earlier broader `deny`.
- Policies reverse the usual precedence: global and managed statements outrank project ones, so a project policy cannot re-allow what the user's global file denies.
- Other actions: `provider.use`, `integration.connect`, `integration.use`, `mcp.use`, `skill.use`, `plugin.use`, `websearch.use`. The top-level `policies` key replaces `experimental.policies`.

Instructions, `instructions`:
- V2 reads `AGENTS.md` only and never falls back to `CLAUDE.md`. It loads `~/.config/opencode/AGENTS.md`, then every `AGENTS.md` from the workspace up toward the home directory; a workspace outside the home directory stops at the project root. Nested ones load when that area is read. Changes to a loaded file are picked up before the next request.

Skills, `skills`:
- Discovery: global `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`; project `.opencode/skills`, `.claude/skills`, `.agents/skills`, searched from the working directory up to the project root.
- The ID is the path, case-sensitive; the same ID in two places is loaded from the one registered later. Order, lowest to highest: built-in, `.claude/skills`, `.agents/skills`, `~/.config/opencode/skills`, project `.opencode/skills`, `skills` config entries. So a copy in `~/.config/opencode/skills` hides the same ID in `~/.claude/skills` and `~/.agents/skills`.
- A skill without `description` is not advertised. `skill` permissions use the skill ID as the resource.

Observed, not documented: on 2.2.6 `opencode debug config --standalone` prints the config sources as JSON (see Config load check); the log is `~/.local/share/opencode/log/opencode.log` (troubleshooting page, macOS and Linux).

## Not confirmed, left out

- No documented command checks a settings file against the schema. `claude doctor` is the closest; the schema URL is for editors.
- The docs give no example for `pkill`, `killall` or force-push deny rules. The rules below follow the confirmed syntax, but they were not run against a live session. The force-push forms are not exhaustive (`git push origin +main`, `git -C . push -f` and aliases get through); the ruleset is the real guard.
- The settings-reference "Exclude sensitive files" section: the link is cited by `permissions.md`, but the saved settings-reference page has no section by that name. The `Read(./.env)` examples come from `settings.md` and `permissions.md`.
- The ruleset JSON below follows the GitHub docs page but was not sent to a repo. `installed_plugins.json` (`.plugins.<id>[0].installPath`) is observed on 2.1.321, not documented.
- Whether `.claude/settings.json` is read when Claude Code starts in a subfolder of the repo: `settings.md` says it reads from the session's primary working directory, so start at the root.
- OpenCode: the policy templates below follow the `policies` and `permissions` pages and were loaded without a warning by `opencode debug config --standalone` on 2.2.6 (a bogus statement did produce one), but no deny was exercised by a live agent call. Whether a `read:` policy stops `cat .env` run through `shell` is not documented: assume it does not. The pages give no resource examples for `git push --force` variants beyond `shell:git push *`.
- OpenCode on Windows: the log path, symlink behaviour and the sync script were not checked. Use `windows-ops` and report instead of fixing.
- No documented OpenCode command validates a config file. `opencode debug config` is the closest, and it exits 0 and silently omits a file it rejected: see Config load check.
- Whether OpenCode reads `.mcp.json`: the config page lists only `mcp.servers`, and nothing about `.mcp.json` was found.

## settings.json template

Replace the allow list with the project's own commands from step 1; keep every deny that the project already has and add these. Strict JSON, no comments.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(<package-manager> run test)",
      "Bash(<package-manager> run lint)"
    ],
    "deny": [
      "Bash(pkill *)",
      "Bash(killall *)",
      "Bash(git push --force*)",
      "Bash(git push -f *)",
      "Bash(git push * --force*)",
      "Bash(git push * -f)",
      "Bash(git push * -f *)",
      "Read(**/.env)",
      "Read(**/.env.*)"
    ]
  }
}
```

Notes for the diff:
- `Bash(pkill *)` also covers `pkill -f`. `--force*` also blocks `--force-with-lease`, which git-conventions forbids anyway.
- On Windows, add `PowerShell(Stop-Process *)` and `PowerShell(git push --force*)` only if the project's agents run PowerShell; the person decides.
- Add `Read` denies for the key and credential files the project really has (`**/*.pem`, `credentials.json`). Do not guess names.
- If the project has `.env.example` or `.env.sample`, offer `Read(!**/.env.example)` as the last entry of `deny`. It loosens a deny, so it is the person's call and goes in only with their ok.
- `Bash` rules above are the Unix shell form. The Windows allow and deny forms use `PowerShell(...)` (see Permissions above).
- Show the diff against the existing file. A new file is shown whole.

## opencode.jsonc template

Same deny set as the settings.json template, mirrored 1:1. The deny rules are `policies`, so a saved approval or a later rule cannot lift them. JSONC, so comments are fine. Keep every statement the project already has.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "policies": [
    { "action": "tool.use", "resource": "shell:pkill *", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:killall *", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push --force*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push -f *", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push * --force*", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push * -f", "effect": "deny" },
    { "action": "tool.use", "resource": "shell:git push * -f *", "effect": "deny" },
    { "action": "tool.use", "resource": "read:*.env", "effect": "deny" },
    { "action": "tool.use", "resource": "read:*.env.*", "effect": "deny" }
  ]
}
```

Optional, only with the person's ok and only as a pair, because the default policy already allows every action:

```jsonc
  "permissions": [
    { "action": "shell", "resource": "*", "effect": "ask" },
    { "action": "shell", "resource": "<package-manager> run test", "effect": "allow" },
    { "action": "shell", "resource": "<package-manager> run lint", "effect": "allow" }
  ]
```

Notes for the diff:
- The `shell` ask rule first, then one allow per exact script name from step 1: the last match wins, so the allows must come after it. It makes every other command prompt, which changes how the person works: their call.
- `read:*.env.*` also denies `.env.example`. If the project has one, offer `{ "action": "tool.use", "resource": "read:*.env.example", "effect": "allow" }` right after it (a policy allow lifts the earlier deny, then the default rule allows the read). It loosens a deny, so it goes in only with their ok.
- Add `read:` denies for the key and credential files the project really has (`read:*.pem`, `read:*credentials.json`). Do not guess names.
- Reach, to say once: a policy blocks the tool check, not the OS. The `read` policy covers the read tool; a shell command that opens the file is a `shell` check, so say that `cat .env` is not blocked by it. The shell scanner expands compound commands, but `git -C . push` and `/bin/rm` differ from the pattern text, as in Claude Code. The `policies` page says nothing about a sandbox.
- A user's global policies outrank the project's, so this file can only add denies, never lift a global one.
- MCP: report `mcp.servers` names from the global and project files (never `headers`, `environment` or token values). `.mcp.json` is Claude Code's; do not copy servers between them.

## .gitignore lines

```
.claude/settings.local.json
CLAUDE.local.md
```

## Instruction files

OpenCode V2 reads `AGENTS.md` only; Claude Code reads `CLAUDE.md` first and takes `AGENTS.md` only through an import. So the project text lives in `AGENTS.md` and `CLAUDE.md` is a thin file:

```markdown
@AGENTS.md

## Claude Code
<lines only Claude Code needs, or nothing>
```

Cases, with the diff shown first and written after the person's ok:
- Only `AGENTS.md`: add the `CLAUDE.md` above.
- Both: check `CLAUDE.md` starts with `@AGENTS.md`. If both carry the same text, show the overlap and propose keeping it in `AGENTS.md` only.
- Only `CLAUDE.md`: `git mv CLAUDE.md AGENTS.md`, then create the `CLAUDE.md` above. Lines that name Claude Code features (hooks, `/commands`, plugin names) stay under `## Claude Code`; the rest goes to `AGENTS.md`. `@path` imports move with their file, so check each still resolves from the new place. One commit, so the move shows as a rename.
- Neither: create `AGENTS.md` with the Checks and queue block (step 4), then the `CLAUDE.md` above.
- Global: OpenCode reads `~/.config/opencode/AGENTS.md` and Claude Code reads `~/.claude/CLAUDE.md`. See These skills below.

## Inspect commands

From the repo root. All read-only.

```bash
git status -sb && git remote -v && git symbolic-ref --short refs/remotes/origin/HEAD
ls -a CLAUDE.md CLAUDE.local.md AGENTS.md .mcp.json opencode.json opencode.jsonc .opencode .gitignore 2>&1
ls -a .claude .claude/skills .claude/agents .claude/commands 2>&1
ls ~/.claude/skills ~/.agents/skills ~/.config/opencode/skills 2>&1 | head -200
claude plugin list 2>&1 | head -40
jq 'if .env then .env |= map_values("<redacted>") else . end' .claude/settings.json 2>/dev/null
jq '.mcpServers|keys' .mcp.json 2>/dev/null
opencode --version 2>&1 | head -1
grep -nE '"(policies|permissions|skills|instructions|servers)"' opencode.jsonc .opencode/opencode.jsonc 2>/dev/null
gh api repos/{owner}/{repo}/rules/branches/<default>
git check-ignore -v .claude/settings.local.json CLAUDE.local.md
ls package.json pnpm-lock.yaml yarn.lock package-lock.json bun.lockb pyproject.toml uv.lock Cargo.toml go.mod Gemfile Makefile justfile docker-compose*.yml compose*.y*ml .github/workflows .gitlab-ci.yml 2>&1
claude doctor
```

Installed mods that handle `tool.check` (paths from the plugin install record; read-only):

```bash
jq -r '.plugins[][].installPath' ~/.claude/plugins/installed_plugins.json | while read -r p; do
  claude plugin validate "$p" 2>&1 | grep -q 'hooks:.*tool\.check' && echo "tool.check: $p"
done
```

Matt Pocock's skills, in the order of `project-setup` step 4 (read-only; `<name>` is a skill from `matt-bridge/flow.md`):

```bash
ls .claude/skills/<name>/SKILL.md ~/.claude/skills/<name>/SKILL.md ~/.agents/skills/<name>/SKILL.md 2>&1
jq -r '.skills|to_entries[]|select(.value.source=="mattpocock/skills")|.key' ~/.agents/.skill-lock.json
claude plugin list
```

## Config load check

From the repo root, after writing `opencode.jsonc`. `--standalone` starts a private server, so it does not touch the shared one. The `jq` filter keeps paths only: the full output also holds the user's global config, with server URLs and headers.

```bash
log=~/.local/share/opencode/log/opencode.log
n=$(wc -l < "$log" 2>/dev/null || echo 0)
opencode debug config --standalone | jq -r '.[] | select(.type=="document") | .path'
tail -n +$((n+1)) "$log" | grep 'configuration normalization diagnostic' | grep -F "$(pwd -P)/opencode.jsonc"
```

Pass: the first command lists `<repo>/opencode.jsonc` and the last prints nothing. Tested on 2.2.6:
- A file with a trailing comma loads. A file with broken JSON is left out of the list, exit code 0, and the log says `rejected malformed JSON or JSONC document`. So a missing path in the list is the failure signal, not the exit code.
- A statement with an unknown action (`bogus.use`) loads the file but logs `skipped malformed recognized value` with its path (`$.policies.0`). That is how a `deny` that did not take effect shows up.
- The log line carries the file path and a JSON path only, no values.

## These skills

One script, run from any directory. The repo is public, so it writes only when `~/.claude/CLAUDE.md` has the line `claude-skills: auto-sync` on a line of its own (the README documents it). Without that line it is a dry run: it prints `would:` lines for the exact actions, you ask the person once, and after the ok you rerun it with `APPLY=1`. Then offer to add the line, so later runs need no question; add it only after their ok. The only write of a dry run is `git fetch` in the clone.

What it does:
1. Finds the clone of `emanueledenaro/claude-skills` (through the symlinks of installed skills, else `~/.agents/repos/claude-skills`, which it clones if absent). A clone may be a worktree, where `.git` is a file.
2. Fast-forwards a clone, any clone, only when it is clean and on its default branch; otherwise it prints a `report:` line and leaves it, since it may be the person's working copy.
3. Links every skill in the clone's `HEAD` that has no `~/.claude/skills/<id>/SKILL.md` (`~/.agents/skills/<id>` to the clone, `~/.claude/skills/<id>` to that). A dangling symlink is replaced; a real directory is reported, never overwritten.
4. Compares every copy OpenCode or Claude Code can load (`~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`) with `origin`'s default branch, and updates a stale one: a marketplace clone through `claude plugin marketplace update`, another clone through the same clean-and-default-branch fast-forward. A plain copy that differs is reported.
5. Adds the README's routing block to `~/.claude/CLAUDE.md` and links `~/.config/opencode/AGENTS.md` to it (appending the block instead when that is a different file). It never rewrites a line.

Tested on macOS in throwaway homes: a clean install, a second run, a plain stale copy, a stale marketplace clone (dry run), a home path with a space, a clone that is a worktree, a second clone on a work branch, and a home with no `auto-sync` line. Not run on Windows or Linux.

Why every location: OpenCode ranks `~/.config/opencode/skills` above `~/.claude/skills` and `~/.agents/skills`. A symlink there into a marketplace clone that is behind makes OpenCode load the old text without any warning, while Claude Code loads the new one. `claude plugin marketplace update <name>` fixed it in practice.

```bash
#!/usr/bin/env bash
set -u
slug=emanueledenaro/claude-skills
if [ "${APPLY:-}" != 1 ] && ! grep -qxF 'claude-skills: auto-sync' "$HOME/.claude/CLAUDE.md" 2>/dev/null; then
  DRY=1; echo "note: no 'claude-skills: auto-sync' line in ~/.claude/CLAUDE.md, dry run (APPLY=1 after the person's ok)"
fi
run() { if [ "${DRY:-}" = 1 ]; then echo "would: $*"; else "$@" && echo "did: $*"; fi; }
same_repo() { git -C "$1" remote get-url origin 2>/dev/null | grep -Eq "[/:]$slug(\.git)?\$"; }
ff() { # fast-forward a clone only when it is clean and on its default branch
  local r; r=$(git -C "$1" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null) || { echo "report: $1 has no origin/HEAD, not pulled"; return; }
  if [ "$(git -C "$1" branch --show-current)" = "${r#origin/}" ] && [ -z "$(git -C "$1" status --porcelain)" ]; then
    run git -C "$1" pull --ff-only --quiet
  else echo "report: $1 is dirty or off the default branch, not pulled"; fi
}
mkd() { [ "${DRY:-}" = 1 ] && echo "would: mkdir -p $*" || mkdir -p "$@"; }
ids_of() { git -C "$clone" ls-tree -r --name-only "$1" | sed -n 's|^\([^/]*\)/SKILL\.md$|\1|p'; }

# 1. Find the clone: through the symlinks of installed skills, else the default place.
clone=
for l in "$HOME"/.agents/skills/* "$HOME"/.claude/skills/* "$HOME"/.config/opencode/skills/*; do
  [ -L "$l" ] || continue
  p=$(realpath "$l" 2>/dev/null) || continue
  top=$(git -C "$(dirname "$p")" rev-parse --show-toplevel 2>/dev/null) || continue
  case $top in */.claude/plugins/marketplaces/*) continue ;; esac
  same_repo "$top" && { clone=$top; break; }
done
clone=${clone:-$HOME/.agents/repos/claude-skills}
git -C "$clone" rev-parse --git-dir >/dev/null 2>&1 || run git clone "https://github.com/$slug.git" "$clone"
git -C "$clone" rev-parse --git-dir >/dev/null 2>&1 || { echo "then: link every skill and add the routing block"; exit 0; }
clone=$(cd "$clone" && pwd -P); echo "clone: $clone"

# 2. Fast-forward it.
git -C "$clone" fetch --quiet origin
ref=$(git -C "$clone" symbolic-ref --short refs/remotes/origin/HEAD) || { echo "report: $clone has no origin/HEAD"; exit 1; }
[ "$(git -C "$clone" rev-parse HEAD)" = "$(git -C "$clone" rev-parse "$ref")" ] || ff "$clone"

# 3. Link every missing skill of HEAD. A dangling symlink is replaced; anything else is reported.
mkd "$HOME/.agents/skills" "$HOME/.claude/skills"
for id in $(ids_of HEAD); do
  [ -e "$HOME/.claude/skills/$id/SKILL.md" ] && continue
  [ -d "$clone/$id" ] || continue
  for pair in "$HOME/.agents/skills/$id|$clone/$id" "$HOME/.claude/skills/$id|../../.agents/skills/$id"; do
    link=${pair%%|*}; target=${pair#*|}
    { [ -L "$link" ] && [ ! -e "$link" ]; } && run rm "$link"
    if [ -e "$link" ] || [ -L "$link" ]; then echo "report: $link exists, left alone"; continue; fi
    run ln -s "$target" "$link"
  done
done

# 4. Every copy either tool can load must match origin's default branch.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git -C "$clone" archive "$ref" | tar -x -C "$tmp"
rids=$(ids_of "$ref")
copies() { for id in $rids; do for d in "$HOME/.config/opencode/skills/$id" "$HOME/.claude/skills/$id" "$HOME/.agents/skills/$id"; do
  [ -e "$d" ] && ! diff -rq "$tmp/$id" "$d/" >/dev/null 2>&1 && echo "$d"; done; done; }
seen=" "
while IFS= read -r d; do
  top=$(git -C "$(realpath "$d")" rev-parse --show-toplevel 2>/dev/null)
  case $seen in *" $top "*) continue ;; esac
  if [ -z "$top" ] || ! same_repo "$top"; then echo "report: $d differs and is a plain copy, left alone"; continue; fi
  seen="$seen$top "
  case $top in
    "$clone") ;;
    */.claude/plugins/marketplaces/*) run claude plugin marketplace update "$(basename "$top")" ;;
    *) ff "$top" ;;
  esac
done < <(copies)
[ "${DRY:-}" = 1 ] || while IFS= read -r d; do echo "still differs: $d"; done < <(copies)

# 5. Routing block: from the clone's README, appended, never rewritten.
block=$(git -C "$clone" show HEAD:README.md 2>/dev/null | awk '/^Then add a routing block/{f=1} f&&/^```markdown/{g=1;next} g&&/^```/{exit} g')
[ -n "$block" ] || { echo "report: no routing block found"; exit 1; }
emit() { # file, label, text
  if [ "${DRY:-}" = 1 ]; then echo "would $2: $1"; printf '%s\n' "$3" | cut -c1-100 | sed 's/^/  | /'
  else { [ -s "$1" ] && printf '\n'; printf '%s\n' "$3"; } >> "$1"; echo "did $2: $1"; fi
}
ensure_block() {
  grep -qF 'use `model-mix`' "$1" 2>/dev/null || { emit "$1" "add the routing block to" "$block"; return; }
  miss=$(for id in $(printf '%s\n' "$block" | grep -o '`[a-z-]*`' | tr -d '`' | sort -u); do
    grep -qF "\`$id\`" "$1" || printf '%s\n' "$block" | grep -oE "[A-Z][^.]*\`$id\`[^.]*\." | head -1
  done | awk 'NF && !seen[$0]++' | paste -sd' ' -)
  [ -z "$miss" ] || emit "$1" "add the missing routing lines to" "$miss"
}
mkd "$HOME/.claude"
ensure_block "$HOME/.claude/CLAUDE.md"
oc=$HOME/.config/opencode/AGENTS.md
if [ -L "$oc" ] && [ "$(realpath "$oc")" = "$(realpath "$HOME/.claude/CLAUDE.md" 2>/dev/null)" ]; then :
elif [ -e "$oc" ]; then ensure_block "$oc"
else { [ -L "$oc" ] && run rm "$oc"; }; mkd "$HOME/.config/opencode"; run ln -s "$HOME/.claude/CLAUDE.md" "$oc"; fi
grep -q '^Claude plan:' "$HOME/.claude/CLAUDE.md" 2>/dev/null || echo "ask: Claude plan line"
```

Report each `did:`, `would:`, `report:` and `still differs:` line to the person in one short list. A copy inside the clone itself that still differs means the clone is on a work branch: say so, do not switch it.

The plan line is the one thing to ask: `Claude plan: <Pro|Max|Ultra> · reserve 10%`, written to `~/.claude/CLAUDE.md` after the answer. Recommend from what `/status` shows (Claude Code tells Pro from Max, not Max from Ultra). If `~/.config/opencode/AGENTS.md` is its own file, append the plan line there too, so OpenCode sessions see it. A link from `~/.config/opencode/AGENTS.md` to `CLAUDE.md` also hands OpenCode the Claude-only lines and the `@` imports, which it does not follow: a person who keeps those in the global file may prefer a separate file with the block. On Windows the links were not checked: use `windows-ops` and report instead of fixing.

## Stack skills

From the stack of step 1 (`package.json` dependencies, `supabase/`, `vercel.json`, `.vercel/`, `pyproject.toml`, `Cargo.toml`). Official vendor skills only: the repo owner is the vendor's own GitHub organisation (`gh api repos/<owner>/<repo> --jq .owner.login`) and the vendor's docs name that repo. A skill from a community directory (skills.sh, a personal repo) is not suggested.

Checked 2026-11-10:

| Signal | Source | Skills | Evidence |
| --- | --- | --- | --- |
| `supabase/`, `@supabase/*`, `SUPABASE_URL` | `supabase/agent-skills` | `supabase`, `supabase-postgres-best-practices` | Supabase docs, "Agent Skills" (`supabase.com/docs/guides/getting-started/ai-skills`) |
| `next`, `vercel.json`, `.vercel/` | `vercel-labs/agent-skills` | `react-best-practices`, `vercel-optimize`, `deploy-to-vercel`, `web-design-guidelines` and others | The repo README says "from Vercel Engineering"; the Vercel docs page was not read |

Another vendor goes in this table only after its own docs name the repo.

Duplicates first: a skill is installed if its ID is a directory or link in `~/.claude/skills`, `~/.agents/skills`, `~/.config/opencode/skills` or `.claude/skills`, or comes from `claude plugin list`. A plugin skill with the same job counts as installed (a Vercel plugin may already ship `react-best-practices`): report it and suggest nothing. Compare descriptions, not only names.

Vet, then ask. Fetch the vendor repo into a new empty directory (`git clone --depth 1`), run `skill-audit` on the skills to install (scripts, dangerous instructions, size), and show the verdict with the exact command. The install is at user level, never in the project: the `skills` CLI defaults to project scope, so `-g` is not optional.

```bash
npx skills add supabase/agent-skills --skill supabase --skill supabase-postgres-best-practices -g
```

`add` options read from `npx skills add --help` on skills 1.7.6: `-g/--global`, `-s/--skill`, `-a/--agent`, `-l/--list`, `-y`. Run it only after the person's ok on that exact line. Then check `~/.agents/skills/<id>/SKILL.md` exists and `~/.claude/skills/<id>` resolves to it. If the CLI left the link out, create it: `ln -s ../../.agents/skills/<id> ~/.claude/skills/<id>`. OpenCode reads both folders, so no third link. Updates are `npx skills update -g <id>`, again after an ok.

## Branch ruleset for the default branch

Offer it when `rules/branches/<default>` returns `[]`. It blocks force pushes and deletion and requires a pull request. Change the repo only on the person's explicit ok, and tell them it needs admin.

```json
{
  "name": "protect-default",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "non_fast_forward" },
    { "type": "deletion" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false } }
  ]
}
```

```bash
gh api repos/{owner}/{repo}/rulesets -X POST --input ruleset.json
```

On Windows PowerShell use `Get-ChildItem -Force`, `Get-Content` and `Test-Path` for the same checks; shell traps are in `windows-ops`. Read the check command from the `scripts` block of `package.json`, the `Makefile`, the `justfile` or the CI workflow. Never run an unfamiliar script just to learn what it does. The `jq` lines need `jq` installed; without it, read the file by eye and skip every `env` and `headers` value.
