---
name: clean-code
description: "Eight code-quality rules for code Claude writes, changes or reviews: clear names, small single-purpose functions, at most three arguments, no hidden side effects, KISS, DRY, YAGNI, and SOLID for object-oriented code. Each rule blocks or advises, with per-project overrides. Use when writing, refactoring or reviewing code, when a diff or PR gets a quality review, or when the person says 'codice pulito', 'clean code', 'refactor', 'rifattorizza', 'troppo complesso', 'codice duplicato', 'nomi chiari' or asks whether code is readable or maintainable, in any project."
---

Rules for the code Claude writes and the code it reviews, after Robert C. Martin's Clean Code plus KISS, DRY and YAGNI. The project's own rules win: linter and formatter config, AGENTS.md, CONTRIBUTING.md, `.claude/CLAUDE.md` and the style of the surrounding code. No rule here changes a public signature, weakens a test or breaks a convention the codebase follows consistently. How review findings are verified and applied, and how the merge runs, is `merge-gate`.

## 1. Scope

- Apply to the lines a change adds or touches, and to the existing code they duplicate or call when the violation sits there. Never rewrite untouched code for a rule: name it as a follow-up.
- Out of scope: generated, vendored and third-party code, migrations, lockfiles, fixtures.
- Tests: names, noHiddenSideEffects and dry apply; setup repeated so each test reads on its own is fine, copied logic (an assertion helper pasted around) is not.

## 2. Severity and overrides

| id | default | rule |
| --- | --- | --- |
| `names` | block | Clear names, no cryptic abbreviations |
| `smallFunctions` | advise | Small functions that do one thing |
| `fewArguments` | advise | At most 3 arguments, beyond that one object |
| `noHiddenSideEffects` | block | No hidden effects on shared state |
| `kiss` | advise | No needless complexity |
| `dry` | block | The same logic is not repeated |
| `yagni` | advise | No feature or abstraction before it is needed |
| `solid` | advise | SOLID, object-oriented code only |

- **block**: when writing, fix it before reporting the work done or committing. In a review it is a serious finding, fixed before the merge (`merge-gate`).
- **advise**: when writing, apply it if it is cheap within the same change. In a review it is a minor finding; it never blocks a merge.
- A project changes the levels with one line in its `.claude/CLAUDE.md` or AGENTS.md, for example `clean-code: smallFunctions=block, solid=off`. Levels: `block`, `advise`, `off`.
- Conflicts: project conventions, then block rules, then advise rules. Between `dry` and `kiss`/`yagni`, see `dry`.

## 3. The rules

**`names`**
- A name says what the thing is or does in the domain's words: `retryDelayMs`, `isExpired`, `loadInvoices`. Not `cfgMgr`, `tmp2`, `procD`, not `list` for a map, not `data`, `info` or `manager` when a precise word exists.
- Allowed: `i`, `j` in a short loop; short names the language or codebase already uses (`err`, `ctx`, `req`, `res`, `id`, `url`, `e` in a one-line handler); abbreviations the domain uses consistently (`PR`, `CI`, `HTTP`).
- Booleans read as a question (`isReady`, `hasToken`), functions start with a verb, units sit in the name when the type cannot carry them (`timeoutMs`).

**`smallFunctions`**
- One thing at one level of abstraction. Signs of more: the name needs "and", sections set apart by blank lines or comments, high-level steps mixed with low-level detail, nesting deeper than about 3.
- Length is a signal, not the rule: past about 25 lines look again; a long flat `switch` or table can be fine.
- Fix: extract each section into a function whose name replaces the comment.

**`fewArguments`**
- At most 3 parameters; beyond that one object with named fields (`{ retries, timeoutMs, signal }`), or a sign the function does too much.
- A boolean that switches behaviour is a smell: two functions, or a named option.
- Exempt: signatures fixed by a framework, interface or callback contract (`(req, res, next)`, `reduce` callbacks), and public signatures the change must keep.

**`noHiddenSideEffects`**
- A function changes shared state only when its name and signature say so: module or global variables, singletons, caches, arguments passed in, environment, files, network. `getUser` that also writes a cache or mutates its argument breaks the rule; `saveUser` and `updateCache(cache, entry)` do not.
- Queries return data and change nothing; commands change state and say so.
- Do not mutate inputs: return a new value, or name the mutation (`sortInPlace`). Logging and metrics do not count.

**`kiss`**
- The simplest design that meets today's need: plain functions and data before classes, patterns, generics, metaprogramming, config layers or clever one-liners. A reader new to the file follows it on the first pass.
- Prefer what the platform and the codebase already have over a new dependency or abstraction.

**`dry`**
- One piece of knowledge (a rule, formula, validation, constant, parsing step) lives in one place. Before writing a helper, search the codebase and reuse what exists. Logic copied within the change, or between the change and existing code, breaks the rule.
- Not a violation: code that looks alike but encodes rules that change for different reasons; two trivial lines; inline test setup.
- When the platform forbids sharing (two packages that cannot import each other, such as two mods), keep the copies identical, mark them "keep identical" and add a test or check that compares them.
- If removing the duplicate would need a speculative abstraction, extract the smallest shared function: `dry` decides that it is shared, `kiss` and `yagni` decide its shape.

**`yagni`**
- No parameter, option, hook, interface, base class, plugin point or setting for a need nobody has today. No dead or commented-out code kept for later.
- An extension point arrives with the second real case.

**`solid`** (classes and interfaces only; skip it for functional or procedural code)
- One reason to change per class. New behaviour by adding a type or function, not by growing a `switch` on type. Subclasses keep the parent's contract. Small interfaces, no client forced to depend on methods it does not use. Code that talks to the outside (clock, network, storage) is injected, so it can be tested.

## 4. Writing

- Read the surrounding code first and match its names and idiom. Search for an existing helper before adding one.
- Before reporting done, walk the changed lines once against the block rules and fix what fails. In the report, name any advise item deliberately left.

## 5. Reviewing

- One finding per violation: rule id, level, `file:line`, what is wrong in one sentence, the fix. Block findings first.
- A finding needs the cited lines in hand. Taste is not a finding.
- Write findings in the person's language (Italian by default); rule ids stay as they are.

## Done when

- Every changed line passes the block rules, or the person accepted the exception in chat.
- Advise items are applied or listed, and untouched code is still untouched.
