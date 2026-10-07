# Review briefs

Briefs and lenses for `merge-gate`, sections 2 to 4. Model and effort per stage come from `model-mix`, the shape and the fleet size from `smart-ultracode`, the script API from `workflow-authoring`. Lens agents read a diff for defects, which is the final-review row of `model-mix`; a pre-pass that only gathers context (callers, tests of touched files) is its broad-reading row.

## Small path: one reviewer

One read-only Agent call, `model: "opus"`, high effort. Give it:

- the worktree path at the head sha and the command `gh pr diff N`
- the ticket text and its acceptance criteria
- the project's rules files (AGENTS.md, CONTRIBUTING.md, `.claude/CLAUDE.md`, with any `clean-code:` level line), the `clean-code` rules and the Worker brief rules
- the PR body, labelled as the author's claims to test

Ask for findings only, in the format below, ranked, with a line saying which lenses it covered. It runs no builds and no full suites.

Then verify: each serious finding gets one fresh Opus high verifier (Pro: medium; a security finding always its own) with the brief of the large path, step 2. Minor findings, on either path, are checked by the main session reading the cited lines. Unchecked findings count as unverified.

## Large path: lenses, verify, critic

1. **Lenses** (one agent each, same model, effort, tools and schema, so the prompt prefix caches):
   - code PRs: correctness and edge cases; security and trust boundaries; tests and checks (anything removed or weakened); fit with the ticket and the project rules; overlap or duplication with what main has now; UI and text the person sees, including model-facing wording that leaks.
   - skills, docs and prompt PRs: facts (every claim checked against a source); use (how a model would misread or misuse it); safety (what a literal copy would let through); consistency with sibling skills.
2. **Verify**: one fresh Opus high agent per serious finding (batched per area below Max 20x, but a security finding always has its own verifier, `smart-ultracode`). It gets the claim and the cited lines, never the author's reasoning, and tries to refute with evidence. It returns confirmed, refuted or unverified with the file and line or the command and output.
3. **Critic**: one agent gets the PR goal, the diff's file list, the lenses and the verified results, and names what was skipped, assumed or left unread. Its gaps go into one more round or into the PR comment.

Fleet size: at most the lens count, and never above the width of today's profile in `model-mix`; group lenses per agent to fit and log any lens left out.

## Finding format

```
[severity: serious|minor] file:line
Defect: one sentence
Evidence: file and line, or command and output
Fix: the smallest change that removes it
```

Serious means wrong behavior, a security problem, data loss, removed or weakened tests, a broken project rule, or a `clean-code` rule at level block (after the project's overrides). Everything else is minor, `clean-code` advise rules included. Style preferences outside `clean-code` are not findings.

## Delta review

After fixes or a conflict-resolving merge: the same reviewer brief, limited to `git diff <reviewed-sha>..<new-sha>`, plus the list of findings those commits claim to fix. It checks that each fix removes its finding and adds none.

## PR comment

One comment per gate run, after the verdict:

```
Reviewed head <sha>: <small|large> path.
Verified and applied: <n> (<one line each>). Verified, deferred to tickets: <n> (#..). Refuted: <n>. Unverified: <n>.
Required checks: green on <sha> at <time>.
```

Sort the full answer for the person into confirmed, refuted with evidence, unverified and not covered (`smart-ultracode`, section 6).
