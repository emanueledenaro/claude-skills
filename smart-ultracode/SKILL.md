---
name: smart-ultracode
description: "Ultracode (multi-agent Workflow) judgement: when to orchestrate, how wide, which shape, and what to believe afterwards. Use before writing any Workflow script, in any project: when a task spans many independent items, its findings need an independent check, the design space is wide, or the size of the work is unknown."
---

Ultracode buys correctness through independence: parallel readers, refuters who never saw the author's reasoning, a critic who looks for what is missing. It costs usage, so spend it where independence changes the answer. This skill decides when, how much, and what to believe. The script API lives in `workflow-authoring`, and model and effort per stage live in `model-mix`. Load both before writing a script.

## 1. Gate: pick the cheapest rung that gives a correct answer

- Solo: conversational turns, a trivial or one-file edit, a fact already verified this session, work you can finish inline in fewer tokens than the prompts would cost.
- One Agent call: a single deep read or one isolated task.
- Workflow: about 4 or more independent items, or a result that only counts after an independent check (findings, security, a wide design space).

When unsure, take the lower rung and escalate only if its result is thin. Today's profile in `model-mix`, after any yellow step down, caps the rung: Pro means a workflow only when the person asks, Solo means no workflow. Ultracode lifts the Large-workflow warning and the Agent-tool concurrency cap and can raise effort to xhigh, never the profile.

## 2. Scout inline and check what is in flight

Build the work-list yourself (grep, ls, git, `gh`) until it names concrete items with paths. A workflow fans out over a list you already have. It is the wrong tool for finding a list you could find in two minutes.

Then list what is in flight: running agents, cloud sessions, open PRs and branches for the same scope. Remove delegated items from the work-list and read their owners' results when they land. The fleet size is the remaining list: N items, at most N agents, and never more than the width of today's profile in `model-mix`. Group items per agent to fit the width, and log any item the width leaves out.

## 3. One workflow per phase

Phases are understand, design, implement, review. Each one is its own workflow. Read its whole result before writing the next script, because the next prompt carries those findings forward and a wrong finding gets caught here. Use only the phases the task needs: a bug with a known cause goes straight to implement and review.

## 4. Pick the shape

- Pipeline by default: each item moves through its stages as soon as it is ready.
- Barrier only for a cross-item need: dedup, ranking, early exit.
- Adversarial verify for every finding: a fresh agent gets the claim and the repo, never the author's reasoning, and tries to refute it with evidence (file and line, command and output). Give it one finding and the cited lines, so the strong model reads little. Below today's Max 20x profile, batch: one verifier per area or file with all its findings, still blind to the authors' reasoning. Security findings keep one Opus high verifier each on every profile, in waves that fit the width; on Solo the main session verifies them.
- Judge panel for a wide design space: independent proposals, scored against criteria you write before any proposal exists.
- Loop until dry for discovery of unknown size: repeat until a round adds nothing new, with a round cap and dedup per round.
- Completeness critic last: one agent gets the original goal, the work-list and the results, and names what is missing, skipped or assumed. Its gaps go into one more round or into the report.

A read-only audit needs fan-out plus verify. A risky change needs implement, verify and critic.

## 5. Limits

- Run the budget check in `model-mix` before each workflow and again between phases, and follow its color. Never launch a run whose projected cost, from the run-cost note, would push weekly use past 100 − reserve.
- Agents are read-only. Grant writes only to implement stages, and isolate them in worktrees only when they write in parallel to overlapping paths.
- Builds, full test suites, dev servers and app launches run once, in the main session, after the merge. Put them inside an agent only when that agent's task is the run itself.

## 6. Report honestly

- A workflow's output is a lead. It becomes a fact after a verify stage it survived, or after a check you ran yourself (read the cited lines, run the command).
- Log every drop a bounded run makes: items over the cap, failed or timed-out agents, rounds cut short, files left unread.
- Sort the final answer into confirmed, refuted (with the evidence), unverified and not covered. Add fleet size, models used and the weekly points the run cost (usage read before and after).

## Done when

- Every item on the scouted work-list is confirmed, refuted, dropped with a logged reason, or excluded as already in flight.
- Every finding in the answer survived verify or is labelled unverified.
- The critic ran and found nothing new, or its gaps are handled or reported. For a list under about 4 items, the answer says why the critic was skipped.
- You read every phase's result, no phase ran twice over the same items, and the next action is a solo follow-up or the summary.
