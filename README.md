# Claude Code skills

Personal skills for running Claude Code as a coordinator that delegates work to subagents, cloud sessions and workflows, plus the tools around it. They work in any project.

| Skill | What it decides |
| --- | --- |
| [model-mix](model-mix/SKILL.md) | Which model and effort each piece of delegated work gets (Haiku 5.5 for short reading and small mechanical tickets, Sonnet 5.5 for implementation, Opus 5.5 for security, verification and final review), the profile for the plan (Pro, Max 5x, Max 20x), and a budget check that paces the weekly limit against the elapsed week, counting banked limit resets. |
| [smart-ultracode](smart-ultracode/SKILL.md) | When a multi-agent workflow is worth it, how wide it should be within the plan's profile, which shape to use, and what to believe of its result. |
| [coordinator-method](coordinator-method/SKILL.md) | How delegated work runs: briefing cloud and local workers, merging only on green checks, safe git, a round of checks after every merge, the budget check before every launch, overnight loops, UI changes. Includes `launch.exp`, a launcher for Claude Code cloud sessions. |
| [smart-mods](smart-mods/SKILL.md) | When a Claude Code mod is the right extension, how to write, test and install one globally, and how to vet someone else's mod before it runs with your permissions. |
| [cloud-worker](cloud-worker/SKILL.md) | How to launch, follow and collect cloud workers from this machine, Windows included, with `launch.ps1`. |
| [merge-gate](merge-gate/SKILL.md) | The review and merge procedure for a finished PR: review sized to the diff, verified findings applied, merge on the pinned head, then the follow-up. |
| [overnight](overnight/SKILL.md) | Running unattended overnight cheaply and safely: before sleeping, wake design, usage limits, keeping the machine awake, the morning summary. |
| [roadmap-tracker](roadmap-tracker/SKILL.md) | Tracker hygiene for the roadmap: pinned issue, milestones on every issue, labels mapped to the queue, tickets closed with the PR that landed them. |
| [matt-bridge](matt-bridge/SKILL.md) | How Matt Pocock's skills run inside the coordinator method, and which rule wins where they differ. |
| [verified-research](verified-research/SKILL.md) | Researching fast-changing facts with parallel readers, adversarial verifiers and a critic, and reporting them sorted by what survived. |
| [release-watch](release-watch/SKILL.md) | Cheap checks for Claude Code, Desktop, model, plan and upstream skill changes that should update the skills and mods. |
| [skill-audit](skill-audit/SKILL.md) | Auditing skills for trigger quality, size, duplication, stale facts and token cost, with concrete edits. |
| [context-hygiene](context-hygiene/SKILL.md) | Keeping sessions cheap: what every turn pays, how to measure it, when to compact, clear or hand off. |
| [windows-ops](windows-ops/SKILL.md) | What an agent must know on Windows 11: shells, Git Bash path conversion, long paths, line endings, missing tools, where Claude Code keeps its files. |
| [mod-ui](mod-ui/SKILL.md) | The visual language of the mods: band, pane, chat card, toasts, theme colors, Desktop and terminal differences. |

The skills point to each other instead of repeating themselves. A project's own `AGENTS.md`, `CONTRIBUTING.md` and branch protection always win over them; project facts stay in the project.

## Install

```bash
git clone https://github.com/emanueledenaro/claude-skills.git
cd claude-skills
cp -R model-mix smart-ultracode coordinator-method smart-mods cloud-worker merge-gate overnight roadmap-tracker matt-bridge verified-research release-watch skill-audit context-hygiene windows-ops mod-ui ~/.claude/skills/
```

Then add a routing block to your global `~/.claude/CLAUDE.md`, so every project reaches them at the right moment:

```markdown
Before launching any agent, cloud session, workflow or review, use `model-mix`. Before writing a workflow script, use `smart-ultracode`. When coordinating delegated work (workers, merges, rounds, overnight loops, UI changes), use `coordinator-method`. Before writing, changing, installing or reviewing a Claude Code mod or any plugin, or when asked for a pane, a band above the prompt, a custom command or a tool-call guard, use `smart-mods`; for what a mod draws, also `mod-ui`.
Launching or steering a cloud worker: `cloud-worker`. Merging a finished PR: `merge-gate`. Going unattended or to sleep: `overnight`. Issues, milestones, the roadmap: `roadmap-tracker`. Running Matt Pocock's skills: `matt-bridge`. Researching facts that change (prices, limits, versions, APIs): `verified-research`. Checking for new releases or models: `release-watch`. Reviewing skills or their cost: `skill-audit`. A heavy or long session: `context-hygiene`. Shell, paths or tools on Windows: `windows-ops`.
```

## Your plan

Claude Code can tell Pro from Max, but not Max 5x from Max 20x. Add one line to the same `~/.claude/CLAUDE.md` and keep it current:

```markdown
Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22
```

- **reserve:** the share of the weekly limit the skills leave for your own use.
- **banked:** the limit resets shown in Settings → Usage, each as `weekly reset, expires YYYY-MM-DD`, `5-hour reset, expires YYYY-MM-DD`, or `… reset, no expiry`, separated by `;`. Claude Code cannot read them and only you can redeem them, so delete an entry once you redeem it or it expires.
- **usage file** (optional, terminal only): `usage file: ~/.claude/usage.json`, if your statusline script saves its `rate_limits` there. Desktop sessions read usage directly.

Without the line, the skills ask once and use the Pro profile on Pro, the Max 5x profile on Max.

Optional safety net: in the `env` block of `~/.claude/settings.json`, add `"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"` next to the keys already there; do not replace the block. A general-purpose or workflow agent launched without a model then runs on Sonnet instead of the session's Opus, and an explicit `opus` still wins. It does not reach the built-in Explore and Plan agents, which stay on the session's model, or agents whose definition sets `model:` (including `inherit`), so the skills still name the model on every call. Do not add `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`: it also overrides the explicit `opus` the verify stages need.

## Launching a cloud worker

From a repository root:

```bash
expect ~/.claude/skills/coordinator-method/launch.exp task.txt rules.txt worker.log sonnet high
```

The prompt is the task file, then the worker brief from `coordinator-method`, then the project's rules file (`-` for none). It prints the cloud session URL. It needs `expect` (macOS, Linux, or WSL on Windows; Git Bash does not ship it). On Windows without WSL, start the cloud session from Claude Desktop instead.

## License

MIT
