# Claude Code skills

Four personal skills for running Claude Code: three for coordinating work delegated to subagents, cloud sessions and workflows, and one for extending Claude Code with mods. They work in any project.

| Skill | What it decides |
| --- | --- |
| [model-mix](model-mix/SKILL.md) | Which model and effort each piece of delegated work gets: Sonnet 5.5 for implementation and broad reading, Opus 5.5 for security, verification and final review. |
| [smart-ultracode](smart-ultracode/SKILL.md) | When a multi-agent workflow is worth it, how wide it should be, which shape to use, and what to believe of its result. |
| [coordinator-method](coordinator-method/SKILL.md) | How delegated work runs: briefing cloud and local workers, merging only on green checks, safe git, a round of checks after every merge, usage stops, overnight loops, UI changes. Includes `launch.exp`, a launcher for Claude Code cloud sessions. |
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

## Launching a cloud worker

From a repository root:

```bash
expect ~/.claude/skills/coordinator-method/launch.exp task.txt rules.txt worker.log sonnet high
```

The prompt is the task file, then the worker brief from `coordinator-method`, then the project's rules file (`-` for none). It prints the cloud session URL.

## License

MIT
