# roadmap-tracker commands

Run from the project's checkout so `gh` finds the repo, or add `-R owner/repo`. In `gh api`, `{owner}` and `{repo}` fill in from the current repo. Write endpoints without a leading slash (`repos/...`): on Git Bash a leading `/` can be turned into a Windows path (see `windows-ops`). Facts below were checked against gh 2.83.2 `--help` and GitHub's REST docs; items marked unverified were not run.

`RM` is the roadmap issue number and `MS` the milestone name, both from the project's memory.

## Read state (no writes)

```
gh issue view $RM --json number,title,body,isPinned,state
gh issue list --json number,title,isPinned,milestone,labels --limit 100
gh pr list --state open --json number,title,headRefName,closingIssuesReferences
gh issue list --state open --label ready-for-agent --milestone "$MS" --json number,title
gh issue list --state open --label needs-info --json number,title
gh issue list --state open --label ready-for-human --json number,title
```

- `gh issue list` shows 30 issues unless `--limit` says otherwise.
- Repeating `--label` means AND, so waiting-on-the-person (needs-info or ready-for-human) is two lists.
- JSON fields on issues include `isPinned`, `milestone`, `labels`, `stateReason`, `closedByPullRequestsReferences`. A fix keyword in a commit message may leave `closedByPullRequestsReferences` empty: put the keyword in the PR body.

## Pin

```
gh issue list --json number,isPinned --jq '.[] | select(.isPinned) | .number'
gh issue pin $RM
gh issue unpin N
```

- At most 3 pinned issues per repo. Count the pinned set before pinning.
- Unpin only an issue you pinned yourself, or one the person told you to unpin.

## Milestones (no `gh milestone` command)

```
gh api --method GET repos/{owner}/{repo}/milestones -f state=all --paginate --jq '.[] | [.number, .state, .title, .open_issues, .closed_issues] | @tsv'
gh api repos/{owner}/{repo}/milestones -f title="$MS" -f description="<one line>"
gh api repos/{owner}/{repo}/milestones -f title="$MS" -f due_on=2026-11-01T00:00:00Z
gh api --method PATCH repos/{owner}/{repo}/milestones/NUM -f state=closed
```

- Without `--method`, `gh api` sends GET with no fields and POST once any `-f` or `-F` is given. Add `--method GET` for a filtered list, as above.
- `due_on` is ISO 8601, `YYYY-MM-DDTHH:MM:SSZ`.
- Ensure it exists before use:

```
gh api --method GET repos/{owner}/{repo}/milestones -f state=all --paginate --jq ".[] | select(.title==\"$MS\") | .number"
```

Empty output: create it. More than one number: stop and ask which one the project means.

`gh issue create --milestone` and `gh issue edit --milestone` take the title, never the number. What they do with an unknown or duplicate title is unverified: that is why the ensure step comes first. `gh issue edit N --remove-milestone` clears it.

## File and edit with a milestone

```
gh issue create --title "<title>" --body-file body.md --label ready-for-agent --label enhancement --milestone "$MS"
gh issue edit N --milestone "$MS"
gh issue edit N M K --add-label ready-for-human --remove-label ready-for-agent
```

`gh issue edit` accepts several issue numbers in one call.

## Audit

```
gh issue list --state open --search "no:milestone" --json number,title --limit 100
gh issue list --state open --search "no:label" --json number,title --limit 100
gh issue list --state open --label ready-for-agent --json number,title,milestone,labels --limit 100
```

- `--milestone` filters a list by milestone; it does not find issues with none, `no:milestone` does.
- Fix each hit: `gh issue edit N --milestone "$MS"`. Pick the milestone from the issue's parent or its roadmap section, not by guess.
- Issues with two state labels: list the open ones and read `labels` in the JSON; ask the person before changing any.
- Dependency search qualifiers `is:blocked`, `is:blocking`, `blocked-by:N`, `blocking:N` exist per GitHub's changelog (medium confidence, not run here). Unblocked work: `--search "-is:blocked"` added to the ready-for-agent list. If it returns nothing useful, read each ticket's "Blocked by" section instead.

## Labels (idempotent)

