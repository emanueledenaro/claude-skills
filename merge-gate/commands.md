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

## Pairwise conflicts

For each pair of open PR heads (git 2.38 or later), after a fetch of both. It exits 1 and lists the conflicted files when the pair conflicts:

```
git fetch origin pull/N/head:pr-N pull/M/head:pr-M
git merge-tree --write-tree --name-only pr-N pr-M
```

Order the merges so each shared file is resolved once: the PR with the largest change to a shared file goes first, and the others realign on the new main.

## Watch checks

Run in the `Monitor` tool, so each line arrives as an event:

```
gh pr checks N --required --watch --fail-fast
```

The watch ends at its deadline (5 minutes by default, 30 at most): re-arm it if checks are still pending. Do not trust the watch's exit code alone: after it ends, run `gh pr checks N --required` and read the buckets.

In OpenCode, run the same command with the shell tool's background mode: the session hears when it exits, with no deadline to re-arm. Where CI is off there is nothing for it to watch: the project's `gate` posts the status (`coordinator-method/references/local-tools.md`).

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

For a skills repo. In the README's install (`ln -s`, checked on macOS) the installed copies are links: `~/.claude/skills/<id>` and `~/.agents/skills/<id>` lead to a clone of the repo, and `~/.config/opencode/skills/<id>` leads to the marketplace clone under `~/.claude/plugins/marketplaces/`. OpenCode ranks `~/.config/opencode/skills` first (`project-setup/reference.md`, Skills), so a stale marketplace clone means OpenCode loads the old text while Claude Code loads the new one. Never `cp` into a root whose entries are links: the write goes through the link into the clone.

1. Run the script in `project-setup/reference.md`, section "These skills". It fast-forwards each clean clone on its default branch and runs `claude plugin marketplace update <name>` for the marketplace clone. Without the `claude-skills: auto-sync` line it is a dry run: follow what that section says. It reports a plain copy that differs and leaves it.
2. A root that holds plain copies, not links, is updated by hand. On Windows, Git Bash may have made copies where the README says `ln -s` (not checked there). From a clean checkout of the merged main, for each `<skill>` the PR changed, with `<merge>` the merge commit:

```
diff -rq <skill> <root>/<skill>
git show <merge>^1:<skill>/<file> | diff -q - <root>/<skill>/<file>
cp -R <skill> <root>/
```

   Read the `diff -rq` output first: it shows no direction of change, and `cp -R` overwrites but never deletes. Compare each differing or installed-only file with main before the merge (the second line). Identical: safe to overwrite, or to remove if the PR deleted it. Different, or `git show` fails (the file was never on main): it is a local edit; list it to the person and touch it only after their ok, or bring it into the repo through a PR. Then copy.
3. Run the read-only check, after a `git -C <clone> fetch origin`, with `<clone>` a clone of the repo: `bash <clone>/merge-gate/installed-check.sh <clone>`. It compares every installed copy of every skill on `origin/main`, in the three roots, with `origin/main` by content: a clone by the skill folder's tree id, anything else with `diff -rq`. A merge that changes no skill folder leaves it green.

- Pass: exit 0 and no `stale:`, `stale copy:` or `local edit:` line. Its tests (`merge-gate/installed-check.test.mjs`) build the links in a throwaway home and run in CI; it was not run on Windows.
- A `report:` line is not a failure: a skill whose links lead to another repo prints one; say which copy loads. A link into another repo that differs is fixed in that repo.
- A `local edit:` line, or a sync script `report:` line about a dirty clone or a plain copy that differs, is the person's work: list it and touch it only after their ok, or bring it into the repo through a PR.
- Whether a running session reloads a changed skill is unverified: a new session is the sure check.
