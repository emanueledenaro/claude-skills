# Repository checks

What a pull request to this repository must pass. The `check` workflow (`.github/workflows/check.yml`) runs it on every pull request and on `main`. Node 18 or later, no dependencies.

## Run it before pushing

From the repository root:

```bash
node checks/cli.mjs files
node checks/cli.mjs commits origin/main HEAD
node git-conventions/check/cli.mjs commit-range origin/main HEAD
node git-conventions/check/cli.mjs pr-title "<title>"
printf '%s' "<title>" | node checks/cli.mjs text 'PR title'
node checks/cli.mjs text 'PR body' < body.md
```

Exit 0 is clean, 1 lists the problems as `<place>:<line>:<column>: <problem>: <the line>`, 2 is a usage error.

## What it checks

| Command | Checks |
| --- | --- |
| `files` | Every tracked file that is text: no em dash (U+2014) and no en dash (U+2013), code included. Markdown files: none of the stock AI words in `rules.mjs`, outside fenced code blocks and inline code spans. Every `SKILL.md`: at most 120 lines, the top of the house range in `skill-audit`. |
| `commits <base> <head>` | The whole message of each commit in `<base>..<head>`: no dashes, no stock AI words outside code. The subject format stays with `git-conventions/check`. |
| `text <label>` | Text on stdin, such as a PR title or body: no dashes, no stock AI words outside code. |

- A file that is new and not yet staged is not tracked: `git add` it first.
- A report shows a dash as `<U+2014>` or `<U+2013>`, so it can be pasted into a PR body.
- To write about a stock word, put it in backticks. A dash in code or in a test is written as a code point (`\u2014`, `String.fromCharCode(0x2014)`).
- The word list holds the words with no ordinary use in these skills. The comment above it in `rules.mjs` names the ones left out and why.

## Test it

`node --test checks/rules.test.mjs checks/cli.test.mjs`. The tests build temporary git repositories under the OS temp folder and remove them.
