# project-setup reference

Read by `project-setup` before step 2. Checked 2026-11-09 against Claude Code 2.1.321 and the pages below, all under `https://code.claude.com/docs/en/`. Settings, permissions and memory change between releases: when this date is old, read the page again before writing a file.

## Doc facts

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

Plugins, from `claude plugin --help` on 2.1.321 (not from a docs page): `install`, `update <plugin>`, `list`, `details <name>` (component inventory), `validate <path> --strict`, `marketplace add`.

## Not confirmed, left out

- No documented command checks a settings file against the schema. `claude doctor` is the closest; the schema URL is for editors.
- The docs give no example for `pkill`, `killall` or force-push deny rules. The rules below follow the confirmed syntax, but I did not run them against a live session, and the force-push forms are not exhaustive (`git push origin +main`, `git -C . push -f` and aliases get through).
- The settings-reference "Exclude sensitive files" section: the link is cited by `permissions.md`, but the saved settings-reference page has no section by that name. The `Read(./.env)` examples come from `settings.md` and `permissions.md`.
- Whether `.claude/settings.json` is read when Claude Code starts in a subfolder of the repo: `settings.md` says it reads from the session's primary working directory, so start at the root.

## settings.json template

Replace the allow list with the project's own commands from step 1; keep every deny that the project already has and add these. Strict JSON, no comments.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(<package-manager> run test *)",
      "Bash(<package-manager> run lint *)"
    ],
    "deny": [
      "Bash(pkill *)",
      "Bash(killall *)",
      "Bash(git push --force*)",
      "Bash(git push -f *)",
      "Bash(git push * --force*)",
      "Bash(git push * -f)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
```

Notes for the diff:
- `Bash(pkill *)` also covers `pkill -f`. `--force*` also blocks `--force-with-lease`; if the person wants that allowed, add an ask rule instead.
- On Windows, add `PowerShell(Stop-Process *)` and `PowerShell(git push --force*)` only if the project's agents run PowerShell; the person decides.
- Add `Read` denies for the key and credential files the project really has (`*.pem`, `credentials.json`). Do not guess names.
- Show the diff against the existing file. A new file is shown whole.

## .gitignore lines

```
.claude/settings.local.json
CLAUDE.local.md
```

## CLAUDE.md that imports AGENTS.md

```markdown
@AGENTS.md

## Claude Code
<lines only Claude Code needs, or nothing>
```

## Inspect commands

From the repo root. All read-only.

```bash
git status -sb && git remote -v && git symbolic-ref --short refs/remotes/origin/HEAD
ls -a CLAUDE.md CLAUDE.local.md AGENTS.md .mcp.json .gitignore 2>&1
ls -a .claude .claude/skills .claude/agents .claude/commands 2>&1
cat .claude/settings.json 2>/dev/null
git check-ignore -v .claude/settings.local.json CLAUDE.local.md
ls package.json pnpm-lock.yaml yarn.lock package-lock.json bun.lockb pyproject.toml uv.lock Cargo.toml go.mod Gemfile Makefile justfile docker-compose*.yml compose*.y*ml .github/workflows .gitlab-ci.yml 2>&1
claude doctor
```

On Windows PowerShell use `Get-ChildItem -Force`, `Get-Content` and `Test-Path` for the same checks; shell traps are in `windows-ops`. Read the check command from the `scripts` block of `package.json`, the `Makefile`, the `justfile` or the CI workflow. Never run an unfamiliar script just to learn what it does.
