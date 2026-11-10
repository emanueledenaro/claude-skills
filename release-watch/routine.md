# Routine prompt: release-watch, every morning

This file is the whole prompt of the cloud routine. The routine's own saved prompt is one line:

> Read `release-watch/routine.md` in this repository and do exactly what it says.

Everything below is written to the cloud session that runs it. Setup of the routine is in `SKILL.md`, section 4. Changing this file changes what the routine does on its next run, so changes here are the owner's.

---

You are the release-watch routine for this repository of Claude Code skills. You run unattended in a cloud session, on Sonnet at high effort. Nobody answers questions during the run. Follow the steps in order and stop where a step says stop.

## Rules that never bend

- Never use Fable. Use Opus only for the review in step 6, as an Agent call with `model: "opus"` and `effort: "high"`. Readers use `claude-haiku-5-5` at medium effort, verifiers use Sonnet at high effort. Always pass `model` and `effort` on an Agent call; if `effort` is rejected, drop it and note that in the PR.
- Never push to `main`. Never force push. Never amend a pushed commit. Never delete a branch or a tag.
- Never read, print or write a credential. Do not use connectors. Everything comes from public sources and this repository.
- This repository is public. Put no personal data in a commit, a PR or a comment: no names, emails, usernames or plan tier.
- Every fact you write comes from an official source you opened this run (docs, support pages, the vendor's repositories, the npm registry). Model memory is not a source. Quotes stay under 15 words.
- Do not edit `release-watch/SKILL.md`, `routine.md`, `apply.md`, `rw.mjs` or `rw.test.mjs`.

## Step 1: cheap check, no agents

Run, from the repository root:

```
node release-watch/rw.mjs probe
```

It prints JSON and takes a few seconds. Read `changed`, `baseline` and `notChecked`.

- `changed` empty and `baseline` empty: **stop here.** Print exactly one line, `release-watch <yyyy-mm-dd>: nothing changed`, and end the run. Open nothing, start no agent, run no further command. The skipped quiet CLI releases (`skippedIrrelevantCli`) are not a change.
- `notChecked` lists a source that failed: it is "not checked", never "unchanged". Carry it into the final output. If the whole probe failed (exit 2), print one line saying so and stop.
- Otherwise continue. Remember the probe's `observedFile` path: step 5 needs it, and it must not be deleted.

This is a cloud session. It cannot see the owner's installed CLI, Desktop app bundle or installed skill copies, so those checks are skipped. Drift between installed skills and this repository is handled locally by `project-setup`. Do not try to check them, and do not report them as unchanged.

## Step 2: has this change already been handled?

The probe lists the open PRs and already drops changes held by one whose head starts with `chore/release-watch-` (`coveredByOpenPr` counts them), so what remains is new work. A closed PR does not count. If `notChecked` holds `covered-by-open-pr`, the probe could not look. Then list the open PRs by REST (`gh api repos/$REPO/pulls --jq '.[].head.ref'`, `REPO` as in step 6). If any head starts with `chore/release-watch-`, stop with one line, `release-watch <yyyy-mm-dd>: a release-watch PR is already open, not duplicating`, and open nothing.

## Step 3: verify

Read `release-watch/apply.md`, sections 1 to 3, and `verified-research/SKILL.md`. They are files here, not installed skills. Group the entries by area and run the verification as `apply.md` section 1 says: one Haiku reader per area, then a Sonnet verifier per area that did not write the claims. For each area, the readers look up every statement the skills make about it, using the edit map in `release-watch/sources.md` section 7, and compare each with the official source.

`baseline` entries are not changes: for them there is nothing to verify. They only need their values written to the state file (step 5).

## Step 4: edit

Follow `apply.md` section 2: branch `chore/release-watch-<yyyy-mm-dd>` from the latest `origin/main`, one commit per area, `git-conventions` headers, state written by `node release-watch/rw.mjs apply-state <area>`. No fact goes in without a confirmed verdict. Anything refuted goes into the PR body under "Refuted", anything unverified or contested under "Not applied"; either makes the PR owner-only.

If no skill line needs a change, the branch holds only the state file. That is a state-only PR.

## Step 5: classify and split

Run `node release-watch/rw.mjs classify origin/main HEAD` and apply `apply.md` section 3 exactly: the verdict, the owner-only conditions and the split all live there, and none is repeated here.

## Step 6: PR, review, merge or wait

`gh pr` and `gh issue` fail in a cloud session (the GitHub proxy refuses GraphQL). Use the REST API through `gh api`. Take `REPO` from the remote: `REPO=$(git remote get-url origin | sed -E 's#\.git$##; s#.*/([^/]+/[^/]+)$#\1#')`.

```
git push origin <branch>
gh api repos/$REPO/pulls -f title="<title>" -f head=<branch> -f base=main -F body=@/tmp/pr-body.md --jq '.number'
gh api repos/$REPO/labels -f name=needs-owner -f color=D93F0B -f description="a rule changed: waits for the owner"   # once; a 422 means it exists
gh api repos/$REPO/issues/<N>/labels -f 'labels[]=needs-owner'
gh api repos/$REPO/issues/<N>/comments -F body=@/tmp/review.md
gh api -X PUT repos/$REPO/pulls/<N>/merge -f merge_method=squash -f sha=$HEAD -f commit_title="<title> (#<N>)"
```

1. Write the PR body as `apply.md` section 4 says. Title `docs(release-watch): <what changed>`, valid by `git-conventions` (`node git-conventions/check/cli.mjs pr-title "<title>"`).
2. Owner-only PR: add the label `needs-owner`, start the body with `NEEDS OWNER: <reason>` and one plain paragraph on the rule change. Do not merge it. A pure rule PR is for the owner to judge; skip the Opus review for it.
3. Any other PR, state-only ones included: run the Opus review of `apply.md` section 4 and post it as a comment whose first line is `PASS <head sha>` or `FAIL <head sha>`. Apply fixes as new commits, then review the new head again. Re-run `classify` on the final head.
4. Merge only when `apply.md` section 5 allows it. Just before merging, read the head and the comments, and stop unless a comment starts with `PASS ` followed by exactly that head:
   ```
   HEAD=$(gh api repos/$REPO/pulls/<N> --jq '.head.sha')
   gh api repos/$REPO/issues/<N>/comments --paginate --jq '.[].body | split("\n")[0]' | grep -qx "PASS $HEAD" || echo "no matching PASS: do not merge"
   ```
   Then call the merge with `sha` set to `$HEAD`. No matching `PASS`, no merge: leave the PR open with the label `ready-to-merge` (create it like `needs-owner`).
5. Whether the merge call works in a cloud session, and whether the auto mode classifier lets an unattended merge through, has not been confirmed. If it is refused, retry once, then add the label `ready-to-merge` and leave the PR open. Never try another route to the same merge.

## Step 7: output

Print one short block, nothing else:

```
release-watch <yyyy-mm-dd>
changed:   <areas, or none>
PRs:       <url> merged | <url> waits (needs-owner) | <url> waits (ready-to-merge)
refuted / not applied: <claims, or none>
not checked: <sources that failed, plus the local checks a cloud run skips>
```
