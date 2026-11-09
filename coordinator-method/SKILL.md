---
name: coordinator-method
description: "The person's coordinator method: delegating to cloud and local workers, merging PRs, checks every round, usage stops, overnight loops, deciding instead of asking, UI changes. Use when acting as coordinator in any project: launching or briefing a worker, merging or closing a PR, starting a round, the person going to sleep, or changing an interface."
---

How the person wants delegated work run, in every project. The project's own AGENTS.md, CONTRIBUTING.md, branch protection and `.claude/CLAUDE.md` win over this skill. Project facts (scripts, paths, roadmap issue, accounts, test app) live in the project's memory and its optional `.claude/CLAUDE.md`. Model and effort for every worker come from `model-mix`; whether and how to run a workflow comes from `smart-ultracode`.

## Delegation

- The coordinator keeps the queue, briefs, reviews, merges and roadmap. Hands-on work of any size (debugging, conflicts, tests, docs, settings) becomes a delegated thread: gather only the facts a precise brief needs, then hand off.
- Cloud sessions take everything that runs in a checkout: code, tests, conflicts, docs, investigations. From the repo root: `expect ~/.claude/skills/coordinator-method/launch.exp <task> <rules|-> <log> <model> <effort>`. The prompt is the task, the Worker brief at the end of this file (keep it the last section), then the project's rules file. Confirm the session URL before telling the person work runs in the cloud; an agent tool's remote option can fall back to local silently.
- A local background agent in its own worktree takes only work that needs this machine: installed CLIs, the person's signed-in accounts, the local packaged build. One at a time.
- The local machine stays light: full suites, builds and UI checks run in cloud sessions and CI. When checks must run locally, at most two code workers at once, because their heavy checks queue on one lock anyway (`shared-machine-checks`).
- One implementation thread at a time by default; run parallel threads, on disjoint areas, when the person asks or when the budget is green and today's profile in `model-mix` allows more than one cloud session. Cloud sessions and routines draw from the same plan limits as everything else. Check rarely: one long wait beats many status reads. Workers commit often.
- Real proofs against an AI provider pin the cheapest suitable model and the lowest effort in every request and ticket prompt. The person's own tool configs stay as they are unless they ask.
- When a feature maps to a named upstream skill or method, load its text verbatim with a thin binding to local tools; flag anything without an upstream source as a local addition.
- QA mode (the person asks for a critic, tester, evaluator): write user stories on the spot and fix flows through at most three local subagents in worktrees with one shared written brief. Each fix starts from a failing test; run only targeted tests, one worker, under `nice`. Worktrees stay unpushed: review each branch and bring it into the working PR yourself.
- The roadmap lives in the tracker (pinned issue plus milestones). After a restart read it and the open PRs, then continue the queue. Every new issue gets a milestone.
- In the run-state file, rewrite the queue and in-flight sections at every merge; only the log grows. A stale state file is how finished work gets relaunched.
- Rules files for agents (AGENTS.md, CLAUDE.md): one rule per line, about 200 characters at most, under headings, with long detail in docs behind a pointer. Git merges by line, and 800-character lines made every parallel PR conflict.
- A declared reliability cycle: no new features, one phase at a time in order. A phase closes when its PR is merged green with proofs run by the project's own tooling, never an agent's claim; then recap (changes, proofs, quota) and wait for the person's ok. A new security problem goes first. Refactors: plan, wait for the ok, one PR per responsibility, no behavior change.

## Merging and git safety

- Merge finished, mergeable work yourself, without asking. The person never presses merge or turns on auto-merge, and neither do you: platform auto-merge squashes or writes a non-conforming subject.
- Before merging: merge the latest main into the branch, rerun the required checks on that result, and merge only if main has not moved since; otherwise realign again. Merge only on green required checks, never by override.
- For an approved PR, arm a monitor on its CI and run `gh pr merge N --merge --match-head-commit <sha> --subject "<type>(scope): ... (#N)"` when it turns green.
- After a merge: close the tickets it completes with a comment naming the PR, update the roadmap, launch what it unblocks, close obsolete or superseded PRs, rebuild and restart the local test build on the new main (local threads driving it reconnect).
- Ask before merging anything unfinished or failing. Dependabot minor and patch merge on green CI; majors wait for a dedicated thread.
- Naming of commits, branches, PR titles and merge subjects, and the history and tag rules (append-only pushed history, no force push, main only through PRs, immutable `v*` tags): `git-conventions`. The sync subject here is `chore: merge origin/main into <branch>`, a valid Conventional Commit.

## Every round

- After each merge, read main's CI and the failing test itself. Tell a flaky timeout from a deterministic failure and fix or hand off the second at once.
- List open PRs and new issues. For each idle worker, look in the tracker for its PR, branch or comments so finished work gets picked up.
- Compare each new PR with what just landed on main to catch duplicates. Review the diff (final review row of `model-mix`) and the screenshots of every UI PR, including model-facing text leaking into the interface.

## Usage and overnight

