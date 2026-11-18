---
name: model-mix
description: "Model, effort and usage budget for delegated work on a Claude plan (Pro, Max, Ultra): which model and effort a subagent, cloud session (claude --cloud), workflow stage, routine or review gets, how wide a run may be, and whether the weekly, Fable and (Pro, Max) 5-hour limits allow launching now. Use before launching any agent, worker, workflow or review, or before setting an advisor, in any project."
---

Pick the model for each piece of delegated work from the table, then check the budget before launching. The plan's limits cover the whole account: the person's own chats on claude.ai and Desktop, the CLI, every subagent and workflow agent, cloud sessions and routines.

## Models

Every piece of delegated work runs on **Opus 5.5** at **xhigh** effort: workers, fix rounds, readers, verifiers, critics, reviews and final reviews, on every plan. The owner set this rule on 2026-11-18. Plan metering ratios are unpublished, so API list prices (read 2026-11-10 on the pricing page) are the proxy. For output and uncached input, Haiku costs 1/20 of Sonnet while its prompt stays under 100K tokens and 1/4 above, Opus 2× Sonnet and Fable 5.2 4× Sonnet. For cached re-reads, Opus and Fable 5.2 cost 2× Sonnet and Haiku 1/10 under 100K tokens. Only Haiku has a long-context price step.

| Work | Model | Effort |
| --- | --- | --- |
| Delegated work of every kind: implementing a ticket, a fix round, reading and exploring, security-critical work, verify and judge stages, the final review of a diff before merge | Opus | xhigh |
| Coordination: planning, decisions with the person, merges | the main session | |
| Mechanical checks: CI state, PR lists, log reads, usage reads | no model: shell or a read-only tool | |

How to apply it:

- **Always name the model and the effort.** Unpinned workflow agents and subagents, built-in Explore and Plan included, inherit the session model, which is Opus 5.5 by default on every plan. In a Fable session, Explore runs on Opus.
- **Agent tool:** `model: "opus", effort: "xhigh"` (`effort` from Claude Code v2.1.292). In OpenCode the row is `claude-agent/opus#xhigh` and, only under the Fable rule below, `claude-agent/fable#high`.
- **Effort levels:** `low`, `medium`, `high`, `xhigh` and `max` (frontmatter reference in `skill-audit/reference.md`). Delegated work uses `xhigh`. What it costs against `high` was not measured: the run-cost notes in `budget.md` are the measure. In OpenCode the level is the suffix after `#`.
- **Workflow script:** `agent(prompt, { model: 'opus', effort: 'xhigh' })` on every stage. Give every agent of one stage the same model, effort, agent type, tools, schema and working directory: the shared prompt prefix is cached only between identical settings.
- **Cloud session:** `claude --model opus --effort xhigh --cloud "<task>"`. The docs do not say these flags reach the cloud session: check the model shown in the first cloud session on each machine, and if it differs, start the task with `/model` and `/effort` lines.
- **Routines and scheduled tasks:** set their model selector to Opus and the effort to xhigh (high if the selector stops there).
- If agents fail with an "Opus limit" message (whether a plan still has per-family limits is undocumented), launch nothing new on that stage, say so in the report, tell the person, and rerun the stage on Opus after the limit resets.

Outside the default mix (these can bill usage credits):

