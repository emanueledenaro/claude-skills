---
name: project-setup
description: "One-time setup of a repository for Claude Code and these skills: inspect what exists, propose the project's committed .claude/settings.json (schema, allow rules for its check commands, deny rules for pkill -f, killall, force push and secret files), a CLAUDE.md that imports AGENTS.md, the four project facts in AGENTS.md, then optionally Matt Pocock's skills, shipped as a chore PR. Differs from matt-bridge (how his skills run), from setup-matt-pocock-skills (tracker and labels only, typed by the person) and from the Vercel bootstrap skill (linked resources and env pulls). Use when setting up or auditing a repository for Claude Code, 'configura il progetto', 'setup del progetto', 'prepara il repo per Claude', in any project."
---

# Project setup

Sets one repository up for Claude Code and the skills in this repo, then checks it again on later runs. It writes project facts into the project and never into a skill. The project's own AGENTS.md, CONTRIBUTING.md and branch protection win over everything here.

Doc facts, templates and inspect commands are in `reference.md` (read it before step 2). Settings, memory and permission syntax change between Claude Code releases, so the date checked is in that file; read the live page when it is old.

## 1. Inspect, change nothing

Run the inspect commands in `reference.md` from the repo root. Report one short table of what exists and what is missing:

- git: clean or dirty, default branch, remote, branch protection if `gh` can read it.
- `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`.
- `.claude/`: settings.json, settings.local.json, skills, agents, commands, hooks (hooks live inside settings.json).
- `.mcp.json` and `.gitignore`.
- Stack: package manager, check, test, lint and build commands, docker compose files, CI config.

Stop if the working tree is dirty with changes that are not the person's setup work. Ask what to do.

## 2. Claude Code project config

Propose each file, show the exact diff, write after the person's ok. Permission rules are the person's call.

- `.claude/settings.json`, committed, strict JSON, with `$schema`. Allow rules only for the project's own check commands found in step 1. Deny rules for `pkill -f`, `killall`, force push and reading secret files (`.env`, `.env.*`, key and credential files that the project has). Template in `reference.md`.
- Never widen an existing deny and never remove an existing rule. If a rule looks wrong, say so and leave it.
- A Bash deny rule matches the command text, so it stops the plain command and not every variant. Say this once when you show the diff. A PreToolUse hook is the stronger guard; offer it, do not add it unasked.
- `.gitignore`: add `.claude/settings.local.json` and `CLAUDE.local.md` if missing.
- `CLAUDE.md`: if the project has `AGENTS.md` and no `CLAUDE.md`, create a `CLAUDE.md` whose first line is `@AGENTS.md`, with Claude-only lines below. If both exist, check the import is there. If only `CLAUDE.md` exists, keep it. Never copy text between the two.
- `.claude/skills/<name>/SKILL.md` is where project skills go. Create the folder only when there is a skill to put in it.
- `.mcp.json`: report it. Do not add servers.

## 3. These skills

- AGENTS.md gets the "Checks and queue" block from the README ("In a new project"). Fill the check command from step 1, the lock file from `shared-machine-checks` if the project runs heavy checks, hot files from `git log` (the files most PRs touch), and label strings from `docs/agents/triage-labels.md` or `gh label list`. Ask one question at a time, with a recommendation, for what is still blank.
- Global `~/.claude/CLAUDE.md` (the user home, see `windows-ops` for the Windows path): check it has the routing block and the `Claude plan:` line from the README. If one is missing, show the lines to add and write only after the person's ok. Model-mix needs the plan line.
- Point, do not repeat: `git-conventions` (offer its commit-msg hook only when the project has no CI of its own), `roadmap-tracker` (milestone, labels, pinned roadmap issue), `shared-machine-checks` (the lock file) and `model-mix`.

## 4. Matt Pocock's skills

Ask once: "Use Matt Pocock's skills in this project?" Recommend yes for a repo that builds features from issues, no for a repo that is a script or a single-owner experiment.

- No: skip this step and record the answer in your report.
- Yes, plugin missing: install with the two commands in `matt-bridge` §1 (marketplace `mattpocock`, plugin `mattpocock-skills`), then run `claude plugin details mattpocock-skills` and confirm the skills named in `matt-bridge/flow.md` are listed.
- Yes, plugin present: compare `claude plugin list` (version) and `claude plugin details mattpocock-skills` (skills) with that file, report missing or renamed skills, and if the plugin is behind, show `claude plugin update mattpocock-skills@mattpocock` and run it after the ok.
- Then tell the person to type `/setup-matt-pocock-skills`. It is theirs to start. Its files land by PR, under `matt-bridge` §2 and `roadmap-tracker` §5 for the labels.

## 5. Ship it

Branch `chore/<n>-claude-setup` from the default branch (`<n>` is the issue number; without an issue use `chore/claude-setup`). One commit per topic, written by `git-conventions`. Open a PR. Never push to the default branch.

## 6. Run it again

On a project that is already set up, change nothing on the first pass. Report drift only: a missing `$schema`, an allow rule for a command that no longer exists, a deny rule that was removed from the template, a missing ignore line, an AGENTS.md block with a blank fact, Matt's plugin behind. Propose each fix as in step 2.

## Done when

- `.claude/settings.json` is valid JSON with `$schema`, and `claude doctor` run in the repo reports no settings error.
- `claude` starts in the repo with no Settings Error dialog; `/status` lists the project file under `Setting sources`.
- AGENTS.md has the four facts, none left as `<...>`.
- Matt's skills are listed by `claude plugin details mattpocock-skills`, if the person chose them.
- The PR is open and the default branch is untouched.
