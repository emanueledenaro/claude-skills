---
name: clean-code
description: "Eight code-quality rules for code Claude writes, changes or reviews: clear names, small single-purpose functions, at most three arguments, no hidden side effects, KISS, DRY, YAGNI, and SOLID for object-oriented code. Each rule blocks or advises, with per-project overrides. Use when writing, changing or refactoring code, as the rule set a code review applies (the PR review and merge procedure stays merge-gate), or when the person says 'codice pulito', 'clean code', 'refactor', 'rifattorizza', 'troppo complesso', 'codice duplicato', 'nomi chiari' or asks whether code is readable or maintainable, in any project."
---

Rules for the code Claude writes and the code it reviews, after Robert C. Martin's Clean Code and SOLID principles, plus KISS, DRY and YAGNI. The project's own rules win: linter and formatter config, AGENTS.md, CONTRIBUTING.md, `.claude/CLAUDE.md`, and conventions the codebase follows consistently (naming case, layout, error idiom). A habit of nearby code (cryptic names, copied logic, hidden effects) is not a convention and never excuses a block rule. No rule here changes a public signature, weakens a test or breaks such a convention. How review findings are verified and applied, and how the merge runs, is `merge-gate`.

## 1. Scope

- Apply to the lines a change adds or touches. Existing code enters only through `dry`: reuse what exists instead of copying it, and when that logic sits inline in existing code, extracting it into a shared function is part of the change (behaviour and tests unchanged). Any other violation in code the change calls or sits next to is a follow-up named in the report, never a block finding and never rewritten in the same change.
- Out of scope: generated, vendored and third-party code, migrations, lockfiles, fixtures.
- Tests: `names`, `noHiddenSideEffects` and `dry` apply to test code and helpers. Setup repeated so each test reads on its own is fine, and so is setup that sets and restores shared state (fake clock, env, mocks); copied logic (an assertion helper pasted around) is not. Expected values stay literal: no rule asks a test to import or recompute the production logic it checks, and no refactor for a rule weakens an assertion.

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

- **block**: when writing, fix it before the work is reported done or the PR is opened (a work-in-progress commit may still hold it). In a review it is a `serious` finding, fixed before the merge (`merge-gate`).
- **advise**: when writing, apply it if it is cheap within the same change. In a review it is a `minor` finding; it never blocks a merge.
- A project changes the levels with one line in its `.claude/CLAUDE.md` or AGENTS.md, for example `clean-code: smallFunctions=block, solid=off`. Levels: `block`, `advise`, `off`.
- Conflicts: project conventions, then block rules, then advise rules. Between `dry` and `kiss`/`yagni`, see `dry`.

## 3. The rules

**`names`**
- A name says what the thing is or does in the domain's words: `retryDelayMs`, `isExpired`, `loadInvoices`. Not `cfgMgr`, `tmp2`, `procD`, not `list` for a map, not `data`, `info` or `manager` when a precise word exists.
- Allowed: `i`, `j` in a short loop; short names the language or codebase uses consistently for one meaning (`err`, `ctx`, `req`, `res`, `id`, `url`, `k`/`v`, `a`/`b` in a comparator, `T`, `_`, `e` in a one-line handler); abbreviations the domain uses consistently (`PR`, `CI`, `HTTP`).
- Usually: booleans read as a yes/no (`isReady`, `hasToken`), actions start with a verb (`loadInvoices`), units sit in the name when the type cannot carry them (`timeoutMs`). The language's idioms win: accessors and converters (`length`, `toJSON`), components (`UserCard`), handlers (`onClick`), constructors (`NewServer`), HTML-style flags (`disabled`). A block finding is a name that misleads, hides meaning or uses a cryptic abbreviation.

**`smallFunctions`**
- One thing at one level of abstraction. Signs of more: the name needs "and", sections set apart by blank lines or comments, high-level steps mixed with low-level detail, nesting deeper than about 3.
- Length is a signal, not the rule: past about 25 lines look again; a long flat `switch` or table can be fine.
- Fix: extract each section into a function whose name replaces the comment.

**`fewArguments`**
- At most 3 parameters, not counting `self`, `this` or a receiver; beyond that one object with named fields (`{ retries, timeoutMs, signal }`), or a sign the function does too much.
- A boolean that switches behaviour is a smell: two functions, or a named option.
- Exempt: signatures fixed by a framework, interface or callback contract (`(err, req, res, next)`, `reduce` callbacks), and public signatures the change must keep.

**`noHiddenSideEffects`**
- A function changes state outside its own locals only when its name or signature says so: module or global variables, singletons, caches others read, arguments passed in, environment, files, databases, network, timers, listeners and processes it starts. `getUser` that also marks the user as seen, or sorts the list it was given, breaks the rule; `saveUser`, `markSeen(user)` and `updateCache(cache, entry)` do not.
- Queries return data and change nothing; commands change state and say so.
- Do not mutate inputs: return a new value, name the mutation (`sortInPlace`) or take an out-parameter the language marks (`&mut`, a pointer). Not hidden: logging, metrics, tracing, and memoization or lazy initialization a caller cannot observe. Importing a module only defines it: no I/O, global patching or registration at import unless the module exists for that and says so.

**`kiss`**
- The simplest design that meets today's need: plain functions and data before classes, patterns, generics, metaprogramming, config layers or clever one-liners. A reader new to the file follows it on the first pass.
- Prefer what the platform and the codebase already have over a new dependency or abstraction.

**`dry`**
- One piece of knowledge (a rule, formula, validation, constant, parsing step) lives in one place. Before writing a helper, search the codebase and reuse what exists. Logic copied within the change, or between the change and existing code, breaks the rule.
- Not a violation: code that looks alike but encodes rules that change for different reasons; two trivial lines; inline test setup.
- When the platform or the project's module boundaries forbid sharing (two packages that cannot import each other, such as two mods; layers the project keeps apart), keep the copies identical, mark them "keep identical" and add a test or check that compares them.
- If removing the duplicate would need a speculative abstraction, extract the smallest shared function: `dry` decides that it is shared, `kiss` and `yagni` decide its shape.

**`yagni`**
- No parameter, option, hook, interface, base class, plugin point or setting for a need nobody has today. No dead or commented-out code kept for later.
- An extension point arrives with the second real case.

**`solid`** (classes and interfaces only; skip it for functional or procedural code)
- One reason to change per class. New behaviour by adding a type or function, not by growing a `switch` on type. Subclasses keep the parent's contract. Small interfaces, no client forced to depend on methods it does not use. Code that talks to the outside (clock, network, storage) is injected, so it can be tested.

## 4. Writing

- Read the surrounding code first and match its names and idiom.
- Before reporting done, walk the changed lines once against the block rules and fix what fails. In the report, name any advise item deliberately left and any follow-up found in existing code.

## 5. Reviewing

- Findings use `merge-gate`'s format (`review.md`, Finding format), with the rule id and level after the severity: a block rule is `serious`, an advise rule `minor`. Block findings first.
- A finding needs the cited lines in hand. Taste is not a finding.
- Findings the person reads are in their language (Italian by default); findings sent to a worker or written in a PR follow `merge-gate`. Rule ids stay as they are.

## Done when

- Every changed line passes the block rules, or the exception and its reason are in the report or PR and the person accepted it.
- Advise items are applied or listed; existing code changed only for a `dry` extraction, other violations there named as follow-ups.
