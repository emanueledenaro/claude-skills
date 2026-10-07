---
name: windows-ops
description: "Windows 11 field rules for Claude Code on the person's machine: which shell runs what (PowerShell tool or Git Bash), Git Bash turning `/arg` into a path, the 260-character path limit and 'Filename too long', CRLF warnings, missing tools (`expect`, `pwsh`), sleep and timeout, quoting, where Claude Code and the Desktop app keep files and versions, and WSL sessions. Use when running any shell command on Windows, when a command fails with a path, quoting, 'not recognized' or 'sintassi non valida' error, when writing scripts, clones or launch commands for this machine, or when checking which Claude Code version runs, in any project."
---

This skill decides how to run commands and handle files on the person's Windows 11 machine so the usual failures never start. It holds the machine facts; the other skills hold the method: `coordinator-method` for delegation, `cloud-worker` for launching cloud sessions, `overnight` for unattended runs, `smart-mods` for mod code. Its catalogue (symptom table, probe commands, version floors) is in `reference.md`: read it when a command has already failed or when you must check a fact.

Facts marked **unverified** have no source yet. Facts about this machine were true when checked: re-probe with the commands in `reference.md` before relying on one that decides something.

## 1. Pick the shell per command

- The system prompt names the primary shell. Here it is the PowerShell tool, with the Bash tool (Git Bash) for POSIX scripts. Each takes its own syntax: do not paste one into the other.
- PowerShell is Windows PowerShell 5.1 (`powershell.exe`). `pwsh` (7) is not installed, so write 5.1 code: no `&&` or `||` (use `;` or `if ($LASTEXITCODE -eq 0) { ... }`), no ternary, no `??`. Backslash paths, `$env:VAR`, backtick escape, here-strings `@'` ... `'@` (the closing `'@` at column 0).
- Bash is for `grep`, `sed`, `find`, `git` one-liners, heredocs and anything written as a `.sh`. Paths there are `/c/Users/...` or `C:/Users/...`, and `VAR=x cmd` sets an env var for one command.
- Take Windows tools (`reg`, `where.exe`, `taskkill`, `robocopy`, `cmd`) from PowerShell. From Bash they need section 2.
- `bash` typed in PowerShell can resolve to the WSL launcher in `System32`, not Git Bash. Call `& 'C:\Program Files\Git\bin\bash.exe'` by full path when you need Git Bash from PowerShell.
- Write files with the Write tool, not shell redirection: PowerShell 5.1 has its own default encodings. Claude Code makes `>` and piped input to native commands UTF-8 from 2.1.214; before that `>` wrote UTF-16. `Set-Content -Encoding utf8` on 5.1 adds a byte-order mark (general knowledge, not re-tested here).
- Exit codes: exit 1 from `grep`, `rg`, `findstr`, `git grep` (no match), `git diff` (differences) and `where.exe` or `fc.exe` with output is not a failure. `robocopy` 0-7 is informational, 8 or more is a failure. A silenced `where.exe /Q` still reports failure.
- No Git Bash means no Bash tool and no Monitor tool: Claude Code then uses PowerShell alone. If it exists but is not found, propose `CLAUDE_CODE_GIT_BASH_PATH` (path to `bash.exe`) under `settings.json` `env` and set it with `update-config` only after the person agrees.

## 2. Git Bash rewrites `/arg` into a path

- Git Bash converts any argument that starts with `/` into a Windows path when it starts a native program. Seen: `reg query ... /v Path` failed with "sintassi non valida", and a lone `/x` arrives as `X:/` (tested). Seen this session: `claude -p "/x"` from Git Bash became a path and reached the model as text, not as a slash command.
- Fix, by preference:
  1. Run the command in the PowerShell tool.
  2. `MSYS_NO_PATHCONV=1 <cmd>` switches conversion off for that command (tested; it comes from Git for Windows, only its behavior is verified here).
  3. `MSYS2_ARG_CONV_EXCL='/v;/c' <cmd>` excludes those prefixes, separated by `;`; `'*'` excludes all (tested; documented by MSYS2). Use it when the same command also needs a real path converted.
- Give paths to native programs as `C:/...`. `/c/...` and `~/` work only while conversion is on: under `MSYS_NO_PATHCONV=1` they arrive unchanged and fail.
- Applies to `cmd /c`, `where.exe /Q`, `fc /...`, `taskkill /F`, `robocopy /E`, and `claude -p "/command"`: use fix 1, or fix 3 as `MSYS2_ARG_CONV_EXCL='/<command>'` when the same command passes paths (the `smart-mods` smoke test), or fix 2 with every path written `C:/...`. Without one of them the model gets a path instead of the command.
- A `//v` double slash also works for one flag (tested with `cmd //c`), but the two variables are easier to read.

## 3. Keep paths short

