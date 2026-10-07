# git-conventions reference

Read when choosing a commit type, when a subject or branch case is unclear, or when working out the version a change asks for. The rules themselves are in `SKILL.md`; a project rule that differs from one of them replaces it.

## Choosing the type

| The change | Type |
| --- | --- |
| A new function the user or caller can use | `feat` |
| A correction of wrong behaviour | `fix` |
| Only documentation | `docs` |
| Only tests | `test` |
| Only CI configuration | `ci` |
| Only the build or the dependencies | `build` |
| Restructuring with no behaviour change | `refactor` |
| A faster or lighter path, same result | `perf` |
| Formatting or whitespace, no meaning change | `style` |
| Maintenance that fits nothing above (housekeeping, tooling, repo files) | `chore` |
| Undoing an earlier commit | `revert` |

A change that mixes types takes the one that matters most to the reader of the changelog, or is split into commits. A feature with its tests is `feat`; tests alone are `test`.

## Commit subjects

| Subject | Verdict |
| --- | --- |
| `feat: add the search palette` | valid |
| `fix(release): handle an empty changelog` | valid, scope `release` |
| `feat(api)!: drop the v1 endpoint` | valid, breaking change |
| `feat(app): add the search palette (#123)` | valid, the number is part of the description |
| `chore: merge origin/main into feature/x` | valid, a sync merge in Conventional form |
| `Update the readme` | invalid, no type |
| `feature: add login` | invalid, `feature` is a branch type, not a commit type |
| `feat(App): add login` | invalid, uppercase scope |
| `feat(my_scope): add login` | invalid, underscore in the scope |
| `feat:` | invalid, empty description |
| `feat:add login` | invalid, no space after the colon |
| `Merge pull request #12 from owner/feature/x` | invalid, GitHub's default merge subject |

Vague descriptions pass the validator and still fail the rule: `fix: update stuff`, `feat: changes`. Name what changed.

`git revert` proposes `Revert "<subject>"`, which is not in the format. Rewrite it as `revert: <description>`.

`fixup! `, `squash! ` and `amend! ` subjects made by `git commit --fixup` are local work before an autosquash: the commit-msg hook lets them through when the rest is a valid subject, and `commit-range` rejects them because they must not be pushed.

Dependabot's default subjects (`Bump foo from 1.0 to 1.1`) fail `commit-range` and `pr-title`. In `dependabot.yml` set `commit-message: { prefix: "build", include: "scope" }` on each update entry, so they read `build(deps): bump foo from 1.0 to 1.1`.

## Merge subjects git writes

Git's default subject for a merge that brings one of the three branches into a work branch passes, on a commit with two or more parents only:

- `Merge branch 'main' into feature/x`
- `Merge branch 'develop' of https://example.com/owner/repo.git into feature/x`
- `Merge remote-tracking branch 'origin/main' into feature/x`

The target must be a work branch: `Merge branch 'develop' into main` fails, and so does `Merge branch 'main' into master`. The same subject on a commit with one parent fails. An octopus merge (`Merge branches 'main' and 'develop' into feature/x`) is not accepted as git writes it. A merge of any other branch (`Merge branch 'feature/other' into feature/x`) fails too: write `chore: merge feature/other into feature/x`. On the main branch the subject is always the PR title followed by the number.

## SemVer effect

| Change | Before 1.0 | From 1.0 |
| --- | --- | --- |
| `feat` | minor | minor |
| `fix`, `perf` | patch | patch |
| Breaking change (`!` or `BREAKING CHANGE:` footer) | minor | major |
| `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `style`, `revert` alone | no release | no release |

When one release holds several changes, the highest row wins.

## Branch examples

| Name | Verdict |
| --- | --- |
| `feature/add-login-page` | valid |
| `bugfix/fix-header-bug` | valid |
| `hotfix/security-patch` | valid |
| `release/v1.2.0` | valid, dots in a version |
| `release/v0.3.0-beta.1` | valid |
| `chore/update-dependencies` | valid |
| `feature/issue-142-assignment-contract` | valid, with the issue number |
| `main` | valid, no prefix |
| `feat/add-login`, `fix/header-bug` | valid for the validator, not recommended: use `feature/`, `bugfix/` |
| `dependabot/npm_and_yarn/foo-1.2.3` | exempt from the name check |
| `Feature/Add-Login` | invalid, uppercase |
| `feature/new--login` | invalid, double hyphen |
| `feature/-new-login` | invalid, hyphen at the start |
| `release/v1.-2.0` | invalid, hyphen next to a dot |
| `fix/header_bug` | invalid, underscore |
| `docs/old-tickets-audit` | invalid, type not allowed |
| `feature/` | invalid, empty description |
| `claude/add-login` | invalid, agent-name prefix |
| `feature/add.login` | invalid, a dot outside `release/` |
| `release/foo.bar` | invalid, a dot under `release/` that is not a version (`v1.2.0`, `2.0.0-rc.1`) |

## Sources

- Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
- Conventional Branch 1.1.0: https://conventional-branch.github.io/
- Semantic Versioning 2.0.0: https://semver.org/

Where this skill narrows a spec (long branch types preferred, no agent prefixes, the merge subject on main), the narrowing is the owner's choice, not the spec's.
