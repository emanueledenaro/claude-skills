---
name: matt-bridge
description: "How Matt Pocock's skills (grill-me, grill-with-docs, to-prd or to-spec, to-issues or to-tickets, tdd, implement, implement-spec, triage, diagnose or diagnosing-bugs, handoff, retro, prototype, wayfinder, code-review and pr from the mattpocock-skills plugin (not Claude Code's built-in /code-review), improve-codebase-architecture, setup-matt-pocock-skills) run inside the person's coordinator method: one-question grilling, a milestone on every issue they create, fan-out width, feature branches, who merges, where handoffs live. Use when one of those skills or its /command is about to run, or when an idea is being turned into a PRD, tickets and PRs, or issues are being triaged, in any project."
---

Matt Pocock's skills give the flow from idea to shipped PR. `coordinator-method` owns the queue, workers, merges and roadmap. This skill decides how the two fit: which of Matt's steps feeds which coordinator step, and where the person's rules change how a step runs. Model, effort and width come from `model-mix`, workflow shape from `smart-ultracode`, tracker commands from `roadmap-tracker`, the pre-merge gate from `merge-gate`. The person's rules and the project's AGENTS.md, CONTRIBUTING.md and branch protection win over Matt's text. This skill applies only while one of his skills runs; without them the person's skills work alone. `flow.md` maps each step to its lead skill and the person's skills it reads.

## 1. Adapt around his text, never inside it

