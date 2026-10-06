---
name: model-mix
description: "Model, effort and usage budget for delegated work on a Claude plan (Pro, Max 5x, Max 20x): which model and effort a subagent, cloud session (claude --cloud), workflow stage, routine or review gets, how wide a run may be, and whether the 5-hour and weekly limits allow launching now. Use before launching any agent, worker, workflow or review, in any project."
---

Pick the model for each piece of delegated work from the table, then check the budget before launching. The plan's limits cover the whole account: the person's own chats on claude.ai and Desktop, the CLI, every subagent and workflow agent, cloud sessions and routines.

## Models

Two models carry the work: **Sonnet 5.5** for volume, **Opus 5.5** where a mistake costs the most. Plan metering ratios are unpublished, so API list prices are the proxy. For output and uncached input, Opus costs about 2× Sonnet and Fable 5.1 about 5× Sonnet; cached re-reads of a long context cost about the same on all three.

| Work | Model | Effort |
| --- | --- | --- |
| Implementing a ticket, a feature, a fix | Sonnet | high |
| Small mechanical ticket: one file, a text, a false alarm | Sonnet | medium |
| Broad reading: exploring a codebase, fan-out readers in a workflow | Sonnet | medium |
| Security-critical work: consents, permissions, secrets, auth, sandboxing | Opus | high |
| Verify and judge stages: adversarial refuters, scoring panels, final review of a diff before merge | Opus | high (Pro: medium) |
| Coordination: planning, decisions with the person, merges | the main session | |
| Mechanical checks: CI state, PR lists, log reads, usage reads | no model: shell or a read-only tool | |

How to apply it:

- **Always name the model.** Unpinned workflow agents and subagents, built-in Explore and Plan included, inherit the session model, which is Opus 5.5 by default on every plan. In a Fable session, Explore runs on Opus.
- **Agent tool:** `model: "sonnet"` or `model: "opus"`.
- **Workflow script:** `agent(prompt, { model: 'sonnet', effort: 'medium' })` on fan-out stages, `{ model: 'opus', effort: 'high' }` on verify and judge stages. Give every agent of one stage the same model, effort, agent type, tools, schema and working directory: the shared prompt prefix is cached only between identical settings.
- **Cloud session:** `claude --model sonnet --effort high --cloud "<task>"`, or `--model opus` for the security-critical rows. The docs do not say these flags reach the cloud session: check the model shown in the first cloud session on each machine, and if it differs, start the task with `/model sonnet` and `/effort high` lines.
- **Routines and scheduled tasks:** set their model selector to Sonnet, unless the routine runs a verify or judge row.
- When a piece of work fits two rows, take the stronger model and the higher effort: a security fix or a security verify is Opus high even when it is small, also on Pro.
- If agents fail with an "Opus limit" or "Sonnet limit" message (whether a plan still has these family limits is undocumented), rerun that stage on the other family at high effort, say so in the report, and tell the person.

Outside the plan, on usage credits:

- **Fable 5.1:** off by default. Only on Max 20x with a green budget, and only for the single most consequential judgment (the final review of a security-critical diff). Never on Pro, where it is not part of the plan. Never on `-p`, background or cloud workers: past the Fable cap, `-p` runs bill credits without asking when credits are on, background and teammate sessions wait 5 minutes for consent and then drop the turn, and cloud sessions are undocumented.
- **Fast mode (`/fast`):** credits only. Never for delegated work.
- **Ultrareview (`/code-review ultra`):** credits after 3 one-time free runs per account. Only when the person asks for it.
- **Haiku:** not used. Haiku 4.5 is retired (too old, and its last ticket came back wrong), and the docs do not say which version the `haiku` alias points to, so never use the alias. When Haiku 5.5 ships, pin its full model ID, trial it on one small mechanical ticket with an Opus review, and if it passes, ask the person to update this row: it then takes the small-mechanical and broad-reading rows on Pro and in yellow.

## Plan profiles

Find the plan. In a Desktop session, the read-only tool `get_usage` returns `Pro` or `Max`. In a terminal, `claude auth status` returns `subscriptionType` (`pro` or `max`). Max 5x and Max 20x look the same everywhere, so read the person's line in their global CLAUDE.md:

```
Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22
```

- If the line is missing, ask once and offer to add it. Until then use the Pro profile on Pro and the Max 5x profile on Max.
- The detected plan wins over the line: if they disagree, use the detected plan's profile (Max 5x for an unknown Max tier), tell the person once, and offer to fix the line.

| Profile | Agents per workflow run (all stages) | Verify and judge | Parallel cloud sessions | Plan reserve |
| --- | --- | --- | --- | --- |
| Max 20x | 16 | Opus high, one finding per verifier | 3, on disjoint areas | 10% |
| Max 5x | 8 | Opus high, findings batched per area | 1 | 15% |
| Pro | 4, only when the person asks | Opus medium, one final stage | 1 | 25% |
| Solo | no workflows, one Agent call at most | the main session checks | 0 | |

- Widths and reserves are starting defaults, not published limits. The run-cost notes in `budget.md` narrow them.
- The reserve is the share of the weekly limit kept for the person's own use. It belongs to the plan (the row above, or the CLAUDE.md line), never to today's profile, so a step down does not change it.
- On Pro, dynamic workflows must be switched on in `/config`, and the default size guideline there is small (under 5 agents).
- Max 20x gives 20× Pro per 5-hour window. Its weekly limit is unpublished; third-party reports (unverified) put it at about twice Max 5x, in which case weekly pacing binds before the 5-hour window. Trust the run-cost notes over this guess.

## Budget check

Run it in the main session before anything that starts delegated work: a workflow, a cloud session, a message that gives a worker new work, more than one agent, a delegated review. Run it again between workflow phases. Delegated agents and cloud sessions cannot read usage, and checking on every wait only spends context.

If a usage mod shows the color, use it. Otherwise read `budget.md` next to this file: it turns the usage reading and the banked resets into a margin against the elapsed week, and lists the overrides (last 12 hours, 5-hour window, projected cost, resets, Fable, usage credits).

- **Green**, margin ≤ 10: the plan's profile.
- **Yellow**, margin over 10 up to 25: one profile down (Max 20x → Max 5x → Pro → Solo), with that profile's cloud-session column. Open PRs finish before a new thread starts. Compact the main session at the next natural break.
- **Red**, margin over 25 or weekly used ≥ 100 − reserve: start nothing new. Finishing open work continues: a fix message to a worker on its own open PR, a final review in the main session, merging what is green. Tell the person once, and ask them to redeem a banked weekly reset when `budget.md` says it is worth it. Compact the main session.

**Why:** the 5-hour and weekly limits are shared by everything on the account, including the person's own chats, and Opus everywhere burns them. Sonnet carries the volume and Opus is kept for the work where a mistake costs the most. Pacing against the elapsed week instead of a fixed stop uses the whole plan without running dry before the reset.
