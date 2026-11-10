---
name: project-setup
description: "One-time setup of a repository for Claude Code and OpenCode (V2) and these skills: inspect what exists, propose the committed .claude/settings.json and opencode.jsonc (schema, allow rules for its checks, deny rules for pkill, killall, force push, secret files), AGENTS.md as the one instruction file with CLAUDE.md importing it, the four project facts, official stack skills, this repo's skills kept installed and current for both tools, then optionally Matt Pocock's skills, shipped as a chore PR. Differs from matt-bridge (how his skills run), setup-matt-pocock-skills (tracker, labels), the Vercel bootstrap skill (env pulls), /init (a starting CLAUDE.md) and claude-automation-recommender (suggests, writes nothing). Use when setting up or auditing a repository for Claude Code or OpenCode, 'configura il progetto', 'configura il progetto per OpenCode', 'setup del progetto', 'prepara il repo per Claude', in any project."
---

# Project setup

Sets one repository up for Claude Code, OpenCode V2 and the skills in this repo, then checks it again on later runs. It writes project facts into the project and never into a skill. The project's own AGENTS.md, CONTRIBUTING.md and branch protection win over everything here.

Doc facts, templates, scripts and inspect commands are in `reference.md` (read it before step 1). Its date checked covers both tools; read the live page when it is old. OpenCode: V2 names only (`permissions`, `shell`), never V1 `permission` or `bash`.

## 1. Inspect, change nothing

Run the inspect commands in `reference.md` from the repo root. Report one short table of what exists and what is missing:

- git: clean or dirty, default branch, remote, and the rules on the default branch (`gh api repos/{owner}/{repo}/rules/branches/<default>`, no admin needed).
- `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`.
- Claude Code: `.claude/` (settings.json with env values redacted, settings.local.json, skills, agents, commands; hooks live in settings.json) and `.mcp.json` server names only.
- OpenCode: `opencode.jsonc` (or `.opencode/`), its `policies` and `permissions`, `mcp.servers` names only, `opencode --version`.
- Installed mods that handle `tool.check` (see step 2).
- `.gitignore` and the stack: package manager, check, test, lint and build commands, docker compose files, CI config, and the frameworks and vendors in use.

Stop and ask if the working tree has changes that are not setup work.

## 2. Project config for both tools

Propose each file, show the exact diff, write after the person's ok. Permission rules are the person's call. Same deny set in both tools: `pkill`, `killall`, force push, and the secret files the project really has.

- Claude Code: `.claude/settings.json`, committed, strict JSON, with `$schema`. Deny rules go in `permissions.deny`.
- OpenCode: `opencode.jsonc`, with `$schema`. Deny rules go in `policies` (`tool.use`), so a later rule or a saved approval cannot lift them.
- Allow exact script names only, never `npm run *` or `make *`; an allowed script runs whatever it contains. In OpenCode the default policy already allows everything, so allow rules mean something only after a `shell` `ask` rule: offer the pair, never one half.
- Never narrow, loosen or remove an existing deny or ask rule, and never add an allow that overlaps one. A rule that looks wrong is reported and left alone.
- Say once, when you show the diff, how far a deny reaches. A Bash or shell deny matches the command text, so `git -C . push` and `/bin/rm` get past it. A read deny covers the read tools, not a script or `cat` that opens the file. Only the sandbox enforces at OS level; a PreToolUse hook is the next best guard in Claude Code. Offer either; add neither unasked.
- Mods: on a personal login with no managed settings, a Claude Code mod that handles `tool.check` can approve a call a deny rule refuses. List the installed ones with the loop in `reference.md` and name them in the diff message.
- Force pushes are stopped on the remote, not by a local rule. If step 1 found no rule on the default branch, tell the person to add a ruleset (block force pushes, restrict deletions, require a pull request). Show the ruleset JSON and the `gh api` call from `reference.md`; change the repo only on their explicit ok.
- `.gitignore`: add `.claude/settings.local.json` and `CLAUDE.local.md` if missing.
- Project skills go in `.claude/skills/<name>/SKILL.md`: OpenCode reads that folder too. Create it only when there is a skill for it. In OpenCode a skill with the same ID in `~/.agents/skills` or `~/.config/opencode/skills` beats the project one, so check the ID against both before adding it.
- MCP: `.mcp.json` is Claude Code's, `mcp.servers` in `opencode.jsonc` is OpenCode's. Report both. Add no server.

## 3. Instruction files

OpenCode reads `AGENTS.md` only; Claude Code reads `CLAUDE.md`. So `AGENTS.md` is required and holds the project text; `CLAUDE.md` is `@AGENTS.md` plus Claude-only lines. Cases (only `CLAUDE.md`, both, neither) are in `reference.md`; the move from `CLAUDE.md` is one commit and shown as a diff first. Like every project write, it waits for the person's ok.

- `AGENTS.md` gets the "Checks and queue" block from the README ("In a new project"). Fill the check command from step 1, the lock file from `shared-machine-checks` if the project runs heavy checks, hot files from `git log` (the files most PRs touch), and label strings from `docs/agents/triage-labels.md` or `gh label list`. Ask one question at a time, with a recommendation, for what is still blank.

## 4. These skills, global

