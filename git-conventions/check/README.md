# git-conventions check

A validator for the rules in `../SKILL.md`: commit subjects, branch names and PR titles. Node 18 or later, no dependencies, plain `.mjs` files. For a project with no CI of its own.

## Use it in a project

1. Copy this folder into the project (keep `.gitattributes`, it keeps the scripts on LF), or call it where it is installed (`~/.claude/skills/git-conventions/check`). Below, `<path>` is that folder.
2. Check every commit message as it is written:
   - `git config core.hooksPath <path>/hooks`
   - On Linux and macOS: `chmod +x <path>/hooks/commit-msg`
   - A relative path is read from the project root. The hook checks the first line of the message that is not a comment, and lets git's default merge of `main`, `master` or `develop` into a branch through during a merge. Without `node` on the PATH it prints a warning and checks nothing.
3. Before pushing:
   - `node <path>/cli.mjs commit-range origin/main HEAD`
   - `node <path>/cli.mjs branch-name "$(git branch --show-current)"`
4. Before `gh pr create`:
   - `node <path>/cli.mjs pr-title "<title>"`

## Commands

| Command | Checks |
| --- | --- |
| `commit-range <base> <head>` | The first line of each commit in `<base>..<head>`, read with `git log`. A commit with two or more parents passes with git's default merge subject for `main`, `master` or `develop`. |
| `branch-name <name>` | One branch name. `feat/` and `fix/` pass with a warning. |
| `pr-title <title>` | A PR title (quote it). |
| `commit-msg <file> [--merge]` | A commit message file. Used by the hook. |

Exit 0 when valid, 1 with the messages when not, 2 on a usage error (unknown command, missing or extra argument, a range git cannot read).

## Test it

From this folder, `node --test`, or from the repository root, `node --test git-conventions/check/`. The tests build temporary git repositories under the OS temp folder and remove them.
