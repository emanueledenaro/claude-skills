---
name: matt-bridge
description: "How Matt Pocock's skills (grill-me, grill-with-docs, to-prd or to-spec, to-issues or to-tickets, tdd, implement, implement-spec, triage, diagnose or diagnosing-bugs, handoff, prototype, wayfinder, code-review and pr from the mattpocock-skills plugin (not Claude Code's built-in /code-review), improve-codebase-architecture, setup-matt-pocock-skills) run inside the person's coordinator method: one-question grilling, a milestone on every issue they create, fan-out width, feature branches, who merges, where handoffs live. Use when one of those skills or its /command is about to run, or when an idea is being turned into a PRD, tickets and PRs, or issues are being triaged, in any project."
---

Matt Pocock's skills give the flow from idea to shipped PR. `coordinator-method` owns the queue, workers, merges and roadmap. This skill decides how the two fit: which of Matt's steps feeds which coordinator step, and where the person's rules change how a step runs. Model, effort and width come from `model-mix`, workflow shape from `smart-ultracode`, tracker commands from `roadmap-tracker`, the pre-merge gate from `merge-gate`. The person's rules and the project's AGENTS.md, CONTRIBUTING.md and branch protection win over Matt's text.

## 1. Adapt around his text, never inside it

- Load his skill as installed or upstream and follow it. Never edit, trim or paraphrase his skill files, and never paste a changed copy. A rule below goes before the step (one preface line when invoking) or after it (a fix such as `gh issue edit`).
- Anything here that his text does not say is a local addition: say so in one line when it changes what he asked for.
- Recognise both name sets. The installed copies are older than upstream: `to-prd`, `to-issues`, `diagnose`, `CONTEXT.md`. Upstream (plugin `mattpocock-skills` 1.3.1, unverified here, from earlier notes) has `to-spec`, `to-tickets`, `diagnosing-bugs`, `GLOSSARY.md`, plus `implement`, `implement-spec`, `grilling`, `code-review`, `pr`, `wayfinder`, `ask-matt`. Read `flow.md` for the full map.
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
- His text labels every slice for an AFK agent unless told otherwise. Tell it: HITL slices get `ready-for-human`.
- Blocked-by may also become real links (optional, `roadmap-tracker` §6). Check the round: `gh issue list --search "no:milestone" --state open` is empty.

## 5. Build

- One implementation thread at a time (`coordinator-method`). A cloud worker takes one ticket; its prompt is the task, the Worker brief and the project rules. Cloud sessions load the skills enabled on the claude.ai account, not `~/.claude/skills` (research claim, check it in the first session): put the steps the worker needs in its prompt verbatim.
- `implement` commits on the current branch, so create the feature branch first: Conventional Branch, lowercase, with the issue number (`feature/42-short-slug`). Check `git branch --show-current` before the first commit. Never main.
- Targeted tests while building; the full suite runs in CI and cloud, not on this machine. A fix is a new commit, never `--amend` or `--force`.
- `implement-spec` and any fan-out of implementers: run the budget check first; width: one implementer unless the budget is green and the slices touch disjoint areas; then at most the Parallel cloud sessions column of today's `model-mix` profile (Max 20x: 3, otherwise 1), or more only when the person asks (`coordinator-method`). Never the Agents per workflow run column. The rest of the frontier waits. Say the width and model in the invocation: implementers per `model-mix` (Sonnet high, explicit `model`). Unpinned subagents inherit the session's Opus.
- Its merger subagent may merge implementer branches into the integration branch only. The integration branch is one feature branch and goes to main as one PR.

## 6. Review, PR, merge

- `code-review` (upstream, inside `implement`) is the implementer's pre-PR check: its reviewers run on Opus high per `model-mix`. It does not replace `merge-gate`: the gate still reviews the PR head sha, sized by the diff.
- `pr` writes the body. Title in Conventional Commits form; `Closes #N` in the body for tickets the PR completes; UI PRs carry before/after screenshots and wait for the person's ok.
- The coordinator merges, with `coordinator-method`'s rule (`gh pr merge N --merge --match-head-commit <sha> --subject ...`), after `merge-gate`. No merger subagent merges into main, and no auto-merge. After the merge: close the tickets, update the roadmap.

## 7. On the side

- `triage`: keep his disclaimer line at the top of each comment. On a repo the person does not own, show each comment or label change and post it only after the person's ok on that item; with no ok, nothing is written there (`roadmap-tracker`). An issue it creates or moves to `ready-for-agent` without a milestone gets one.
- `diagnose` or `diagnosing-bugs`: a worker thread. The fix PR carries the regression test, and `git grep "\[DEBUG-"` finds nothing before the commit.
- `prototype`: throwaway, never merged. Branch `chore/<n>-prototype-<name>` (his `prototype/` prefix is not a Conventional Branch type); decisions go into the spec or an ADR. A UI prototype decides layout only.
- `improve-codebase-architecture`: ideas go to grilling, then `coordinator-method`'s refactor rule: plan, wait for the ok, one PR per responsibility, no behavior change.
- `handoff`: his document stays in the OS temp dir, secrets redacted, not committed. The coordinator's own handoff to a fresh coordinator is `coordinator-method`'s scratch state file.
- `wayfinder`: the map issue and every child ticket get a milestone too.

**Why:** the person's coordinator method assumes one queue, one merge path and a milestone on every issue. His skills assume a single maintainer on the current branch with an open fan-out.

## Done when

- Each Matt step ran from his unchanged text, with the rules above stated before it or applied after it.
- Every issue created has a milestone, HITL slices are `ready-for-human`, and no open issue lacks a milestone.
- All commits are on a feature branch, none on main, and the coordinator merged each PR after review.
- Fan-out stayed within today's width, with the model named per spawn.