This repo is public, so the automatic part is opt-in. The script in `reference.md` ("These skills") writes without asking only when `~/.claude/CLAUDE.md` has the line `claude-skills: auto-sync`. Without it the script is a dry run: show its `would:` lines, ask once, rerun with `APPLY=1` after the ok, and offer to add the line so later runs need no question. Never overwrite a real directory.

- The script clones this repo if absent (reusing a clone found by `git remote`), links every missing skill into `~/.agents/skills` and `~/.claude/skills`, and updates every copy that differs from the repo's default branch in `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` and plugin marketplace clones. A clone is fast-forwarded only when clean and on its default branch; otherwise it prints a `report:` line, because it may be the person's working copy.
- OpenCode ranks `~/.config/opencode/skills` first, so a stale copy there hides the current one without a warning.
- Routing block: the same script makes sure `~/.claude/CLAUDE.md` has the README's routing block, and that `~/.config/opencode/AGENTS.md` reaches the same text (a link to the first file; a different file gets the block appended, never replaced).
- Ask only for the `Claude plan:` line if absent (`model-mix` needs it): one question, with a recommendation.
- Point, do not repeat: `git-conventions` (offer its commit-msg hook only when the project has no CI of its own), `roadmap-tracker`, `shared-machine-checks` and `model-mix`.

## 5. Stack skills

From the stack of step 1, suggest skills from the stack's own vendor and nobody else (`supabase/agent-skills` for Supabase). Table, duplicate check and install command are in `reference.md`.

- First list what is installed in `~/.claude/skills`, `~/.agents/skills`, `~/.config/opencode/skills` and the plugins. A skill that is there, under any name, is not suggested again.
- Vet each one with `skill-audit` on a fresh clone before the install. Show the verdict and the exact command; run it only after the person's ok.
- Install at user level only: the directory in `~/.agents/skills/<id>` and a symlink in `~/.claude/skills/<id>`. Never into the project.

## 6. Matt Pocock's skills

An `## Agent skills` block in `CLAUDE.md` or `AGENTS.md`, or a `docs/agents/` folder, counts as yes (`matt-bridge` §2). Otherwise ask once: "Use Matt Pocock's skills in this project?" Recommend yes for a repo that builds features from issues, no for a script or a single-owner experiment. After a no, ask again only if the person brings it up.

Find his skills before anything else, in this order, and report the source of each: project `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md`, the lock file `~/.agents/.skill-lock.json` (source `mattpocock/skills`), then `claude plugin list`. Commands are in `reference.md`.

- Found as directories (the `npx skills` CLI): OpenCode sees them too. Compare the names with `matt-bridge/flow.md`, report missing or renamed ones, and propose that tool's own update command. Run it only after the ok. Never install the plugin over directory copies and never delete a copy without the person's ok.
- Found as the plugin: compare `claude plugin list` (version) and `claude plugin details mattpocock-skills` (skills) with that file. If it is behind, show `claude plugin update mattpocock-skills@mattpocock` and run it after the ok. OpenCode has no plugin command and does not read plugin folders: if the person uses OpenCode, say that the skills reach it only as directories and offer the directory install.
- Not found, and the person said yes: the yes does not cover adding a third-party source. For Claude Code show both commands from `matt-bridge` §1 with their scope (`--scope user` unless the person picks project, and then the change goes in the PR); for OpenCode or both, the directory install `npx skills add mattpocock/skills -g`. Say that either adds code that updates on its own, and vet it first (`smart-mods` for the marketplace, `skill-audit` for the directories). Run only after the ok on those exact commands. Then confirm the skills: `claude plugin details mattpocock-skills`, or the directories.
- Then tell the person to type `/setup-matt-pocock-skills`. It is theirs to start. Its files land by PR, under `matt-bridge` §2 and `roadmap-tracker` §5 for the labels.

## 7. Ship it

Branch `chore/issue-<n>-agent-setup` from the default branch (`<n>` is the issue number; without an issue use `chore/agent-setup`). One commit per topic, written by `git-conventions`. Open a PR. Never push to the default branch. Steps 4 and 5 change the home folder, not the repo: they are not in the PR.

## 8. Run it again

On a project that is already set up, change nothing in the repo on the first pass. Report drift only: a missing `$schema`, an allow rule for a command that no longer exists, a template deny rule missing from either tool's file or present in only one, a project with `CLAUDE.md` and no `AGENTS.md`, a missing ignore line, an AGENTS.md block with a blank fact, no rule on the default branch, Matt's skills behind. Propose each fix as in step 2. The sync script of step 4 runs every time.

## Done when

- `.claude/settings.json` is valid JSON with `$schema`, and `claude doctor` run in the repo reports no settings error.
- The person confirms `claude` starts in the repo with no Settings Error dialog; `/status` lists the project file under `Setting sources`.
- OpenCode: the config load check in `reference.md` lists `opencode.jsonc` and prints no diagnostic for it. A rejected file is left out of the list with exit code 0, so read the list, not the exit code.
- AGENTS.md has the four facts, none left as `<...>`; a project with `CLAUDE.md` has it import `AGENTS.md`.
- The sync script ends with no `still differs` line, or each one is explained to the person.
- His skills are found by the step 6 check, from whichever source, if the person chose them.
- The PR is open and the default branch is untouched.
