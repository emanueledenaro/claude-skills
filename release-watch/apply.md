# Applying a change: verify, edit, PR, review, merge or wait

Read by `release-watch` (section 3) and by `routine.md` when the probe reports a change. The probe and the fact/rule test are `rw.mjs`; this file is what happens around them. The project's own rules, `git-conventions`, `merge-gate` and `model-mix` apply except where this file names an exception, and the exceptions are the owner's decisions.

## 1. Verify each changed fact

- Group the probe's `changed` entries by area: `cli`, `models`, `limits`, `mods`, `upstream`. An area sweep, not a patch: read every statement the skills make about that area (find them with the edit map in `sources.md`, section 7), and check all of them against the source, not only the one that moved. A new model can change a price ratio that sits three paragraphs away.
- Method is `verified-research`: official sources only, a quote under 15 words per claim, the source's own date, the day read, claims sorted into confirmed, refuted and unverified. Read it from the repo (`verified-research/SKILL.md`); in a cloud session it is a file, not an installed skill.
- Stages, one fleet per run, at most 4 readers and 4 verifiers:
  - readers: `claude-haiku-5-5` at medium effort, one per changed area, read-only;
  - verifiers: Sonnet at high effort, a different agent from the reader, given the claims and the sources but not the reader's reasoning, told to refute. This is the owner's call: Opus is spent only on the review in section 4. The Opus review re-opens every source, so each claim is checked by two models.
  - Pass `model` and `effort` on every Agent call. If the call rejects `effort`, drop it and say so in the PR body.
- A claim counts only when a verifier confirmed it. Refuted claims are dropped. An unverified or contested claim is not written into any skill: it goes into the PR body under "Not applied", and the PR waits for the owner (section 3).

## 2. Write the edits

- Branch from the latest `origin/main`: `chore/release-watch-<yyyy-mm-dd>`. The owner asked for `docs/release-watch-<yyyy-mm-dd>`, but `git-conventions` rejects the `docs/` type, so the branch uses `chore/`. Never reuse a name; if it exists, add `-2`.
- Never switch branches in a clone that live skills are symlinked into. Locally use `git worktree add ../claude-skills-release-watch-<date> -b <branch> origin/main`; a cloud session has its own clone and can check out the branch.
- Edit every affected skill and `README.md` (the README table summarizes skills; keep it true). Change only what a confirmed claim requires. Keep each skill's own layout, dating and "unverified" marks: update a "read on" or "checked" date together with the fact it belongs to.
- Do not edit "tested with" or "checked on" claims about a Claude Code version unless you ran that version. A version floor ("from v2.1.293") is a fact; "tested with 2.1.293" is the author's own test.
- Never edit `release-watch/SKILL.md`, `routine.md`, `apply.md`, `rw.mjs` or `rw.test.mjs` from a run. A change there is the owner's.
- One commit per area, `docs(<skill>): <what changed>` or `chore(release-watch): <what changed>`, by `git-conventions`. Check every header with `node git-conventions/check/cli.mjs commit-range origin/main HEAD`.
- Last commit of the area: `node release-watch/rw.mjs apply-state <area>` writes the probed values into `release-watch/state.json`, so the PR is what moves the memory. State advances for an area only inside a PR that processed it. A quiet CLI release with no relevant changelog line leaves the state alone and opens nothing.

## 3. Fact or rule: the split

Run `node release-watch/rw.mjs classify origin/main HEAD`. It prints `FACT` (exit 0) or `RULE` (exit 10) with the reasons. It is mechanical on purpose: no judgment call, and when in doubt it says `RULE`.

A diff is FACT only if every changed file is a `.md` file or `release-watch/state.json`, and every changed line is replaced by a line that differs only in these tokens:

