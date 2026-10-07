# Gate commands

Commands for `merge-gate`. Replace `N` (PR number), `M` (another PR), `<sha>`, `<branch>`. Both Git Bash and PowerShell run these; keep subjects in double quotes. Checked against gh 2.83.2. For `gh api` paths and long Windows paths see `windows-ops`.

## Read the PR

```
gh pr view N --json number,title,isDraft,headRefName,headRefOid,baseRefName,additions,deletions,changedFiles,mergeable,mergeStateStatus,milestone,closingIssuesReferences,files
gh pr checks N --required
gh pr checks N --json name,bucket,state
```

- `headRefOid` is the sha every later step cites. Re-read it before the merge.
- `mergeStateStatus` was seen as `CLEAN` (nothing blocks) and `BLOCKED` (a rule blocks, for example a missing required review or check). Read why before anything else.
- Size for section 2: `changedFiles` and `additions + deletions`.
- `--required` with no required checks configured is untested: if it prints nothing useful, run `gh pr checks N` and read what the project's CONTRIBUTING.md calls required.
- `bucket` is `pass`, `fail`, `pending`, `skipping` or `cancel`.

## Review worktree

```
git fetch origin pull/N/head
git worktree add ../pr-N FETCH_HEAD
```

Keep the path short (`windows-ops`). Remove it when the gate ends: `git worktree remove ../pr-N`. The reviewer reads the diff with `gh pr diff N`, or `gh pr diff N --name-only` for the file list.

## Realign

In a clean checkout of the PR branch:

```
git fetch origin
git merge -m "chore: merge origin/main into <branch>" origin/main
git push origin <branch>
```

Before the merge, with a fresh fetch, this exits 0 when main is already inside the head:

```
git fetch origin && git merge-base --is-ancestor origin/main <sha>
```

## Watch checks

Run in the `Monitor` tool, so each line arrives as an event:

```
gh pr checks N --required --watch --fail-fast
```

The watch ends at its deadline (5 minutes by default, 30 at most): re-arm it if checks are still pending. Do not trust the watch's exit code alone: after it ends, run `gh pr checks N --required` and read the buckets.

## Merge

```
gh pr merge N --merge --match-head-commit <sha> --subject "<type>(scope): ... (#N)"
gh pr view N --json state,mergeCommit,mergedAt
```

Do not add `--admin`, `--auto`, `--squash`, `--rebase` or `--delete-branch` unless the project's rules say so. `--match-head-commit` makes the merge fail when the head is not `<sha>`.

## Superseded PRs

```
gh pr diff M --name-only
gh pr close M --comment "Superseded by #N, which landed this change."
```

Compare the file list and the diff with main first: anything unique stays out of this comment and goes back to its worker or into a ticket.

## Refusal handoff

Send this to the person when the merge was refused twice (fill every field, no extras):

```
Merge refused as unreviewed, twice. I did not work around it.
PR: <url>   head: <sha>   checks: required green on <sha>
Review: <small|large>, <n> findings verified, <n> applied, <n> dropped; PR comment <url>
To merge: gh pr merge N --merge --match-head-commit <sha> --subject "<type>(scope): ... (#N)"
```

## Sync installed copies

For a skills repo. From a clean checkout of the merged main, in Git Bash (`<skill>` is each folder the PR changed):

```
git fetch origin && git merge --ff-only origin/main
diff -rq <skill> ~/.claude/skills/<skill>
cp -R <skill> ~/.claude/skills/
```

- Read the `diff -rq` output first. `cp -R` overwrites but never deletes, and `diff -rq` shows no direction of change.
- For each differing or installed-only file, compare the installed copy with the pre-merge main: `git show ORIG_HEAD:<skill>/<file> | diff -q - ~/.claude/skills/<skill>/<file>`. Identical: safe to overwrite, or to remove if the PR deleted it. Different, or `git show` fails (the file was never in main): it is a local edit; list it to the person and touch it only after their ok, or copy it back into the repo through a PR. Never remove a file from `~/.claude/skills` without that check.
- Whether a running session reloads a changed skill is unverified: a new session is the sure check.
