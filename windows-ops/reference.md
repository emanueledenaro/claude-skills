# windows-ops reference

Catalogue for `SKILL.md`: a symptom table, probe commands, Claude Code version floors and the settings that steer shells. Facts about this machine were checked on 2026-10-07; re-run the probes before a decision depends on one.

## Symptom, cause, fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| `reg`, `cmd /c`, `taskkill /F`, `where.exe /Q` fail with "sintassi non valida" or "invalid syntax" from the Bash tool | Git Bash turned `/v`, `/c`, `/F` into paths | Run it in PowerShell, or `MSYS_NO_PATHCONV=1 <cmd>`, or `MSYS2_ARG_CONV_EXCL='*' <cmd>` |
| A slash command sent with `claude -p "/x"` from Bash is answered as plain text about a path | `/x` was rewritten to `X:/` before `claude` saw it | Same fix; run the check in PowerShell when in doubt |
| `fatal: ... Filename too long` on clone, checkout or worktree | A path went over 260 characters; `core.longpaths` is unset | `git -c core.longpaths=true ...`, and a short root such as `C:\w\<repo>` |
| `claude` will not start: "path longer than allowed for a Win32 working directory" | The working directory is too long | `cd` to a short path first |
| "LF will be replaced by CRLF" or "CRLF will be replaced by LF" | `core.autocrlf=true` set system-wide | Ignore it; do not rewrite files |
| A `.sh` script fails with `\r` errors, or a multi-line `!` block in a skill fails | The file is CRLF | Save it LF. The `!` block bug is fixed from Claude Code 2.1.290 |
| PowerShell: "The token '&&' is not a valid statement separator" | Windows PowerShell 5.1 has no `&&` | Use `;` or `if ($LASTEXITCODE -eq 0) { ... }` |
| `expect` or `pwsh` "not found" | Neither is installed | No `expect` natively: see `cloud-worker`. Use `powershell.exe` (5.1), never `pwsh` |
| `bash` from PowerShell opens WSL or fails | PATH finds `System32\bash.exe` (WSL launcher) first | Call `C:\Program Files\Git\bin\bash.exe` by full path |
| No Bash tool, no Monitor tool | Git Bash missing or not found | Install Git for Windows or set `CLAUDE_CODE_GIT_BASH_PATH`; Monitor also off with `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` |
| PowerShell tool vanished after a deny rule | A Bash deny, even scoped, turns it off silently | `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` or add a PowerShell rule; since 2.1.287 a warning shows only when no shell tool is left |
| Interactive `claude` with piped stdin said "Raw mode is not supported" | Interactive mode needs a terminal | Use `claude -p` for piped input (fixed to exit with a message since 2.1.287) |
| A background PowerShell process outlives the session | The launcher keeps it alive | `CLAUDE_CODE_DISABLE_WINDOWS_SHELL_LAUNCHER=1` (2.1.269 or later) |
| A variable set in `$PROFILE` is missing in Desktop | Desktop does not load PowerShell profiles | Set it as a user environment variable |
| `where.exe` or `fc.exe` shows exit 1 | No match or differences, not an error | Read the output, not the code |

## Probe commands

Run these once per machine or after an update. Each takes its own shell.

PowerShell tool:

```powershell
where.exe powershell pwsh expect git bash          # what exists, and PATH order
$PSVersionTable.PSVersion                           # 5.1 expected
git config --show-origin --get-all core.autocrlf    # true at system level expected
git config --show-origin --get-all core.longpaths   # empty expected
reg query "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled
claude --version
Get-ChildItem "$env:APPDATA\Claude\claude-code" | Sort-Object Name   # Desktop bundles
& "$env:APPDATA\Claude\claude-code\<version>\claude.exe" --version
```

Bash tool (note the protection on slash arguments):

```bash
MSYS_NO_PATHCONV=1 reg query 'HKLM\SYSTEM\CurrentControlSet\Control\FileSystem' /v LongPathsEnabled
MSYS_NO_PATHCONV=1 where.exe pwsh expect
type sleep timeout                                   # Git's /usr/bin tools
```

Expected on the checked machine: Windows PowerShell 5.1, no `pwsh`, no `expect`, `LongPathsEnabled` = 0x1, `core.longpaths` unset, `core.autocrlf` true from `C:/Program Files/Git/etc/gitconfig`, `bash.exe` found in Git, `System32` and `WindowsApps`.