- **Fable 5.2** (`claude-fable-5-2`, released 2026-11-09, the `fable` alias from Claude Code v2.1.321; Fable 5.1 stays active until at least 2027-09-01): off by default. Three uses only: (1) a product decision the person explicitly delegated ("if in doubt ask Fable"), recorded where decisions are recorded; (2) the one pre-PR screenshot review of a UI ticket, in place of the person, when they delegated the look (`coordinator-method`); (3) the last review of a security-critical or sign-in diff. Only on Max or Ultra, with a green budget and the Fable weekly limit readable and under 80% (`budget.md`). Pro runs Fable on usage credits, so never there, except inside a launch offer, and then under the same three uses, green budget and 80% rule. The Fable 5.2 offer for Pro ran through 2026-11-16 and is over (`budget.md`); whether a later offer started needs a check.
- **Fable in Claude Code:** the main session or a short foreground subagent. Never `-p`, background, teammate or cloud workers: past the Fable cap, `-p` and an SDK app that shows no consent prompt bill credits without asking, background, teammate and Remote Control sessions wait 5 minutes (`dialogExpiry`) for consent and then drop the turn, and in cloud sessions the prompt depends on the app. Never as a coordinator's standing model, in a `/loop`, goal check-in or overnight wake; switch back after the one use.
- **Fable in OpenCode:** a `claude-agent/fable#high` subagent runs through the Agent SDK on the Claude Code subscription login and shows no consent prompt, so past the Fable cap it can bill credits silently (inferred from the SDK rule above; OpenCode's provider code was not read). Use it only for the three uses above, on Max or Ultra, with a green budget and the Fable weekly limit readable and under 80%, as one short foreground brief. Check which Fable ran: the OpenCode 2.3.0 binary contains `claude-fable-5-2` (string search on 2026-11-18; 2.2.6 had only `claude-fable-5` and `claude-fable-5-1`), but which model the `fable` alias resolves to at run time was not checked.
- **Mythos 5.2** (`claude-mythos-5-2`; in OpenCode `claude-agent/claude-mythos-5-2`): the same model as Fable 5.2, with the same price ($8 input, $40 output per million tokens), released 2026-11-09, available only to organizations verified through Anthropic's verification programs, such as the Cyber Verification Program ([Claude Mythos 5.2](https://platform.claude.com/docs/en/models/mythos-5-2/overview), read 2026-11-18). The OpenCode 2.3.0 binary does not contain the id (string search), yet OpenCode sessions ran on `claude-agent/claude-mythos-5-2#xhigh` on 2026-11-18 (306 answered turns in its session database). Not verified: which weekly limit it draws on (all models, the Fable limit, or its own); that page says nothing about plan limits, and the OpenCode usage file (`budget.md`) has no window for it. No use above names it yet: that waits for the owner.
- **Fast mode (`/fast`):** credits only. Never for delegated work.
- **Ultrareview (`/code-review ultra`):** credits after 3 one-time free runs per account. Only when the person asks for it.

## Advisor

From `code.claude.com/docs/en/advisor.md` and the prompt-caching page, read 2026-11-09. Experimental, Anthropic API only.

- Set it with `/advisor <model>` (saved as `advisorModel`), `/advisor off`, the `advisorModel` setting or `--advisor <model>`. It must rank at or above the main model: Sonnet 5.5 accepts Opus 5 or later and Fable. Subagents inherit it and apply the same check to their own model.
- Claude decides when to call it and nothing caps the calls. Each call rereads the whole conversation with no cache, on plan usage; a Fable advisor bills to usage credits on plans where Fable does.
- Toggling it keeps the main prompt cache. A `/model` switch does not: the next request rereads the whole context, so switching a long session's model back and forth pays that each time.

Rules:

- Workers run on Opus, so an Opus advisor adds nothing to them: it is the same model rereading the same conversation, uncached, on plan usage. Leave it off.
- A Fable second opinion is one of the three uses in the Fable rule above, run as a foreground subagent with a short brief. An advisor's timing cannot be capped, and a long coordinator session makes every call expensive.
- Run `/advisor off` before launching workers from a session that has an advisor set: subagents inherit it.

## Plan profiles

Plans (renamed on 2026-10-30): **Pro**, **Max** (formerly Max 5x, $100/month) and **Ultra** (formerly Max 20x, $200/month; existing Max 20x subscribers moved over). Find the plan. In a Desktop session, the read-only tool `get_usage` returns `Pro` or `Max`. In a terminal, `claude auth status` returns `subscriptionType` (`pro` or `max`). Max and Ultra look the same there (whether either now reports Ultra is unverified), so read the person's line in their global CLAUDE.md:

```
Claude plan: Ultra · reserve 10% · banked: weekly reset, expires YYYY-MM-DD
```

- If the line is missing, ask once and offer to add it. Until then use the Pro profile on Pro and the Max profile on Max or Ultra.
- The detected plan wins over the line: if they disagree, use the detected plan's profile (Max for an unknown Max or Ultra tier), tell the person once, and offer to fix the line. A line naming Ultra agrees with a detected `Max`.

| Profile | Agents per workflow run (all stages) | Verify and judge | Parallel cloud sessions | Plan reserve |
| --- | --- | --- | --- | --- |
| Ultra | 16 | Opus xhigh, one finding per verifier | 3, on disjoint areas | 10% |
| Max | 8 | Opus xhigh, findings batched per area | 1 | 15% |
| Pro | 4, only when the person asks | Opus xhigh, one final stage | 1 | 25% |
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

**Why:** the weekly limit (and the 5-hour window on Pro and Max) is shared by everything on the account, including the person's own chats. With one model for all delegated work, the levers on it are width and length: fewer agents, shorter briefs, one area per reader, and this check before each launch. Opus 5.5 has no long-context price step (`context-hygiene`), yet every agent turn resends its whole context, so a short brief still costs less. Pacing against the elapsed week instead of a fixed stop uses the whole plan without running dry before the reset.