- Load his skill from the `mattpocock-skills` plugin and follow it. Never edit, trim or paraphrase his skill files, and never paste a changed copy. A rule below goes before the step (one preface line when invoking) or after it (a fix such as `gh issue edit`).
- Anything here that his text does not say is a local addition: say so in one line when it changes what he asked for.
- His skills come from the plugin `mattpocock-skills` (marketplace `mattpocock`, version 1.3.1 checked 2026-10-07): `claude plugin marketplace add mattpocock/skills`, then `claude plugin install mattpocock-skills@mattpocock`. It ships skills only, no hooks or MCP servers. Remove older loose copies from `~/.claude/skills` (`to-prd`, `to-issues`, `diagnose`, `zoom-out` and same-named ones), or a `/name` may open the old text.
- Recognise the old names in repos set up earlier: `to-prd` is now `to-spec`, `to-issues` is `to-tickets`, `diagnose` is `diagnosing-bugs`, and the glossary `CONTEXT.md` is `GLOSSARY.md` (rename it and replace `docs/agents/domain.md` with the plugin's template, by PR). Read `flow.md` for the full map.
- Skills marked `disable-model-invocation` start only when the person types `/name`. Suggest the command once; do not rebuild the skill from memory.

## 2. Start in a repo

- A repo with no `## Agent skills` block in `CLAUDE.md` or `AGENTS.md` and no `docs/agents/` needs `/setup-matt-pocock-skills` first. The person types it. It writes the tracker, label and domain-doc settings, so land its files by PR, never on main.
- Read `docs/agents/triage-labels.md` for the real label strings. Queue meaning of each label: `roadmap-tracker` §5.
- Under a declared reliability cycle (`coordinator-method`) no new feature goes through grill, spec and tickets until the person lifts it.

## 3. Grilling

- Applies to `grill-me`, `grill-with-docs`, `grilling`, the "Quiz the user" step of `to-issues` and `to-tickets`, and the setup questions.
- Map the whole frontier first, then ask one question per message with options, your recommendation, and how many remain. Do this even where his text asks a whole round of questions.
- Anything the codebase, the project rules or earlier answers settle is decided, not asked.

## 4. Spec and tickets

- `to-prd` and `to-spec` publish the parent issue; `to-issues` and `to-tickets` publish the children. Show the breakdown and wait for the person's ok, as his text says.
- Every issue they create gets a milestone, added right after creation: `gh issue edit N --milestone "<name>"`. The milestone is the current feature's; create it first with `roadmap-tracker`'s commands. Do not hook or rewrite his `gh issue create`.
- When the parent is the feature in progress, and a pin slot is free (`roadmap-tracker` §2), pin it: `gh issue pin N`; unpin it when its milestone closes: `gh issue unpin N`.
- Acceptance criteria are as wide as the requirement: when the description says "every" or "all", the checkbox says "every" too and names the check that proves it (lint, test, inventory table). Examples go in the description, never as the criterion's whole list. Workers and reviewers work from the checkboxes: in one run "every visible element" became a checkbox listing four controls, and the loading and error states slipped through.
- Hot files (§8): his quiz has the person approve each edge, and asks that it gate genuinely. Propose a blocked-by edge between tickets that touch the same hot file, so the merge order is set before a conflict (`merge-gate` pairwise check). If the person declines it, keep his edges and note the order in the roadmap issue.
- A follow-up deferred by a review is created with a category label, a state label and a milestone: `gh issue create --milestone "<name>" --label "<labels>"`. A new feature is `needs-triage` (`roadmap-tracker` §5), not `ready-for-agent`.
- His text labels every slice for an AFK agent unless told otherwise. Tell it: HITL slices get `ready-for-human`.
- Blocked-by may also become real links (optional, `roadmap-tracker` §6). Check the round: `gh issue list --search "no:milestone" --state open` is empty.

## 5. Build

- One implementation thread at a time (`coordinator-method`). A cloud worker takes one ticket; its prompt is the task, the Worker brief and the project rules. Cloud sessions load the skills enabled on the claude.ai account, not `~/.claude/skills` (research claim, check it in the first session): put the steps the worker needs in its prompt verbatim.
- `implement` commits on the current branch, so create the feature branch first, named per `git-conventions` with the issue number (`feature/issue-42-short-slug`). Check `git branch --show-current` before the first commit. Never main.
- `tdd` writes the failing test first. It does not cover assertions changed later (review fixes, refactors) or the evidence in the PR: `assertions-go-red` does, and its mutation table goes in the Evidence section that `pr` writes.
- Targeted tests while building; the full suite runs in CI and cloud, not on this machine. A fix is a new commit, never `--amend` or `--force`.
- `implement-spec` and any fan-out of implementers: run the budget check first; width: one implementer unless the budget is green and the slices touch disjoint areas; then at most the Parallel cloud sessions column of today's `model-mix` profile (Ultra: 3, otherwise 1), or more only when the person asks (`coordinator-method`). Never the Agents per workflow run column. The rest of the frontier waits. Say the width and model in the invocation: implementers per `model-mix` (Sonnet high, explicit `model`). Unpinned subagents inherit the session's Opus.
- Its merger subagent may merge implementer branches into the integration branch only. The integration branch is one feature branch and goes to main as one PR.

## 6. Review, PR, merge

- `code-review` (upstream, inside `implement`) is the implementer's pre-PR check: its reviewers run on Opus high per `model-mix`. It runs first. Its report prints only in the session, so post it as a PR comment with the head sha (local addition). The `merge-gate` review reads that comment and covers the rest: security, hard rules, test evidence, the merged result. It redoes Standards or Spec only for commits after that sha. Its Standards axis takes `clean-code` as a standards source: block rules are hard violations there, over its smell baseline.
- `pr` writes the body. Title in the `git-conventions` commit format; `Closes #N` in the body for tickets the PR completes; UI PRs carry before/after screenshots of every view and state, taken from the PR head sha (sha in the file names, by a committed command when the project has one), and wait for the person's ok on that sha.
- The coordinator merges, with `coordinator-method`'s rule (`gh pr merge N --merge --match-head-commit <sha> --subject ...`), after `merge-gate`. No merger subagent merges into main, and no auto-merge. After the merge: close the tickets, update the roadmap.

## 7. On the side

- `triage`: keep his disclaimer line at the top of each comment. On a repo the person does not own, show each comment or label change and post it only after the person's ok on that item; with no ok, nothing is written there (`roadmap-tracker`). An issue it creates or moves to `ready-for-agent` without a milestone gets one.
- `diagnose` or `diagnosing-bugs`: a worker thread. The fix PR carries the regression test, and `git grep "\[DEBUG-"` finds nothing before the commit. A worker stuck after two attempts runs it and builds its red loop before anyone asks for a stronger second opinion (`model-mix`, Advisor).
- `retro`: each candidate the person accepts becomes a ticket (milestone, labels) or a line in one of the person's skills through `skill-audit` §7. None stays a loose note.
- `prototype`: throwaway, never merged. Branch `chore/<n>-prototype-<name>` (his `prototype/` prefix is not a Conventional Branch type); decisions go into the spec or an ADR. A UI prototype decides layout only.
- `improve-codebase-architecture`: ideas go to grilling, then `coordinator-method`'s refactor rule: plan, wait for the ok, one PR per responsibility, no behavior change.
- `handoff`: his document stays in the OS temp dir, secrets redacted, not committed. The coordinator's own handoff to a fresh coordinator is `coordinator-method`'s scratch state file.
- `wayfinder`: the map issue and every child ticket get a milestone too.

## 8. Facts the project gives

The skills hold no project facts. A project states four in its AGENTS.md (block in the README, "In a new project"): the check command, the shared lock file (`shared-machine-checks`), the hot files, and the label strings. His setup already writes the labels to `docs/agents/triage-labels.md`. If one is missing, ask the person once and propose the line by PR.

**Why:** the person's coordinator method assumes one queue, one merge path and a milestone on every issue. His skills assume a single maintainer on the current branch with an open fan-out.

## Done when

- Each Matt step ran from his unchanged text, with the rules above stated before it or applied after it.
- Every issue created has a milestone, HITL slices are `ready-for-human`, and no open issue lacks a milestone.
- All commits are on a feature branch, none on main, and the coordinator merged each PR after review.
- Fan-out stayed within today's width, with the model named per spawn.
