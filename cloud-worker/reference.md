# cloud-worker reference

Catalogues for `SKILL.md`. Checked on Claude Code 2.1.292. Items marked binary come from a read-only strings search of the CLI binary: undocumented, medium confidence, may change. Items marked unverified were not run.

## launch.ps1

Verified here without starting a cloud session, by replacing claude with a test program that records its arguments (`-Exe` and `-ExeArgs` exist for that):

- The whole prompt arrives as one argument, byte for byte: double quotes, backslash paths, accents and newlines. Windows PowerShell 5.1 drops embedded double quotes from native arguments, so the script escapes them (`"` becomes `\"`, backslashes before a quote are doubled). PowerShell 7.3 and later pass arguments correctly on their own, so the script skips the escaping there (unverified: no `pwsh` on this machine).
- Windows refused an argument of about 32,700 characters and accepted 32,500. The script stops at 28,000 after escaping, which leaves room for the executable path and flags.
- Exit codes: 2 usage or missing file, 3 branch not pushed or tracked changes (`-Force` overrides), 4 prompt too long, 5 no terminal.
- A lone `-` cannot be bound as an argument by PowerShell: pass `none` for no rules file.
- Not verified: the final `claude --cloud` call itself, because starting a session spends plan limits. The first launch per machine (section 3 of `SKILL.md`) is that test.
- Unlike `launch.exp`, it never runs `git checkout` or `git pull`. It refuses instead, so the person's working tree is never changed.
- Optional `-Ref <ref>` passes `--ref <ref>` (binary help: branch, tag or SHA to check out in the remote session, defaults to the local current branch, needs `--cloud`). Unverified.

## First-run dialogs

Read each by hand the first time. From the 2.1.292 binary (binary):

| Dialog | Text to look for | Answer |
| --- | --- | --- |
| Workspace trust | "Quick safety check: Is this a project you created or one you trust?" | "Yes, I trust this folder" (list order: "No, exit" first, so Down then Enter). Saved per folder, never for the home directory |
| Machine MCP servers | "Let cloud sessions use this machine's MCP servers?" | the person decides |
| Settings forwarding | "Yes, send my settings" or "No, keep them on this machine", its text says "in this folder" | the person decides. `launch.exp` matches `folder` and presses Down, which could pick No here |
| Device registration | "Not now" starts the session in the cloud only | Not now, unless the person wants registration |

The hidden flag `--forward-home-settings <true|false>` skips the settings question (binary). Another hidden flag, `--on-branch <branch>`, works directly on that branch in the remote session and cannot be combined with `--ref` (binary, unverified). Neither appears in `claude --help`.

## Commands

```
claude auth status --text                       # login type
claude --cloud "<description>"                  # new session, needs a TTY
claude -p "<msg>" --cloud <session_id|url> --output-format json   # follow-up, returns {ok, session_id, url}
claude --teleport <session-id>                  # bring a session into a local clean checkout of the same repo
claude agents --json                            # LOCAL sessions only
gh pr list --search "<issue number>" --state open
gh pr list --head <branch>
git ls-remote --heads origin
```

In a session: `/remote-env` sets the default environment, `/web-setup` sends the local `gh` login to the account, `/tasks` lists cloud sessions (teleport with `t`), `/model sonnet` and `/effort high` work inside a cloud session from 2.1.205.

## Pre-filled link

`https://claude.ai/code?prompt=<url-encoded>&repositories=owner/repo&environment=<name or id>` fills prompt, repo and environment and does not submit. One click starts it. Never put sensitive data in the query string. Length limits of the link are unverified.

## Errors

| Message or symptom | Meaning and fix |
| --- | --- |
| "Cloud sessions need a claude.ai sign-in" | API key or third-party provider: `claude auth login` with the claude.ai account |
| "Without an interactive terminal, --cloud can only send the prompt to an existing cloud session" (binary) | no TTY: use a terminal tab |
| "Attaching to an existing cloud session is not enabled for your account." | follow-up without `-p` |
| Session not found or archived | start a new session |
| Worker cannot see recent commits | the branch was not pushed |
| 403 "This GraphQL query is not enabled for this session" | the VM's GitHub proxy: do that call from the coordinator |
| Session will not start after an environment change | the setup script exited non-zero |

## Calibration record

Copy into the project memory after the first launch on a machine:

```
cloud calibration: <date> CLI <version> · dialogs: <list> · url: <format> · exits by itself: <y/n> · model/effort seen: <...> · quoting intact: <y/n> · --ref: <works/not> · branch pattern: <...>
```

## Sources

- Claude Code docs: claude-code-on-the-web, cloud-environments, web-quickstart, desktop, cli-reference, claude-projects (not read).
- Local: `claude --help`, `claude --version`, `claude auth status --text`, the 2.1.292 binary strings, the tool descriptions of `ListAgents`, `SendMessage`, `open_terminal_tab` and `move_to_cloud`.
