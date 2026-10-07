---
name: overnight
description: "Setting up, waking, pacing and reporting an unattended run while the person sleeps or is away for hours, in Desktop or the CLI: which runner survives the night, the pre-sleep checks, event wakes plus a 30 minute fallback loop, what each wake does, what usage limits do to a night, keeping the machine awake, notifications, the morning summary. Use when the person says they are going to sleep or leaving (\"vado a dormire\", \"buonanotte\", \"goodnight\", \"keep going tonight\", \"lascia girare\"), asks for a loop, wake, watcher or unattended run, or when a coordinator session will sit idle for hours, in any project."
---

Decide how a run without the person is set up, woken, paced and reported. Nothing the coordinator may not do by day becomes allowed at night: merge, git and brief rules live in `coordinator-method`, the merge procedure in `merge-gate`, models, width and budget colors in `model-mix`, cache and compaction numbers in `context-hygiene`, cloud launches in `cloud-worker`, workflow shapes in `smart-ultracode`. Facts come from the Claude Code docs and local checks; what is not confirmed is marked unverified. Templates and commands are in `reference.md`.

## 1. Pick the runner

- Work that needs no local files, accounts or build, and may run while the machine sleeps: a cloud session or routine. Only cloud runs with the machine off or asleep. A routine runs at most once an hour, draws plan usage, asks no permissions and pushes `claude/` branches by default (the prompt can name another branch; branch protection limits it). Ask the person before creating any routine or scheduled task, and use the `schedule` skill. Launch details are in `cloud-worker`.
- Coordination that reads local state (`gh`, the state file, the local build): a local session, which needs the machine on. `/loop` and Desktop scheduled tasks do not run with the machine off.
- Runtime: prefer the terminal CLI at 2.1.292 or later for a `/loop` night. 2.1.292 fixed a background session's `/loop` stopping when its process restarted and `claude -p` dropping a scheduled wakeup; 2.1.290 keeps background sessions waiting on a wakeup alive through updates and low memory. Desktop bundles its own Claude Code, which can lag the CLI (2.1.284 on the Windows machine, 2.1.293 on the Mac on 2026-10-07): if the bundle is older than 2.1.292 and Desktop runs the night, tell the person this once and keep the fallback loop short. Read the versions with `claude --version` in a terminal and, for Desktop, the newest version folder: `%APPDATA%\Claude\claude-code\<ver>\` on Windows (probe in `windows-ops`), `~/Library/Application Support/Claude/claude-code/<ver>/` on macOS; layout undocumented.
- `/bg` (or `/background`) carries a session's `/loop` tasks to a background session. `claude --bg` starts a new session and carries nothing over. Background sessions survive a closed terminal and sleep; a shutdown or reboot stops them; they never offer the usage-limit wait.

## 2. Before sleeping

1. **Budget.** Run the budget check in `model-mix`. Say the color and the reserve. If no valid reading can be had while unattended, the color is red until the next wake.
2. **Cache.** Run `/usage` in the session that will loop and read the `Prompt cache (main)` line. If it shows 5 minutes on a subscription, ask the person to set `promptCacheTtl` to `1h` (v2.1.242+), or wake less often. **Why:** docs say 1 hour for the main conversation on a subscription, but one third-party bug report claims 5 minutes on 2.1.218+ and its fix claim is not in the changelog: unverified, so measure. `claude -p "hello" --output-format json` shows the bucket for the terminal CLI only, not for a Desktop session.
3. **Compact or hand off.** Every wake resends the whole context. Run `/compact` with a focus while the cache is warm, or hand off to a fresh coordinator (`coordinator-method`). Pin model and effort: switching model or turning on fast mode invalidates the cache.
4. **Stalls.** A permission prompt stalls the night. Ask the person to set allow rules or a mode that approves, and never change permission settings yourself. Desktop scheduled-task runs also stall on MCP tools marked as needing user interaction: leave them out.
5. **Limits.** Name the surface and read `autoContinueAtUsageLimit` (section 5). Never promise that the run resumes after a limit.
6. **Machine and phone.** Ask the person for the settings in sections 6 and 7 (Keep computer awake, lid, Remote Control, `agentPushNotifEnabled`); change none yourself.
7. **State file.** Write the scratch state file (template in `reference.md`) with queue, in-flight items, rules for the night and the person's wake-up time.
8. **Agree the night.** What may start, what is parked, when to stop. Anything the project rules, agreed decisions or earlier messages do not decide is parked, not guessed.

## 3. Wake design

