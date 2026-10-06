# Claude Code skills

Four personal skills for running Claude Code: three for coordinating work delegated to subagents, cloud sessions and workflows, and one for extending Claude Code with mods. They work in any project.

| Skill | What it decides |
| --- | --- |
| [model-mix](model-mix/SKILL.md) | Which model and effort each piece of delegated work gets (Sonnet 5.5 for implementation and broad reading, Opus 5.5 for security, verification and final review), the profile for the plan (Pro, Max 5x, Max 20x), and a budget check that paces the weekly limit against the elapsed week, counting banked limit resets. |
| [smart-ultracode](smart-ultracode/SKILL.md) | When a multi-agent workflow is worth it, how wide it should be within the plan's profile, which shape to use, and what to believe of its result. |
| [coordinator-method](coordinator-method/SKILL.md) | How delegated work runs: briefing cloud and local workers, merging only on green checks, safe git, a round of checks after every merge, the budget check before every launch, overnight loops, UI changes. Includes `launch.exp`, a launcher for Claude Code cloud sessions. |
| [smart-mods](smart-mods/SKILL.md) | When a Claude Code mod is the right extension, how to write, test and install one globally, and how to vet someone else's mod before it runs with your permissions. |

The skills point to each other instead of repeating themselves. A project's own `AGENTS.md`, `CONTRIBUTING.md` and branch protection always win over them; project facts stay in the project.

## Install

```bash
git clone https://github.com/emanueledenaro/claude-skills.git
cp -R claude-skills/model-mix claude-skills/smart-ultracode claude-skills/coordinator-method claude-skills/smart-mods ~/.claude/skills/
```

Then add a pointer to your global `~/.claude/CLAUDE.md`, so every project reaches them:

```markdown
Before launching any agent, cloud session, workflow or review, use `model-mix`. Before writing a workflow script, use `smart-ultracode`. When coordinating delegated work (workers, merges, rounds, overnight loops, UI changes), use `coordinator-method`. Before writing, changing, installing or reviewing a Claude Code mod, use `smart-mods`.
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
