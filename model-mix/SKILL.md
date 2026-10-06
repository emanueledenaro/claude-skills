---
name: model-mix
description: "Model choice for delegated work: which model and effort to give a subagent, a cloud session (claude --cloud), a workflow stage or a review. Use before launching any agent, worker or workflow, in any project."
---

Pick the model for each piece of delegated work from this table. Two models only: **Sonnet 5.5** and **Opus 5.5**. Haiku is retired for this person's work: too old, and its last ticket came back wrong.

| Work | Model | Effort |
| --- | --- | --- |
| Implementing a ticket, a feature, a fix | Sonnet | high |
| Small mechanical ticket: one file, a text, a false alarm | Sonnet | medium |
| Broad reading: exploring a codebase, fan-out readers in a workflow | Sonnet | medium |
| Security-critical work: consents, permissions, secrets, auth, sandboxing | Opus | high |
| Verify and judge stages: adversarial refuters, scoring panels, final review of a diff before merge | Opus | high |
| Coordination: planning, decisions with the person, merges | the main session (Opus) | |
| Mechanical checks: CI state, PR lists, log reads | no model: shell | |

How to apply it:

- **Agent tool:** pass `model: "sonnet"` or `model: "opus"`.
- **Workflow script:** `agent(prompt, { model: 'sonnet', effort: 'medium' })` on fan-out stages, `{ model: 'opus', effort: 'high' }` on verify and judge stages.
- **Cloud session:** `claude --model sonnet --effort high --cloud "<task>"`, or `--model opus` for the security-critical rows.

When a piece of work fits two rows, take the stronger model: a security fix is Opus even when it is small.

**Why:** the weekly usage has a stop, so Opus everywhere burns it; Sonnet carries the volume and Opus is kept for the work where a mistake costs the most.
