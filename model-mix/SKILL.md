---
name: model-mix
description: "Model, effort and usage budget for delegated work on a Claude plan (Pro, Max, Ultra): which model and effort a subagent, cloud session (claude --cloud), workflow stage, routine or review gets, how wide a run may be, and whether the weekly, Fable and (Pro, Max) 5-hour limits allow launching now. Use before launching any agent, worker, workflow or review, or before setting an advisor, in any project."
---

Pick the model for each piece of delegated work from the table, then check the budget before launching. The plan's limits cover the whole account: the person's own chats on claude.ai and Desktop, the CLI, every subagent and workflow agent, cloud sessions and routines.

## Models

Three models carry the work: **Haiku 5.5** for short reading and small mechanical work, **Sonnet 5.5** for implementation, **Opus 5.5** where a mistake costs the most. Plan metering ratios are unpublished, so API list prices (read 2026-11-10 on the pricing page) are the proxy. For output and uncached input, Haiku costs 1/20 of Sonnet while its prompt stays under 100K tokens and 1/4 above, Opus 2× Sonnet and Fable 5.2 4× Sonnet. For cached re-reads, Opus and Fable 5.2 cost 2× Sonnet and Haiku 1/10 under 100K tokens. Only Haiku has a long-context price step.

| Work | Model | Effort |
| --- | --- | --- |
| Implementing a ticket, a feature, a fix | Sonnet | high |
| Small mechanical ticket: one file, a text, a false alarm | Haiku | medium |
| Broad reading: exploring a codebase, fan-out readers in a workflow | Haiku | medium |
| Security-critical work: consents, permissions, secrets, auth, sandboxing | Opus | high |
| Verify and judge stages: adversarial refuters, scoring panels, final review of a diff before merge | Opus | high (Pro: medium) |
| Coordination: planning, decisions with the person, merges | the main session | |
| Mechanical checks: CI state, PR lists, log reads, usage reads | no model: shell or a read-only tool | |

How to apply it:

- **Always name the model.** Unpinned workflow agents and subagents, built-in Explore and Plan included, inherit the session model, which is Opus 5.5 by default on every plan. In a Fable session, Explore runs on Opus.
- **Agent tool:** `model` (`"haiku"`, `"sonnet"` or `"opus"`) and, from Claude Code v2.1.292, `effort` from the table: `model: "haiku", effort: "medium"`. In OpenCode the same rows are `claude-agent/haiku#medium`, `claude-agent/sonnet#high`, `claude-agent/opus#high` and, only under the Fable rule below, `claude-agent/fable#high`.
- **Workflow script:** `agent(prompt, { model: 'haiku', effort: 'medium' })` on reading fan-out stages, `{ model: 'sonnet', effort: 'high' }` on implementation stages, `{ model: 'opus', effort: 'high' }` on verify and judge stages. Give every agent of one stage the same model, effort, agent type, tools, schema and working directory: the shared prompt prefix is cached only between identical settings.
- **Cloud session:** `claude --model sonnet --effort high --cloud "<task>"`, `--model claude-haiku-5-5 --effort medium` for a small mechanical ticket, or `--model opus` for the security-critical rows. The docs do not say these flags reach the cloud session: check the model shown in the first cloud session on each machine, and if it differs, start the task with `/model` and `/effort` lines.
- **Routines and scheduled tasks:** set their model selector to Sonnet; Haiku when the routine only reads and reports; Opus when it runs a verify or judge row.
- When a piece of work fits two rows, take the stronger model and the higher effort: a security fix or a security verify is Opus high even when it is small, also on Pro.
- If agents fail with an "Opus limit" or "Sonnet limit" message (whether a plan still has these family limits is undocumented), rerun that stage on the other family at high effort, say so in the report, and tell the person.

Haiku 5.5 (`claude-haiku-5-5`, released 2026-10-07):

