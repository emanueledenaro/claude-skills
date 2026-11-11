# Local run tools

When the project's CI is off or cannot run the full checks, the coordinator needs a small set of scripts in a scratch folder outside the repo (for example `~/<project>-work/tools/`). They turn each step that went wrong by hand into one command that refuses the unsafe case. Write them for the project the first time a step repeats; keep a dated backup before each change. These are the contracts that held up over a week of overnight runs with three workers on one Mac.

| Tool | Does | Refuses or protects |
| --- | --- | --- |
| `new-worktree <ticket> <branch>` | Worktree from the full remote ref of the integration branch, an env file for the worker, installed dependencies, the shared git hooks pointed at a virtualenv no worktree owns. | A branch name that breaks the naming rules, an existing folder or branch, local branches named `origin/*`. Runs no check and touches no container. |
| `check '<command>'` | Runs one check under the machine's shared lock (`shared-machine-checks`), from the current folder. Under the disk floor it prunes builder cache and trims the VM inside the lock first. | Exits with distinct codes for a lock timeout and for disk still under the floor after the prune, so the worker reports instead of retrying. |
| `gate <pr> [--backend-only\|--prepare\|--stop]` | The coordinator's full checks on the PR head in its own worktree, compose project and ports derived from the PR number. Posts a commit status per green half on the head. `--prepare` installs a reviewer's worktree without checks. `--stop` kills only its own recorded process tree. | A head that does not contain the integration branch, checked again inside the lock after a fresh fetch. Alerts if the shared dev database container changes. |
| `realign <ticket> [--push]` | Merges the integration branch into the ticket branch with a valid merge subject and the ticket trailer. | Never rebases or force pushes; on a conflict it leaves the merge in progress and names the files. |
| `land <pr> --refs <n> [--closes <n>]... [--notes <file>] [--dry-run]` | Squash merge pinned to the gated head, then stops the gate, closes every `--closes` ticket with a comment naming the PR, repairs the hooks, removes the worktree and deletes the branch. | A head behind the integration branch, a head with no green gate status, a closed PR. |
| `status [--write]` | One table of what is in flight, read from the tracker and the machine (heads, gate statuses, worktrees, lock holder, free disk); `--write` replaces the in-flight block of the run-state file. | Read-only: no checks, no containers, no lock. |
| `demo start [ref]\|stop\|status` | The app with demo data at a given commit, on its own ports and compose project, for the person to click through; prints READY with the URL and logins. | Never touches the shared dev database; random passwords, never printed. |

Rules around them:

- Every brief and the rules file name the tools by path; workers never improvise a lock, a kill or a merge.
- A tool's first line of output is the head and the ancestry it checked, so a log shows what was gated.
- Long runs start with `nohup <tool> > /tmp/<name>.out 2>&1 &` and a recorded PID; the coordinator waits on `kill -0 <pid>` in a background loop, never by polling the log.
