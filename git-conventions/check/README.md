# git-conventions check

A validator for the rules in `../SKILL.md`: commit subjects, branch names and PR titles. Node 18 or later (tests run on Node 20), no dependencies, plain `.mjs` files. For a project with no CI of its own.

## Use it in a project

1. Copy this folder into the project (keep `.gitattributes`, it keeps the scripts on LF), or call it where it is installed (`~/.claude/skills/git-conventions/check`). Below, `<path>` is that folder.
2. Check every commit message as it is written:
   - Run `git config --get core.hooksPath` first, and look for hooks other than `*.sample` in `$(git rev-parse --git-path hooks)` (`.git/hooks`, or the main checkout's in a linked worktree): setting `core.hooksPath` replaces both a hooks path already set (husky) and that folder, where lefthook and pre-commit install their hooks. With an existing hook manager, skip the next line and call `node <path>/cli.mjs commit-msg "$1"` from its commit-msg hook instead.
   - `git config core.hooksPath <path>/hooks`
   - On Linux and macOS: `chmod +x <path>/hooks/commit-msg`
   - A relative path is read from the project root. The hook runs `../cli.mjs`, so copying only `commit-msg` into `.git/hooks` stops every commit with a message saying so.
   - Without `node` on the PATH the hook prints a warning and checks nothing. `GIT_CONVENTIONS_NODE` names the node binary when it is not `node`.
3. Before pushing:
   - `node <path>/cli.mjs commit-range origin/main HEAD`
   - `node <path>/cli.mjs branch-name "$(git branch --show-current)"`
4. Before `gh pr create`:
   - `node <path>/cli.mjs pr-title "<title>"`

## Commands

| Command | Checks |
| --- | --- |
| `commit-range <base> <head>` | The first line of the raw message of each commit in `<base>..<head>`. A commit with two or more parents passes with git's default merge subject for `main`, `master` or `develop` into a work branch. `fixup!`, `squash!` and `amend!` subjects fail: they must not be pushed. An empty `<base>` or `<head>` is a usage error. |
| `branch-name <name>` | One branch name. `feat/` and `fix/` pass with a warning. |
| `pr-title <title>` | A PR title (quote it). |
| `commit-msg <file> [--merge]` | A commit message file, as the hook does: the first line that is neither blank nor a comment (`core.commentChar` and `core.commentString` are honored), up to the `git commit -v` scissors line. A leading byte order mark fails: git keeps it in the stored message, so save the message as UTF-8 without BOM. It sees a merge in progress and an amended merge commit by itself, so `--merge` is rarely needed. `fixup!`, `squash!` and `amend!` pass when the rest is a valid subject, as local work before an autosquash. |

Exit 0 when valid, 1 with the messages when not, 2 on a usage error (unknown command, missing, empty or extra argument, a range git cannot read).

## What it does not check

- It checks the skill's defaults. Where a project rule replaces one (branches with an agent prefix, squash merge subjects, other commit types), skip that check or adjust `rules.mjs` in the project's copy.
- It cannot tell which branch a commit lands on, so it does not check the `(#N)` suffix of the merge subject on the main branch. That stays with whoever merges: `gh pr merge N --merge --subject "<PR title> (#N)"`.
- An octopus merge (`Merge branches 'main' and 'develop' into x`) is not accepted as git writes it: give it a conventional subject.
- The amended-merge rule compares subjects, so a new commit made right after a merge with the merge's own default subject (`git commit -C HEAD`, say) passes the hook too. `commit-range` still fails it.
- With `-m` or `-F` and no editor, git keeps comment lines in the message, while the hook skips them as an editor session would. A message whose first line is a comment can pass the hook and then fail `commit-range`: run `commit-range` before pushing.

## Test it

From this folder, `node --test`, or from the repository root, `node --test git-conventions/check/`. The tests build temporary git repositories under the OS temp folder and remove them.