A Desktop `/status` in a local Code-tab session shows the version that session runs. A WSL session reports its own.

## Version floors

Windows-relevant changes by Claude Code version (from the changelog). Desktop's bundled version may be older than the CLI: compare before telling the person a fix applies.

| Version | Change |
| --- | --- |
| 2.1.214 | PowerShell tool on 5.1: `>` and `>>` write UTF-8, piped input to native commands is UTF-8, exit 1 from `where.exe`, `fc.exe`, `diff.exe` with output is a valid negative |
| 2.1.269 | `CLAUDE_CODE_DISABLE_WINDOWS_SHELL_LAUNCHER=1` stops backgrounded PowerShell surviving session exit |
| 2.1.285 | Background command limits (30 minutes default, 2 hours ceiling, unattended sessions only) raised by `BASH_DEFAULT_TIMEOUT_MS` and the ceiling; project and local `env` can no longer set `ALLUSERSPROFILE`, `SystemDrive`, `CommonProgramFiles`; `/ultrareview` of a worktree rooted at home fixed |
| 2.1.286 | `--bg` and agents-view trust case fixed |
| 2.1.287 | Bash subshell removed; warning when a whole-Bash deny leaves no shell tool; interactive `claude` with piped stdin explains and exits instead of hanging |
| 2.1.290 | Multi-line `!` blocks in CRLF skill and command files fixed; `/ultrareview` fixed with `core.safecrlf=true` |
| 2.1.292 | `rm -rf` on 8.3 short names fixed |

When the Desktop bundle is below a floor, the fix is missing there even if the CLI has it. To get it, update Desktop; do not copy a CLI binary into the bundle.

## Settings and variables that steer shells

- `CLAUDE_CODE_GIT_BASH_PATH`: path to `bash.exe`. Set under `env` in `settings.json`. If the path does not exist or is not named `bash.exe` or `sh.exe`, Claude Code auto-detects and logs a warning with `--debug`.
- `CLAUDE_CODE_USE_POWERSHELL_TOOL`: `1` enables the PowerShell tool on Bedrock, Vertex and Foundry, `0` turns it off. On claude.ai and Console accounts with Git for Windows it is on. Whether the Desktop Code tab on the person's plan follows the same default is **unverified** (this session shows PowerShell primary with Bash alongside, which fits).
- `CLAUDE_CODE_POWERSHELL_RESPECT_EXECUTION_POLICY=1`: turns off the process-scope `-ExecutionPolicy Bypass` (Group Policy still wins). Profiles are not loaded. The PowerShell tool is not sandboxed.
- `defaultShell` in `settings.json` set to `powershell` sends interactive `!` commands through PowerShell. A skill's frontmatter `shell: powershell` does the same for its `!` blocks. Both need the PowerShell tool enabled. Command hooks take `"shell": "powershell"` and spawn it directly.
- `BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`: shared by Bash and PowerShell.
- `CLAUDE_CONFIG_DIR`: real environment variable only.
- Sandboxing is unsupported on native Windows and WSL1: commands run unsandboxed, and `failIfUnavailable` makes Claude Code exit at startup there.

## Path facts

- Windows limits a path to 260 characters (`MAX_PATH`). Lifting it takes both the `LongPathsEnabled` registry value and a program that declares itself long-path aware; the value is read once per process, so a reboot or restart may be needed. Relative paths stay limited. Whether the Claude Code binary opts in is not documented (**unverified**), and which of its file tools fail past 260 characters with the flag on is untested.
- `git` reads `core.longpaths` itself, independent of the registry. It applies on Windows only.
- Git Bash accepts `/c/Users/...` and `C:/Users/...`. Windows tools accept `C:\Users\...` and `C:/Users/...`.
- Short roots that work for checkouts and worktrees: `C:\w\<repo>`, `C:\s\<name>`. Avoid the Desktop scratch-workspaces folder for anything with deep trees.

## Not covered

- `claude mcp add-from-claude-desktop` is documented for macOS and WSL only, not native Windows.
- Whether `MSYS_NO_PATHCONV` appears in Git for Windows' own documentation is **unverified**; its effect was tested locally.
- Which PATH order Desktop gives the PowerShell tool, and so which `timeout` it finds, is **unverified**.
