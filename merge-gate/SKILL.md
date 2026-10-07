---
name: merge-gate
description: "The pre-merge gate for a pull request: how big a review the diff gets, how verified findings are applied, how the branch is realigned with main, how the merge is run, what is closed or synced afterwards, and what to do when an auto-mode classifier refuses the merge as unreviewed. Use when a PR is ready to merge, a worker reports a PR done, CI turns green on an approved PR, the person says to merge, review or ship a PR, or a merge was refused, in any project."
---

What happens between "the worker says the PR is done" and "main has it". The coordinator runs the gate and presses merge itself (`coordinator-method` holds the merge rule and the git safety rules: not repeated here). Model, effort and width come from `model-mix`, the workflow shape from `smart-ultracode`, ticket and roadmap commands from `roadmap-tracker`. The project's AGENTS.md, CONTRIBUTING.md and branch protection win over this skill. Commands are in `commands.md`; review briefs and lenses are in `review.md`.

## 1. Ready?

- Read the PR yourself (`commands.md`, "Read the PR"). A worker's "all green" is a claim: read `gh pr checks N --required`.
- Draft, failing, unfinished or conflicting: send it back to its worker. Ask the person before merging anything unfinished or failing.
- Branch protection or a project rule that needs a human approval: stop and say so. Never `--admin`, `--auto`, `--squash` or `--rebase`.
- Dependabot minor or patch: read the diff and the version change yourself and merge on green, as `coordinator-method` says. A major goes to a dedicated thread, then through this gate.

## 2. Size the review

Run the budget check in `model-mix` first. Size by the diff, not by the worker's confidence:

- **Small:** under about 300 changed lines in at most 5 files, nothing security-related. One read-only Agent call, `model: "opus"`, high effort (Pro: medium; Solo: the main session reads the diff).
- **Large, or security:** a review workflow: lenses, adversarial verify per serious finding, then a completeness critic (`smart-ultracode`). Security means consents, permissions, secrets, auth, sandboxing, tool-call guards: those PRs take this path at any size.
- The thresholds are starting defaults, not measured. When unsure take the larger path.
- A red budget does not skip the review: finishing open work continues, with the final review in the main session (`model-mix`). A lower profile narrows the width. On Pro the large path is a workflow only if the person asks; otherwise use one Opus Agent call per lens group, then the verifiers. On Solo the main session reviews and verifies (`smart-ultracode` §1, §4).

## 3. Run the review

- The reviewer gets the repo at the PR head sha in a short-path worktree, the diff, the ticket's acceptance criteria and the project rules. The PR body and the worker's report are claims to test. Brief, lenses and finding format: `review.md`.
- A finding counts only after a verifier, who sees the claim and the cited lines but not the author's reasoning, failed to refute it with evidence (file and line, command and output), small path included (`review.md`).
- Leave one PR comment: reviewed head sha, findings verified, applied or dropped, checks read. It is the record the next steps and a later reader cite.
- Builds and full suites run in CI, not in the review (`coordinator-method`).

## 4. Apply findings

- Send verified findings to the worker that owns the PR as one message: file and line, evidence, expected change. If the worker is gone, start a fix thread. Fixes are new commits: no amend, no force.
- A serious finding (wrong behavior, security, data loss, removed or weakened tests, a broken project rule, a `clean-code` block rule) must be fixed before the merge. A minor one is fixed in the same round if cheap, otherwise it becomes a ticket with a milestone.
- After fixes, one delta review of the new commits only (one Opus high agent, same brief). Two fix rounds at most; if serious findings remain after the second, stop and tell the person.
- Refuted and unverified findings are not sent to the worker. Note them in the PR comment.

## 5. Hold for the person: UI

- A PR that draws or changes UI waits for the person's ok on screenshots of every touched view (`coordinator-method`, UI changes). The review looks for model-facing text leaking into the interface and for removed components or tests.

## 6. Realign and check

- Merge the latest main into the branch with `git merge -m "chore: merge origin/main into <branch>" origin/main`, then push. Not `gh pr update-branch`: it takes no message flag (gh 2.83.2). If the merge stops on conflicts, run `git merge --abort` and send the PR back to its worker to merge main and resolve, keeping both sides' behavior and listing the conflicts in the PR; only a clean merge is the coordinator's (a mechanical step).
- A merge commit from a worker that resolved conflicts is new code: give it a delta review. A clean merge needs none.
- Rerun the required checks on the result. Arm a `Monitor` watch on them; a watch ends at its deadline (5 minutes by default, 30 at most), so re-arm it if checks are still pending. Then read the final state with `gh pr checks N --required`.
- Merge only if main has not moved since: fetch, then `git merge-base --is-ancestor origin/main <sha>`. Otherwise realign again. Never merge past a failing or pending required check.

## 7. Merge

- Run `gh pr merge N --merge --match-head-commit <sha> --subject "<type>(scope): ... (#N)"`, where `<sha>` is the head the review and the checks covered. The person is not asked first.
- If it rejects because the head moved, a commit landed after the review: review it, realign, retry. Never drop `--match-head-commit`.
- Confirm with `gh pr view N --json state,mergeCommit` and check the subject.

## 8. If the merge is refused as unreviewed

An auto-mode classifier may refuse the merge as a "merge without review". What it checks is not documented (unverified); it was seen in practice, and the retry below is the person's rule, not a promise it passes.

1. If no review ran on this head sha, run it (sections 2 to 4).
2. Retry once. In the message text and in the command's description say: review done, reviewed sha, findings verified and applied, required checks green.
3. Refused again: stop and hand the merge to the person with the PR URL, the sha, the review summary and the exact command (`commands.md`, "Refusal handoff"). This is the one case where the person merges.
4. Never work around it: no other path to the same merge (`gh api`, the web page, a subagent, auto-merge, `--admin`), no rewording to slip past, no change to permission modes or settings. Unattended, park the PR as an item for the person in the scratch state file (`overnight`) and carry on with other work.

## 9. After the merge

- Read main's CI and the failing test itself, then launch what the merge unblocks and rebuild the local test build (`coordinator-method`, every round).
- Close the tickets the PR completes with a comment naming it, and update the roadmap: `roadmap-tracker`.
- Close each superseded PR with a comment naming the PR that landed it (`commands.md`). First check it holds nothing unique: a unique part goes back to its worker to rebase on the new main, or becomes a ticket.
- When the repo is a skills repo, sync the installed copies from the merged main (`commands.md`, "Sync installed copies") and say which folders changed.

## Done when

- Every PR merged has a review sized by its diff, with the reviewed sha in a PR comment, and the merge used that same sha.
- Every serious finding was verified and fixed, or the merge waited for the person.
- Required checks were green on the realigned head and main had not moved.
- UI PRs merged only after the person's ok on screenshots.
- Tickets, roadmap, superseded PRs and installed copies are done, or listed as open.
- A refused merge was retried once and then handed over, never bypassed.