- version numbers (`2.1.293`, `v2.1.293`, `Haiku 5.5` as the version after a family name);
- dates (`2026-11-09`), including release, retirement and "read on" dates;
- model ids (`claude-haiku-5-5`), with the family kept visible, so swapping Haiku for Sonnet is never a fact;
- prices (`$100`), price ratios (`5×`, `1/20`) and rate numbers with a unit (`100 per hour`, `5-hour`, `72 hours`);
- URLs, and, on a line that holds a source URL, a double-quoted quote of that source.

Everything else is RULE: a line added or removed, a changed table cell outside those tokens, any percentage or bare number (reserves, margins, widths, `100K tokens`), a changed `always`, `never`, `only`, `must` or `at most`, a swapped model family or effort, a new or removed step or row, a moved line, a new or deleted file, any file that is not `.md` or the state file, and the four protected files above. If you believe a RULE verdict is really a fact, it is still a RULE.

A PR is also owner-only, whatever `classify` says, when any of these is true: it touches the `upstream` area (Matt's skills: `matt-bridge` adapts around his text, so the owner decides), it has anything under "Not applied" (unverified, contested), or the Opus review left a finding open.

Splitting. Keep one commit per area. If the run produced both fact and rule commits, try to split: make two branches from `origin/main`, `chore/release-watch-<date>` for the FACT commits and `chore/release-watch-<date>-rule` for the RULE commits, and `git cherry-pick` each commit onto its branch. If any cherry-pick conflicts, or a commit is itself mixed, do not split: one PR, labelled owner-only. Run `classify` again on each branch; the branch decides, not the commit message.

## 4. Pull request and Opus review

- Push the branch, never `main`, never with force. Open the PR against `main` with title `docs(release-watch): <what changed>` (a valid `git-conventions` title) and a body of four parts: what changed in the sources (old to new, one line each, with the URL and the day read); the edits (file and line); "Not applied" (unverified or refuted, with the check that would settle it); the `classify` output. State-only PRs (only `state.json` changed) say so.
- A PR that is owner-only gets the label `needs-owner` (create it if missing: `gh label create needs-owner --color D93F0B` locally, or the REST call in `routine.md` in the cloud) and a first body line `NEEDS OWNER: rule change` or `NEEDS OWNER: <reason>`, followed by one plain paragraph that says what rule changes and what the old and new behavior are. No jargon, no diff.
- Review: one Agent call, `model: "opus"`, `effort: "high"`, read-only, per `model-mix`. It gets the diff, the claims and their sources. Its brief: re-open every cited source, confirm each changed line against it, check that no edit changed a rule while claiming to be a fact, check that no line outside the claims moved, and check the commit headers. Post its verdict as one PR comment with the head sha.
- State-only PRs skip the Opus review; `classify` and the probe check are enough.
- Apply the review's findings as new commits (no amend, no force), then run the review once more on the new commits only. Two fix rounds at most. If a serious finding remains, the PR becomes owner-only.
- Before merging, re-run `node release-watch/rw.mjs classify origin/main HEAD` on the final head. The verdict on the final head is the one that counts.

## 5. Merge or wait

- FACT, not owner-only, review passed, final-head `classify` is FACT: merge it yourself. Squash, pinned to the reviewed head, subject = the PR title followed by the PR number. Locally: `gh pr merge N --squash --match-head-commit <sha> --subject "<title> (#N)"`. In a cloud session use the REST call from `routine.md`. Squash is the owner's choice for these PRs; `git-conventions` otherwise defaults to a merge commit. The merge is not blocked on a person.
- Owner-only: do not merge, do not ask. Leave it open with the label and the summary paragraph. The next run sees its state in `chore/release-watch-*` and opens nothing for the same change.
- A merge that is refused (head moved, a classifier, a permission): apply `merge-gate` section 8: retry once after a fresh review of anything new, then label the PR `ready-to-merge` and leave it for the owner. Never work around a refusal.
- After the merge, confirm with the PR state and read `release-watch/state.json` on `main`.

## 6. Output

The run ends with one short block: areas changed, PRs opened with their URL, which merged and which wait (`needs-owner`, `ready-to-merge`), what was not checked and why. A quiet run prints one line instead (see `routine.md`).