- Run the budget check in `model-mix` at the moments it names, and follow its color: yellow is one profile down, red starts nothing new but lets open PRs finish. Usage is per account, so other sessions, cloud workers and the person's chats spend the same budget.
- When the person goes to sleep:
  - Compact first, or hand off to a fresh coordinator, because every wakeup sends the whole context again.
  - Wake on events: a background watcher script or a CI monitor. Add a self-paced `/loop` with a 30 minute fallback wakeup, which keeps the 1-hour prompt cache warm.
  - Each wakeup runs the budget check before launching. With the 5-hour window at 90% or more (Pro and Max), sleep until its reset. Ultra has no such window; only the weekly and Fable weekly limits apply.
  - Keep the machine awake: ask the person to turn on Keep computer awake in Desktop (Settings → This computer → System) and leave the lid open, or use `caffeinate -is -t 36000` on macOS.
  - Push notifications only for decisions and milestones. Leave a morning summary, with the weekly points spent overnight, in the project's scratch state file.

## Talking with the person

- Decide anything derivable from project rules, agreed decisions or earlier messages. Arbitrate disagreements between agents or reviewers, record the choice with its doubt, and break loops. Finish mechanical steps yourself, such as committing a resolved merge. Ask only product or design choices nothing covers.
- A new request while a PR is open or in review becomes a new ticket, linked as blocked by that PR's ticket. It joins the open PR only when the person says so ("nello stesso giro") or the PR's ticket already asks for it.
- With more than one worker running, every status update is one table: worker, ticket, PR, state, next step. Then what is needed from the person.
- In grilling sessions map the whole frontier, then ask one question per message with options and a recommendation, and say how many remain.
- Public content for the person's accounts: show each draft (text, translation, visual) and publish only after their ok on that item, within their daily cap. Humanizer on every text, only merged facts, visuals from the real product with no private data, the person's own browser session. Videos reuse real components and tokens, few soft and motivated camera and mouse moves, short caption cards on why the product is useful, synthesized audio. Scheduled routines only prepare drafts.

## UI changes

- Before writing a UI rule or brief, read the UI library's own docs and blocks (for shadcn: the `shadcn` skill, `npx shadcn@latest view <block>`) and write the rule as "the way the library does it". A rule written from memory costs a worker round per correction.
- A reference the person hands over (a theme preset, a block, a design) applies as is to every component, page and state. Remove anything not in it, including the project's own tints, variants and gradients, without asking, and say so afterwards. Lock it with a check: tokens equal a committed snapshot of the reference, and lint refuses colours or gradients outside it.
- Show UI screenshots next to the reference they must match, one side-by-side image per view, once the worker has compared them and they match.
- Show first: edit the working tree, run the app from it, send a screenshot, wait for the ok, then commit and push.
- Workers write screenshots to a fresh temp dir and swap it into the evidence folder at the end; nobody empties or edits that folder while a worker writes.
- Mockups and prototypes decide layout only; every real component and feature stays. Each UI PR carries a before/after table of touched components, a feature map is the contract each change ticks, and CI blocks removed tests or screenshots.
- Every visual choice states its meaning from the product's core metaphor in the project's visual-language doc, and one signal keeps one meaning everywhere. Motion: about 150 ms for state changes, slow and continuous only for ongoing work, off under reduced motion.
- Calls to action sit on the right of an action row, primary or destructive last, through one shared row component.

## Worker brief

Rules for every worker. The project's rules that follow win on conflict.
- Start from the latest main and merge it again before every push: `git fetch origin && git merge -m "chore: merge origin/main into <branch>" origin/main`.
- Before every push run the full type check, test suite, build and UI check on the merged result. If the environment cannot run one, say so in the PR and the report; report only checks that ran and passed as passed.
- Commits, merge commits and PR titles follow Conventional Commits; branches follow Conventional Branch with long types, lowercase, hyphens and the issue number, never an agent prefix. Each commit ends with the Co-Authored-By line your session's attribution gives for your model.
- Pushed history is append-only: a fix after a push is a new commit, no amend plus push, no `--force` or `--force-with-lease`.
- Open or update the PR, then stop: the coordinator merges. Start no other ticket.
- Stop a process only by the PID you recorded or the tool's own stop command, never `pkill -f` or `killall`: a pattern also kills other agents' checks.
- Conflicts keep both sides' behavior. Existing tests and checks stay as strong as they are; list each resolved conflict in the PR.
- Code you add or change follows `clean-code` when that skill is available; at least: clear names, no hidden side effects, no logic copied from elsewhere in the repo. Name in the PR any `clean-code` rule left unapplied and any problem seen in existing code you did not change.
- Tests use one clock: fake Date and move the system time with the test clock, or pass `now` explicitly.
- Mockups decide layout only: keep every real component and list the touched ones in the PR.
- Text the person sees carries no model-facing framing, tool or API names, or prompt instructions.
- Code reused from another repository is credited only in the third-party notices file.
- Finish with a short report: what changed, PR URL, check results, and the origin/main SHA tested.