- Windows caps a path at 260 characters unless the registry flag and the program's manifest both allow more. The flag (`LongPathsEnabled`) is on here, yet Git and `claude` still failed on long paths in this session: do not count on it. Never edit the registry: it is a system setting, and the person owns it.
- Seen: `git clone` into a long scratch path failed with "Filename too long", and the `claude` CLI refused to start from a long working directory ("path longer than allowed for a Win32 working directory").
- Clone and create worktrees under a short root, for example `C:\w\<repo>`. Run `claude` and every spawned CLI from a short cwd. Keep mod and skill sources in short paths, outside the scratch workspace.
- If a clone must go somewhere long: `git -c core.longpaths=true clone <url> <dir>`. `core.longpaths` is unset here, and Git reads it on its own, apart from the registry. Prefer `-c` per command. A global `git config --global core.longpaths true` is a standing change to the person's config: ask first.
- Deep `node_modules` trees are the usual way to cross 260. Install them in the short root, not under a scratch path.

## 4. Line endings

- `core.autocrlf=true` is set system-wide for Git: files become CRLF on checkout and LF on commit. The warnings "LF will be replaced by CRLF" and the reverse are harmless. Do not "fix" files or add `.gitattributes` to silence them unless the person asks.
- Scripts that Bash must run (`.sh`, `launch.exp`) and skill or command files with multi-line `!` blocks must stay LF. A CRLF multi-line `!` block failed on Windows before Claude Code 2.1.290.
- `core.safecrlf=true` makes Git refuse irreversible conversions: do not set it.

## 5. Missing tools, waits and quoting

- Not installed here: `expect` and `pwsh`. Anything that needs `expect` (the `coordinator-method` launch script) cannot run natively: see `cloud-worker`. `caffeinate` is macOS only: see `overnight` for keeping the machine awake.
- The Bash tool blocks a foreground `sleep`. Wait by running the poll in the background (`run_in_background`) or with Monitor and an until-loop. In PowerShell a short pause is `Start-Sleep -Seconds N`.
- Avoid bare `timeout` in PowerShell: it can be Windows' countdown pause or Git's GNU `timeout`, depending on PATH order (**unverified** which wins in a given session). Git Bash has GNU `timeout DURATION COMMAND`, which kills a command and is not a wait.
- Foreground commands stop at 120000 ms by default and 600000 ms at most (`BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`). Background commands have a limit of 30 minutes by default, 2 hours at most, only in unattended sessions (`-p`, SDK, CI, cloud); local terminal and Desktop sessions have none.
- Monitor needs Git Bash on Windows and is off when `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set. Fallback: a PowerShell polling loop run in the background.
- A long or quoted prompt as a PowerShell native-command argument can lose its double quotes (**unverified** here) and Windows caps a command line near 32,000 characters. Put long text in a file and pass a short pointer or read it from the file.

## 6. Where things live, and which Claude Code runs

- `C:\Users\<user>\.claude` holds `settings.json`, skills, plugins, projects and memory. `CLAUDE_CONFIG_DIR` moves it, and only as a real environment variable, never from `settings.json` `env`.
- The Desktop app bundles its own Claude Code at `%APPDATA%\Claude\claude-code\<version>\claude.exe` and keeps app config in `%APPDATA%\Claude` (`claude_desktop_config.json`, `config.json`). The standalone CLI does not read `claude_desktop_config.json`.
- Desktop and the CLI can be different versions, and Desktop may trail the CLI. Check each before you rely on a fix or a feature: `claude --version` in the shell, `/status` in a Desktop local session, or with no model and no person: list `%APPDATA%\Claude\claude-code\` and run the newest `claude.exe --version`. The folder layout is undocumented; with several version folders, take the newest and say so.
- Desktop reads the user and system environment variables, not PowerShell profiles: a variable set only in a profile is invisible to it.
- Since 2.1.285, project and local `settings.json` `env` cannot set `ALLUSERSPROFILE`, `SystemDrive` or `CommonProgramFiles`; set them in user or managed settings.

## 7. WSL sessions

- A Desktop WSL session needs WSL 2 and `git` inside the distro, and runs Claude Code there with Linux paths. It has no integrated terminal, connectors, plugins, forking, file browser, `@` suggestions, `/resume` or move-to-cloud, and no mods (the WSL page is silent on mods; `smart-mods` records that they do not run).
- Route work that needs skills from plugins, connectors, mods or the integrated terminal to a local Windows session, not WSL.
- Whether a WSL session reads its own `~/.claude` in the distro, apart from the Windows one, is **unverified**: check before editing config for it.

## 8. No sandbox here

- Native Windows has no sandbox: Bash and PowerShell commands run with the person's full rights. Only permission rules and the person's approvals stand between a command and the machine.
- A deny rule on Bash does not cover PowerShell. A deny on Bash, even a scoped one, turns the PowerShell tool off for the session unless `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` or a PowerShell rule is set. Hooks that guard shell commands match `Bash|PowerShell`.

## 9. Calibrate once on a new machine or version

- Run the probes in `reference.md` (versions, `where.exe`, git config, `reg query` with the path fix) and note any that differ from the facts above.
- Open items worth one test when they matter: which `timeout` PowerShell resolves, whether `claude` and the file tools survive paths over 260 characters with the registry flag on, whether the Desktop WSL session has its own config directory.