- **The alias:** in Claude Code v2.1.293 and later, `haiku` is Haiku 5.5 on the Anthropic API, which is what Pro and Max use. Check `claude --version` once per machine. On an older version, or on Bedrock, Google Cloud, Microsoft Foundry or Claude Platform on AWS, `haiku` is still Haiku 4.5: give the Haiku rows to Sonnet there. Never pin Haiku 4.5 (`claude-haiku-4-5-20251001`), even while it stays active (retirement not sooner than 2026-10-15): its last ticket came back wrong.
- **Keep it short:** the price steps up 5× once a prompt passes 100K tokens, and a subagent resends its whole context every turn. One area per reader, no whole-repo or long-log reads. Work that needs more than about 100K tokens of context goes to Sonnet.
- **Never on** a feature or a fix beyond the small-mechanical row, the security rows, or verify and judge stages, also when the budget is red.
- **Trial:** the first Haiku ticket in each project gets an Opus review of its diff before merge. If a Haiku ticket or reading comes back wrong, move that row back to Sonnet in this project, say so in the report, and tell the person.
- Thinking cannot be switched off on Haiku 5.5; effort is the lever, medium by default.

Outside the default mix (these can bill usage credits):

- **Fable 5.2** (`claude-fable-5-2`, released 2026-11-09, the `fable` alias from Claude Code v2.1.321; Fable 5.1 stays active until at least 2027-09-01): off by default. Three uses only: (1) a product decision the person explicitly delegated ("if in doubt ask Fable"), recorded where decisions are recorded; (2) reviewing UI screenshots in place of the person, when they delegated that; (3) the last review of a security-critical or sign-in diff. Only on Max or Ultra, with a green budget and the Fable weekly limit readable and under 80% (`budget.md`). Pro runs Fable on usage credits, so never there, except inside a launch offer (Fable 5.2: included through 2026-11-16).
- **Fable in Claude Code:** the main session or a short foreground subagent. Never `-p`, background, teammate or cloud workers: past the Fable cap, `-p` and an SDK app that shows no consent prompt bill credits without asking, background, teammate and Remote Control sessions wait 5 minutes (`dialogExpiry`) for consent and then drop the turn, and in cloud sessions the prompt depends on the app.
- **Fable in OpenCode:** a `claude-agent/fable#high` subagent runs through the Agent SDK on the Claude Code subscription login and shows no consent prompt, so past the Fable cap it can bill credits silently (inferred from the SDK rule above; OpenCode's provider code was not read). Use it only under the 80% rule, as a short foreground-style brief. Check which Fable ran: OpenCode 2.2.6 contains `claude-fable-5` and `claude-fable-5-1` but not `claude-fable-5-2`, so `fable` may still map to Fable 5.1.
- **Fast mode (`/fast`):** credits only. Never for delegated work.
- **Ultrareview (`/code-review ultra`):** credits after 3 one-time free runs per account. Only when the person asks for it.

## Advisor

From `code.claude.com/docs/en/advisor.md` and the prompt-caching page, read 2026-11-09. Experimental, Anthropic API only.

- Set it with `/advisor <model>` (saved as `advisorModel`), `/advisor off`, the `advisorModel` setting or `--advisor <model>`. It must rank at or above the main model: Sonnet 5.5 accepts Opus 5 or later and Fable. Subagents inherit it and apply the same check to their own model.
- Claude decides when to call it and nothing caps the calls. Each call rereads the whole conversation with no cache, on plan usage; a Fable advisor bills to usage credits on plans where Fable does.
- Toggling it keeps the main prompt cache. A `/model` switch does not: the next request rereads the whole context, so switching a long session's model back and forth pays that each time.

Rules:

- For a strong second opinion at decision points, run workers as Sonnet with an Opus advisor instead of switching the session model.
- A Fable second opinion is one of the three uses in the Fable rule above, run as a foreground subagent with a short brief. An advisor's timing cannot be capped, and a long coordinator session makes every call expensive.
- Run `/advisor off` where workers should not inherit it, such as Haiku readers.

## Plan profiles

Plans (renamed on 2026-10-30): **Pro**, **Max** (formerly Max 5x, $100/month) and **Ultra** (formerly Max 20x, $200/month; existing Max 20x subscribers moved over). Find the plan. In a Desktop session, the read-only tool `get_usage` returns `Pro` or `Max`. In a terminal, `claude auth status` returns `subscriptionType` (`pro` or `max`). Max and Ultra look the same there (whether either now reports Ultra is unverified), so read the person's line in their global CLAUDE.md:

```
Claude plan: Ultra · reserve 10% · banked: weekly reset, expires 2026-10-22
```

- If the line is missing, ask once and offer to add it. Until then use the Pro profile on Pro and the Max profile on Max or Ultra.
- The detected plan wins over the line: if they disagree, use the detected plan's profile (Max for an unknown Max or Ultra tier), tell the person once, and offer to fix the line. A line naming Ultra agrees with a detected `Max`.

| Profile | Agents per workflow run (all stages) | Verify and judge | Parallel cloud sessions | Plan reserve |
| --- | --- | --- | --- | --- |
| Ultra | 16 | Opus high, one finding per verifier | 3, on disjoint areas | 10% |
| Max | 8 | Opus high, findings batched per area | 1 | 15% |
| Pro | 4, only when the person asks | Opus medium, one final stage | 1 | 25% |
| Solo | no workflows, one Agent call at most | the main session checks | 0 | |

- Widths and reserves are starting defaults, not published limits. The run-cost notes in `budget.md` narrow them.
- The reserve is the share of the weekly limit kept for the person's own use. It belongs to the plan (the row above, or the CLAUDE.md line), never to today's profile, so a step down does not change it.
- On Pro, dynamic workflows must be switched on in `/config`, and the default size guideline there is small (under 5 agents).
- Limits, from the plan pages (read 2026-11-06, Fable read 2026-11-10, sources in `budget.md`): Max gives 5× Pro usage every five hours and every week. Ultra gives 10× Pro usage every week and, on a verified account, has no five-hour limit: only the weekly limit applies. An unverified Ultra account has a temporary limit until it is verified. Max and Ultra both have a weekly limit across all models plus a separate weekly limit for Fable, up to 50% of the weekly limits; past it, Fable needs usage credits. Anthropic may add other limits. Whether the Ultra weekly cap is lower than the old Max 20x one is unverified: sources disagree, so trust the run-cost notes.

## Budget check

Run it in the main session before anything that starts delegated work: a workflow, a cloud session, a message that gives a worker new work, more than one agent, a delegated review. Run it again between workflow phases. The main session owns the check: cloud sessions cannot read usage, and checking on every wait only spends context.

Read `budget.md` next to this file: it turns the usage reading and the banked resets into a margin against the elapsed week, and lists the overrides (last 12 hours, 5-hour window where there is one, projected cost, resets, Fable weekly limit, usage credits). If a usage mod puts the color into this session's context, take the color from it instead of computing the margin, and still take a reading and apply every override. A pane or band that only the person sees does not count.

- **Green**, margin ≤ 10: the plan's profile.
- **Yellow**, margin over 10 up to 25: one profile down (Ultra → Max → Pro → Solo), with that profile's cloud-session column for new sessions. Open PRs finish before a new thread starts, and finishing open work continues as in red, also on Solo. Compact the main session at the next natural break.
- **Red**, margin over 25 or weekly used ≥ 100 − reserve: start nothing new. Finishing open work continues: a fix message to a worker on its own open PR, a final review in the main session, merging what is green. Tell the person once, and ask them to redeem a banked weekly reset when `budget.md` says it is worth it. Compact the main session.

**Why:** the weekly limit (and the 5-hour window on Pro and Max) is shared by everything on the account, including the person's own chats, and Opus everywhere burns them. Haiku takes the short reading and mechanical volume, Sonnet the implementation, and Opus is kept for the work where a mistake costs the most. Pacing against the elapsed week instead of a fixed stop uses the whole plan without running dry before the reset.