Read `docs/agents/triage-labels.md` for the repo's label strings, then create each one. `--force` updates color and description when the label exists, so reruns are safe.

```
gh label list --limit 100 --json name --jq '.[].name'
gh label create ready-for-agent --color 0E8A16 --description "Fully specified, ready for an AFK agent" --force
gh label create ready-for-human --color 1D76DB --description "Requires human implementation" --force
gh label create needs-info --color FBCA04 --description "Waiting on reporter for more information" --force
gh label create needs-triage --color D4C5F9 --description "Maintainer needs to evaluate this issue" --force
gh label create wontfix --color FFFFFF --description "Will not be actioned" --force
gh label create bug --color D73A4A --description "Something is broken" --force
gh label create enhancement --color A2EEEF --description "New feature or improvement" --force
```

- Colors are 6 hex digits and are this file's choice, not Matt's. Use the repo's existing colors when a label exists: skip `--force` for it.
- If the mapping renames a label, create the mapped name only. `gh label edit OLD --name NEW` renames a label.

## Sub-issues and dependencies

Both endpoints take the issue's REST `id`, not its number. Send it with `-F` so it is sent as an integer.

```
PARENT=12; CHILD=15; BLOCKER=14   # issue numbers
CID=$(gh api repos/{owner}/{repo}/issues/$CHILD --jq .id)
gh api --method GET repos/{owner}/{repo}/issues/$PARENT/sub_issues --jq '.[].number'
gh api repos/{owner}/{repo}/issues/$PARENT/sub_issues -F sub_issue_id=$CID
gh api --method GET repos/{owner}/{repo}/issues/$CHILD/dependencies/blocked_by --jq '.[].number'
gh api repos/{owner}/{repo}/issues/$CHILD/dependencies/blocked_by -F issue_id=$(gh api repos/{owner}/{repo}/issues/$BLOCKER --jq .id)
```

- Sub-issues: up to 100 per parent, 8 nesting levels, and the sub-issue must belong to the same owner as the parent. `replace_parent` moves an issue that already has a parent.
- Remove: `--method DELETE` on `.../sub_issue` (with `sub_issue_id`) and on `.../dependencies/blocked_by/{issue_id}`. Reorder: PATCH `.../sub_issues/priority`. The delete and reorder calls were not run.
- GitHub documents `--blocked-by`, `--blocking` and `--json blockedBy,blocking` for `gh issue`. gh 2.83.2 has none of them: use `gh api`, or upgrade `gh` first.
- Availability on the person's repos is unverified. Run the two GET calls on one issue before relying on either feature: a 404 means it is off for that repo.

## Close, with the PR named

```
gh issue close N --comment "Completed in #PR" --reason completed
gh issue close N --comment "<one-line reason>" --reason "not planned"
gh issue comment N --body "Completed in #PR"
gh issue view N --json state,stateReason,closedByPullRequestsReferences
```

- The comment text names the PR (`#PR`). When a closing keyword in the PR body already closed the issue, use `gh issue comment`.
- Closing keywords are `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`, and only act when the PR targets the default branch.

## Roadmap body after a merge

```
RMF="${TMPDIR:-/tmp}/roadmap-$RM.md"   # outside the checkout: an untracked file there can be committed by accident
gh issue view $RM --json body --jq .body > "$RMF"
sed -i -E "s/^- \[ \] (#N)([[:space:]])/- [x] \1\2/" "$RMF"
gh issue edit $RM --body-file "$RMF"
```

- Fetch the body right before the write. Edit the PR number into the line with the Edit tool, then write.
- Keep line endings as they are: web-created bodies often use CRLF.
- Drift check, unchecked lines whose issue is already closed:

```
for N in $(grep -o '^- \[ \] #[0-9]*' "$RMF" | grep -o '[0-9]*$'); do
  [ "$(gh issue view $N --json state --jq .state)" = CLOSED ] && echo "close in roadmap: #$N"
done
```

## Boards (optional)

`gh issue create --project "<title>"` and `gh issue edit --project` need the `project` scope. Only the person runs `gh auth refresh -s project`. Boards are not researched further here.
