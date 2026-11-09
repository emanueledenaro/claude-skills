---
name: project-setup
description: "One-time setup of a repository for Claude Code and these skills: inspect what exists, propose the committed .claude/settings.json (schema, allow rules for its checks, deny rules for pkill, killall, force push, secret files), a CLAUDE.md that imports AGENTS.md, the four project facts in AGENTS.md, then optionally Matt Pocock's skills, shipped as a chore PR. Differs from matt-bridge (how his skills run), setup-matt-pocock-skills (tracker, labels), the Vercel bootstrap skill (env pulls), /init (a starting CLAUDE.md) and claude-automation-recommender (suggests, writes nothing). Use when setting up or auditing a repository for Claude Code, 'configura il progetto', 'setup del progetto', 'prepara il repo per Claude', in any project."
---

# Project setup

Sets one repository up for Claude Code and the skills in this repo, then checks it again on later runs. It writes project facts into the project and never into a skill. The project's own AGENTS.md, CONTRIBUTING.md and branch protection win over everything here.

Doc facts, templates and inspect commands are in `reference.md` (read it before step 1). The date checked is in that file; read the live page when it is old.

## 1. Inspect, change nothing

Run the inspect commands in `reference.md` from the repo root. Report one short table of what exists and what is missing:

- git: clean or dirty, default branch, remote, and the rules on the default branch (`gh api repos/{owner}/{repo}/rules/branches/<default>`, no admin needed).
- `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`.
- `.claude/`: settings.json (env values redacted), settings.local.json, skills, agents, commands. Hooks live inside settings.json.
- `.mcp.json`: server names only, never env or headers values.
- Installed mods that handle `tool.check` (see step 2).
- `.gitignore` and the stack: package manager, check, test, lint and build commands, docker compose files, CI config.

Stop and ask if the working tree has changes that are not setup work.

## 2. Claude Code project config

Propose each file, show the exact diff, write after the person's ok. Permission rules are the person's call.

- `.claude/settings.json`, committed, strict JSON, with `$schema`. Template in `reference.md`.
- Allow exact script names only, never `npm run *` or `make *`; an allowed script runs whatever it contains. Use the project's own check commands from step 1.
- Deny rules for `pkill`, `killall`, force push and secret files (`.env` and the key and credential files the project really has).
- Never narrow, loosen or remove an existing deny or ask rule, and never add an allow that overlaps one. A rule that looks wrong is reported and left alone.
- Say once, when you show the diff, how far a deny reaches. A Bash deny matches the command text, so `git -C . push` and `/bin/rm` get past it. A Read deny covers the built-in file tools and recognised read commands, not `grep -r .` or a script that opens files. Only the sandbox enforces at OS level; a PreToolUse hook is the next best guard. Offer either; add neither unasked.
- Mods: on a personal login with no managed settings, a mod that handles `tool.check` can approve a call a deny rule refuses. List the installed ones with the loop in `reference.md` and name them in the diff message.
- Force pushes are stopped on the remote, not by a local rule. If step 1 found no rule on the default branch, tell the person to add a ruleset (block force pushes, restrict deletions, require a pull request). Show the ruleset JSON and the `gh api` call from `reference.md`; change the repo only on their explicit ok.
- `.gitignore`: add `.claude/settings.local.json` and `CLAUDE.local.md` if missing.
- `CLAUDE.md`: if the project has `AGENTS.md` and no `CLAUDE.md`, create a `CLAUDE.md` whose first line is `@AGENTS.md`, with Claude-only lines below. If both exist, check the import is there. If only `CLAUDE.md` exists, keep it. Never copy text between the two.
- Project skills go in `.claude/skills/<name>/SKILL.md`; create the folder only when there is a skill for it.
- `.mcp.json`: report it. Do not add servers.

## 3. These skills

- AGENTS.md gets the "Checks and queue" block from the README ("In a new project"). Fill the check command from step 1, the lock file from `shared-machine-checks` if the project runs heavy checks, hot files from `git log` (the files most PRs touch), and label strings from `docs/agents/triage-labels.md` or `gh label list`. Ask one question at a time, with a recommendation, for what is still blank.
- Global `~/.claude/CLAUDE.md` (the user home, see `windows-ops` for the Windows path): check it has the routing block and the `Claude plan:` line from the README. If one is missing, show the lines to add and write only after the person's ok. Model-mix needs the plan line.
- Point, do not repeat: `git-conventions` (offer its commit-msg hook only when the project has no CI of its own), `roadmap-tracker` (milestone, labels, pinned roadmap issue), `shared-machine-checks` (the lock file) and `model-mix`.

## 4. Matt Pocock's skills

An `## Agent skills` block in `CLAUDE.md` or `AGENTS.md`, or a `docs/agents/` folder, counts as yes (`matt-bridge` §2). Otherwise ask once: "Use Matt Pocock's skills in this project?" Recommend yes for a repo that builds features from issues, no for a script or a single-owner experiment. After a no, ask again only if the person brings it up.

Find his skills before anything else, in this order, and report the source of each: project `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md`, the lock file `~/.agents/.skill-lock.json` (source `mattpocock/skills`), then `claude plugin list`. Commands are in `reference.md`.

- Found as directories (the `npx skills` CLI): compare the names with `matt-bridge/flow.md`, report missing or renamed ones, and propose that tool's own update command. Run it only after the ok. Never install the plugin over directory copies and never delete a copy without the person's ok.
- Found as the plugin: compare `claude plugin list` (version) and `claude plugin details mattpocock-skills` (skills) with that file. If it is behind, show `claude plugin update mattpocock-skills@mattpocock` and run it after the ok.
- Not found, and the person said yes: the yes does not cover adding a third-party marketplace. Show both commands from `matt-bridge` §1 with their scope (`--scope user` unless the person picks project, and then the change goes in the PR). Say that this adds a marketplace that updates on its own, and vet it with `smart-mods` first. Run only after the ok on those exact commands. Then run `claude plugin details mattpocock-skills` and confirm the skills.
- Then tell the person to type `/setup-matt-pocock-skills`. It is theirs to start. Its files land by PR, under `matt-bridge` §2 and `roadmap-tracker` §5 for the labels.

## 5. Ship it

Branch `chore/issue-<n>-claude-setup` from the default branch (`<n>` is the issue number; without an issue use `chore/claude-setup`). One commit per topic, written by `git-conventions`. Open a PR. Never push to the default branch.

## 6. Run it again

On a project that is already set up, change nothing on the first pass. Report drift only: a missing `$schema`, an allow rule for a command that no longer exists, a template deny rule missing from the file, a missing ignore line, an AGENTS.md block with a blank fact, no rule on the default branch, Matt's skills behind. Propose each fix as in step 2.

## Done when

- `.claude/settings.json` is valid JSON with `$schema`, and `claude doctor` run in the repo reports no settings error.
- The person confirms `claude` starts in the repo with no Settings Error dialog; `/status` lists the project file under `Setting sources`.
- AGENTS.md has the four facts, none left as `<...>`.
- His skills are found by the step 4 check, from whichever source, if the person chose them.
- The PR is open and the default branch is untouched.
