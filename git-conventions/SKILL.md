---
name: git-conventions
description: "Default git naming rules for commits, branches, PR titles and merge commit subjects: Conventional Commits 1.0.0 messages, Conventional Branch 1.1.0 names, the merge subject on main, the history and tag rules, and a dependency-free Node validator with a commit-msg hook. Use when writing a commit message, naming a branch, writing a PR title or a merge commit subject, or checking whether a name is valid, also in Italian (messaggio di commit, nome del branch, titolo della PR, nome valido, crea un branch), in any project."
---

Defaults for how commits, branches, PR titles and merge subjects are named when a project says nothing. The project wins: its AGENTS.md, CONTRIBUTING.md, commitlint config and branch protection come first, and a project rule that differs from a rule below replaces it. Type choice, examples, the merge subjects git writes, the SemVer effect and branch examples are in `reference.md`: read it when choosing a type or when a case is unclear. The validator and the hook are in `check/`; `check/README.md` says how to use them: read it before pushing in a project with no CI of its own, or to check a name.

## 1. Commits (Conventional Commits 1.0.0)

- First line: `<type>[(scope)][!]: <description>`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, `style`, `revert`.
- Scope is optional and has only lowercase letters, digits and hyphens (`app`, `release`).
- A breaking change has `!` after the type or scope, or a `BREAKING CHANGE:` footer.
- Description in English, with an imperative verb, saying concretely what changes: `add the search palette`, not `updates` or `fix stuff`.
- Only the first line is checked. The body is free text.

## 2. PR titles and merge subjects

- A PR title has the commit format.
- The merge commit on the main branch has the PR title followed by the number: `feat(app): add the search palette (#123)`. Replace the subject GitHub proposes (`Merge pull request #123 from ...`).
- One exception: a merge that brings `main`, `master` or `develop` into a work branch may keep git's own subject (`Merge branch 'main' into ...`). Only those three branches, and only on a merge commit.

## 3. Branches (Conventional Branch 1.1.0)

- Form `<type>/<description>`. `main`, `master` and `develop` have no prefix.
- Types: `feature/`, `bugfix/`, `hotfix/`, `chore/`, `release/`. Prefer `feature/` to `feat/` and `bugfix/` to `fix/`: the spec and the validator accept the short forms, this skill does not recommend them.
- No agent-name prefix (`claude/`, `codex/`, `ai/`, `copilot/`, `cursor/`) unless the project asks for it, even though the spec allows them.
- Description in English, lowercase, words separated by single hyphens. An issue number is recommended: `feature/issue-142-assignment-contract`.
- Forbidden: uppercase, underscores, spaces, double hyphens or double dots, a hyphen or a dot at the start or the end. A dot is allowed only in a version under `release/`: `release/v1.2.0`, `release/v0.3.0-beta.1`.
- `dependabot/...` branches skip the name check, not the commit check.

## 4. Main branch, history and tags

- No direct push to the main branch: pull requests only.
- Merge with a merge commit. No squash or rebase unless the project asks for it.
- Pushed history is append-only: a fix after a push is a new commit, even on your own branch. No amend followed by a push, no `--force`, no `--force-with-lease`.
- Version tags `v*` are immutable: never moved, never deleted. A wrong version gets a new number.

## 5. Check

Before pushing, from the project root (`<skill>` is the installed folder, `~/.claude/skills/git-conventions`):

- `node <skill>/check/cli.mjs commit-range origin/main HEAD`
- `node <skill>/check/cli.mjs branch-name "$(git branch --show-current)"`
- `node <skill>/check/cli.mjs pr-title "<title>"` before `gh pr create`

Exit 0 is valid, 1 is invalid with a message that names the problem and the expected format, 2 is a usage error. A commit-msg hook (`check/hooks/commit-msg`) checks each message as it is written.

## Out of this skill

- Rules of a single project (allowed scopes, ticket keys, changelog tooling) stay in that project's files.
- Attribution lines on commits and PRs are decided by the harness, not by this skill.

## Done when

- Every commit subject, PR title and branch name follows the format above, or the project rule that replaces it is named.
- The merge subject on the main branch is the PR title followed by the number.
- No published history was rewritten and no `v*` tag was moved or deleted.