- **Events first.** `Monitor` runs a background watcher script (CI state, PR checks, log lines) and feeds each output line back, with no polling. A watch lasts 5 minutes by default and at most 30 (10 with `-p`); at the deadline Claude gets one notice and restarts it. Monitors are never restored on resume. On Windows `Monitor` needs Git Bash, and it is off with `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Task notifications from workers wake the session too.
- **Fallback loop.** Start `/loop` with no interval: it is self-paced, Claude picks a delay from 1 minute to 1 hour with `ScheduleWakeup`. Ask for 30 minutes (any value from 30 to 55 stays under the 1-hour cache) unless an event is pending. Never use 60 to 270 second keep-alive beats on a subscription: they spend usage for nothing.
- End every wake by scheduling the next one or by stopping the loop (`ScheduleWakeup` with `stop: true`, v2.1.202+). An iteration that does neither gets one fallback wake about 20 minutes later and then the loop ends. `Esc` clears a pending wake.
- A restart loses self-paced loops and monitors, and recurring scheduled tasks expire after 7 days: the state file is what re-arms them.
- Unverified: that a self-paced wake counts as the main conversation for the 1-hour cache. Check `/usage` after the first wake.
- Desktop's CI status bar can auto-fix CI and auto-merge. Auto-merge stays off (`coordinator-method`). Auto-fix CI is the person's choice: ask before turning it on.

## 4. What each wake does

1. Read the state file, then the notifications that arrived.
2. Budget check (`model-mix`) before anything that starts work. Use the plain read, not a model.
3. Act on events only: a green PR goes through `merge-gate`, a red check goes to its worker as a fix message, a finished worker is collected. A UI PR waits for the person's screenshot ok, so it is parked.
4. Launch only what the queue, the color and today's profile allow. Heavy work goes to cloud sessions; the local machine stays light.
5. Update the state file: what happened, readings, next wake.
6. Sleep: schedule the next wake or stop. Three wakes in a row with nothing in flight and nothing to do end the loop and write the summary.

## 5. Usage limits overnight

- 5-hour window at 90% or more: launch nothing until its `resetsAt`: keep the normal fallback wakes (at most 1 hour each) and make the last one land just after the reset (`model-mix`). Work already running continues.
- Weekly red: start nothing new, finish open PRs, and stop at the first wake that finds nothing to finish.
- `autoContinueAtUsageLimit` is on by default in interactive claude.ai sessions (v2.1.234+): Claude waits in the open session and continues after the reset. It re-arms at most twice. After a sleep longer than about 30 minutes it asks for Enter and does not resume alone.
- It never starts when the reset is over 24 hours away (a weekly limit), in Remote Control and teammate sessions, on `-p`, `/bg` and `--bg` runs, or on a model-family limit while running another family. Handing the session to Desktop, background or cloud ends the wait. `/rate-limit-options` starts or cancels it by hand.
- Unverified: that the wait applies in the Desktop Code tab; docs say interactive sessions and do not name Desktop. Treat a weekly limit as the end of the night. Keep the fallback loop as a second chance after the reset, best effort: whether a wake fires at a limit is unverified.

## 6. Keeping it awake and reachable

- The person turns it on: Desktop, Settings, This computer, System, Keep computer awake. Closing the lid still sleeps the machine, and the setting does not change that. Ask them to leave the lid open, or to set the lid action to Do nothing in Windows Power Options. Whether the Windows build has the setting is unverified.
- A local scheduled task that was skipped during sleep catches up with one run for the latest missed time, within 7 days.
- Phone check: `/remote-control` (Desktop) or `claude --remote-control` (terminal) before sleeping. It reconnects after sleep. Interactive sessions disconnect after about 30 minutes of failed heartbeats and need `/remote-control` again; the process must keep running. Remote Control sessions never auto-continue after a limit, so choose between the phone link and the wait.

## 7. Notifications

- Push only for a decision the person must make or a milestone (a merge, a color change, a stalled night). Never for status.
- `PushNotification` sends a desktop notification and, with Remote Control connected, a phone push. It needs `agentPushNotifEnabled` (`/config`, Push when Claude decides). Without a connected phone it warns that none is registered. Whether the call asks permission in auto mode is unverified.
- Desktop also notifies when a session finishes while the person is not looking at it.

## 8. Morning

- Write the summary into the state file in the format of `reference.md`: done, merged PRs, open items that need the person, weekly points spent (reading before and after), what was not done and why.
- Stop the loop (`ScheduleWakeup` with `stop: true`), end watchers, and send one push that the summary is ready only if a decision is waiting.

## Done when

- The pre-sleep list ran and the person heard the color, the surface and the limit behavior.
- The state file holds queue, rules, wake-up time and the next wake.
- Every wake ended by rescheduling or stopping, and no merge, force push or setting change happened that the day rules forbid.
- The summary is in the state file, the loop is stopped, and each parked item names what it waits for.
