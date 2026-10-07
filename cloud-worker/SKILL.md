---
name: cloud-worker
description: "Launch, follow and collect Claude Code cloud workers (claude --cloud sessions) from this machine, Windows included, without expect: launch preconditions, a PowerShell launch script, finding the session later, steering it, collecting its PR, environments and cost. Use when starting, briefing, checking, messaging or collecting a cloud session or remote worker, when launch.exp cannot run, or when work should run in the cloud instead of locally, in any project."
---

How to start a cloud worker, find it again and bring its result back. `coordinator-method` holds the delegation rules (what goes to the cloud, the Worker brief, confirming the session URL, merging) and `model-mix` holds the model, the effort, the budget check and the parallel-session cap; this skill only adds the mechanics. Checked on Claude Code 2.1.292; facts from the docs and the binary, with unverified ones marked.

## 1. Before you launch

- Run the budget check in `model-mix`, in the main session. Cloud sessions cannot read usage.
- `claude auth status --text` must show a claude.ai login. An API key, Bedrock or Vertex cannot start a cloud session, and neither can `--restricted` or an organisation that disallows remote sessions.
- Work from the repo root: the repo is the cwd's git remote, there is no `--repo` flag. The Claude GitHub App must be on the repo, or `/web-setup` done once. Without either, the CLI uploads a git bundle instead (under 100 MB; committed history plus uncommitted tracked files, no untracked files). On native Windows the uncommitted files go up unfiltered, `.env` included.
- Push first. The VM clones the remote at the current branch, so unpushed commits do not exist for the worker. Commit or stash tracked changes.
- The default environment comes from `/remote-env` (saved in the person's user settings). If none is set, ask the person to pick it once; do not choose it for them. `--environment` takes only self-hosted `ccpool_` ids.
- Cloud sessions do not read `~/.claude/skills`, and the person's plugins are not installed there. The Worker brief and the rules reach the worker only through the prompt or the repo.
- The GitHub proxy in the VM serves a fixed set of pull-request GraphQL operations: Projects v2 is out of reach, branch deletes and tag pushes are refused. Tracker work stays with the coordinator.

## 2. Launch

A new cloud session from the CLI needs a real terminal. `-p` with a description does not create one: it only sends the prompt to an existing session. `expect` is not installed on this machine, so `launch.exp` runs only under WSL or Linux.

- **Script, in a terminal tab:** `powershell.exe -NoProfile -File "$HOME\.claude\skills\cloud-worker\launch.ps1" <task> <rules|none> <log> <model> <effort>`. Same arguments as `launch.exp`. It builds the prompt (`/model` and `/effort` lines, the task, the Worker brief from `coordinator-method`, the rules), refuses unpushed or dirty branches, escapes quotes for Windows PowerShell 5.1, caps the prompt, writes `<log>` and `<log>.prompt.txt`, and starts claude. Add `-DryRun` to build and check without launching.
- **Who types:** `open_terminal_tab` starts a shell and types nothing. If a run-in-terminal tool exists, use it. Otherwise give the person the one command to paste, then `read_terminal` with `wait_for_output_ms`. Close the tab afterwards with `stop_terminal_tab`.
- **Without a terminal:** the Desktop Code tab with Cloud chosen in the environment dropdown, or a pre-filled `claude.ai/code?prompt=...&repositories=owner/repo&environment=...` link followed by one click. Details in `reference.md`.
- **Desktop tool:** in a Desktop session, if a `start_session` tool is listed (ToolSearch "start_session"), it starts new cloud work with target `cloud` (per the `move_to_cloud` description). Build the prompt with `launch.ps1 ... -DryRun` and pass the contents of `<log>.prompt.txt`. Unverified: the tool was not loaded in the checked session, so read its schema first, and confirm the returned session link as for the script.
- **Move this session to the cloud:** only when the person asks for it (for example "keep going in the cloud, I'm closing my laptop"). `move_to_cloud` moves the session that calls it, which is the coordinator if you call it there. Commit first, because uncommitted changes are refused. It pushes the branch, posts a summary and archives the session here. A coordinator in the cloud cannot run the budget check in `model-mix`. Never use it to start or hand off a worker. Per its description, not tried here.
- Prompt too long: Windows caps a command line near 32,500 characters and the script stops at 28,000 after escaping. Commit the plan into the repo and make the task a short pointer to it.
- Put the exact branch name in the task. The brief requires Conventional Branch with no agent prefix, and the default cloud branch name is unconfirmed.
- Read the session URL (`claude.ai/code/session_...`) from the terminal, save it at once in the scratch state file and append `URL: <url>` to the log. Say work runs in the cloud only after seeing it. The create-time output format is unverified: the documented follow-up output prints `Session ID:` and `View:` lines.

## 3. First launch on a machine

Run one trivial task (say hi, change nothing) in a terminal tab before the first real worker, and record the answers in the project memory. Until then these are unverified:

- First-run dialogs. The `folder` one is the workspace trust dialog, where Down then Enter picks "Yes, I trust this folder", and trust is saved per folder. Other one-time dialogs can appear; read each by hand. List in `reference.md`.
- Model and effort. Ask the worker which it runs. The docs do not say `--model` and `--effort` reach a cloud session, so the leading `/model` and `/effort` lines (cloud sessions, 2.1.205+) carry the choice. Whether a slash line at the top of a multi-line prompt is run as a command is also unverified.
- Quoting: put a double-quoted word and a backslash path in the task and check the worker saw them intact.
- Whether `--ref main` on `--cloud` selects the branch. The binary's help says it does, the docs say only with `--environment`, so treat it as unverified.
- The URL format, whether the process exits by itself, and the branch name the worker pushes.

## 4. Follow

- `ListAgents` shows cloud sessions as kind `cloud` with title and state (idle, waiting on a human), but no id or URL. Match by title and use it for polling instead of status reads.
- `SendMessage` reaches a cloud session by its `ListAgents` name, one way: silence is not proof it was read.
- Steer by id: `claude -p "<msg>" --cloud <session_id|url> --output-format json` queues the message, exits, and returns `{ok, session_id, url}`. Without `-p` it fails. A missing or archived session returns an error: start a new one.
- `claude agents`, `attach`, `logs`, `--bg` and `stop` see local sessions only. Never use them for a cloud worker.
- Wait long once instead of reading often. When the VM idles out, reopening the session restores the conversation, not background jobs.

## 5. Collect

- The worker pushes a branch when it stops. The brief tells it to open the PR; otherwise create it from the session's diff view at `claude.ai/code`.
- Find the PR without relying on a branch prefix: `gh pr list --search "<issue number>" --state open`, or `gh pr list --head <branch>`.
- Review and merge by `merge-gate` and `coordinator-method`. A fix goes to the same session as a follow-up: the session stays live after the PR.
- To continue locally: `claude --teleport <session-id>` from a clean checkout of the same repo (not a fork), the pushed branch, the same account.

## 6. Environment and cost

- An environment has network access (None, Trusted by default, Custom), env vars, and a setup script. The script is Bash, runs once as root, is cached about 7 days only if it finishes in about 5 minutes, and blocks the session if it exits non-zero. Only the person changes them, in the UI; propose the change and wait for their ok. Never put secrets in env vars or the script: everyone using the environment sees them.
- The VM is Ubuntu 24.04 with common toolchains and `gh`. Bash defaults to 2 minutes, at most 10. Modes are Accept edits, Plan and Auto, no bypass.
- Cloud sessions draw from the same 5-hour and weekly limits as everything else. How they are metered is not published: read the weekly percent before and after each session and keep the run-cost line from `model-mix`.
- Parallel sessions: the profile column in `model-mix`, on disjoint areas.

## 7. Not evaluated

- Projects (one conversation that coordinates parallel cloud sessions and reports back) and `/autofix-pr` could replace the hand-made launch, poll and collect loop. Read the docs page for plan availability before building around either.
- Unknown: how a `ListAgents` row maps to a session URL, any cap on concurrent or daily sessions, cleanup of idle sessions.
- Non-interactive creation (`-p` with `--environment ccpool_...`) exists only for self-hosted environments, in beta on Team and Enterprise plans.

## Done when

- [ ] Budget checked and the parallel cap respected
- [ ] Branch pushed, tree clean, prompt = task + Worker brief + rules
- [ ] Session URL seen, saved to the scratch state file, shown to the person
- [ ] On the first launch per machine: model, effort, quoting and dialogs recorded
- [ ] PR found by issue number, then handed to the merge procedure
