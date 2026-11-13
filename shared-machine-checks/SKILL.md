---
name: shared-machine-checks
description: "Running heavy checks (test suites, e2e with containers, demos) from many agents on one developer machine without collisions: one shared lock, memory and disk preflight, a compose project and ports per run, cleanup traps, stopping processes by recorded PID, cheap checks before the queue, demos tied to a commit, a waiter for background jobs. Use when more than one agent or worktree runs tests, e2e or containers on the same machine, before starting a heavy check, when a service exits with code 137, when runs collide on ports or on the dev database, when a nohup job ends without a word, or when serving a demo to the person, in any project."
---

Rules for heavy checks that must run on the developer's own machine, with several agents at work. Where a cloud session or CI can run the check, it goes there first (`coordinator-method`). The project's scripts and AGENTS.md win over this skill. The merge procedure is `merge-gate`; models and width are `model-mix`; the Monitor tool and wakes are `overnight`.

## 1. One lock

- Every heavy check runs under one lock file shared by all agents and worktrees of the machine, so checks run one at a time. macOS: `lockf -t <seconds> <file> <command>`. Linux: `flock -w <seconds> <file> <command>`.
- A timeout means the machine is busy: report that and wait for a wake. Do not loop on retries.
- Reviewers and coordinators read diffs and logs without the lock. They take it only to run a check.
- The lock path goes in the project's rules file, so every worker uses the same one.

## 2. Memory preflight

- Before a check, read the container VM's memory (`docker info --format '{{.MemTotal}}'`) and compare it with what the services need, plus headroom. An identity server such as Keycloak needs about 1.2 GiB alone. A demo that is still running counts too.
- Count the heavy containers before starting a check (a 5.9 GiB VM holds three Keycloaks, the checks' own included; a fourth blocks every check). Keep at most one per running worker plus the demo, and stop the dev stack of a parked worktree (`docker compose -p <name> stop`, volumes kept) instead of letting checks queue. Why: on 2026-11-13 three workers waited 20+ minutes on memory and one gave up after 53.
- A check that stops on low memory is a memory block: free memory, then resume it (the time box does not count the wait, `coordinator-method`).
- Exit code 137 means the process was killed, here almost always for lack of memory. Name the service and the VM memory in the report. Do not retry blind.
- Restart or resize the VM only between checks and under the lock: it kills every other agent's containers.
- Why: in one run a VM that was too small passed for flaky tests and cost about six hours.

## 3. Isolation per run

- Each run gets its own compose project name and its own ports, both derived from one number (the PR or the worktree): `COMPOSE_PROJECT_NAME=app-$N`, `PORT=$((20000 + N * 10))`.
- A run never touches the developer's long-lived dev database or its ports. It creates its own database and removes it.

## 4. Cleanup

Install the trap before the first container starts:

```sh
cleanup() {
  REQUIRED_VAR=dummy docker compose -p "$NAME" down -v --remove-orphans
  docker rm -f $(docker ps -aq --filter "label=run=$NAME") 2>/dev/null
  docker rmi $(docker images -q "$NAME-*") 2>/dev/null
}
trap cleanup EXIT INT TERM
```

- `down` fails when a required environment variable is unset, so pass dummy values for each.
- Containers started outside the compose project (by test code) carry a `run=$NAME` label so the trap finds them.
- A killed run (SIGKILL) cannot trap. At the next start, sweep its orphans: only processes from this checkout's own venv or `node_modules`, found by a recorded PID file or by the checkout's absolute path. Never a broad pattern such as `node` or `python`.

## 5. Stopping processes

- Stop a process only by the PID you recorded or by the tool's own stop command (`docker compose down`). Record the PID when you start it.
- Never `pkill -f` or `killall`: a pattern also kills other agents' checks. Propose adding `Bash(pkill *)` and `Bash(killall *)` to the permissions deny list; the person changes settings.

## 6. Disk floor

- Keep a floor of free disk, for example 15 GB, on the host and in the container VM (`df -g /`, `docker system df`). Check it under the lock before a run.
- Below the floor: `docker builder prune -f` for the builder cache, then trim the VM disk with the runtime's own tool, under the lock.
- Never `docker system prune -a --volumes`: it removes the developer's dev database volume.

## 7. Cheap checks before the queue

Before taking the lock run what takes seconds: the commit header lint (`git-conventions`), conflict markers (`git grep -nE '^(<<<<<<<|>>>>>>>) '`), formatting, a fast type check. A 20-minute queue should not end on a typo.

## 8. A demo for the person

- A demo states which commit it serves: `status` prints the sha and the subject. It switches to another ref only when asked.
- Why: the person's click test is worth something only on the commit that will land. Serve the PR head that `merge-gate` will merge, after realigning with main.
- The demo has its own project name and ports (section 3).

## 9. Background jobs

A job started with `nohup` tells nobody when it ends. Make the job's last log line `exit=<code>`, then start a separate waiter as its own background task, so its end wakes the agent:

```sh
nohup ./check.sh > "$LOG" 2>&1 & echo $! > "$PIDFILE"
while kill -0 "$(cat "$PIDFILE")" 2>/dev/null; do sleep 15; done; tail -n 40 "$LOG"
```

## Done when

- Every heavy check ran under the shared lock, after the memory and disk preflight.
- Each run used its own project name and ports, and left no containers, images or processes behind.
- Every process stop used a recorded PID or the tool's own command.
- A 137 is named in the report with the service and the VM memory.
- A demo names its commit.
