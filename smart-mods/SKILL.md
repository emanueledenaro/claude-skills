---
name: smart-mods
description: "Claude Code mods judgement: whether a mod or a lighter extension (CLAUDE.md, skill, settings hook, MCP server) fits, how to write, test and install a mod globally, and how to vet one. Use before writing, changing, installing or reviewing a Claude Code mod (a JS/TS plugin that runs inside Claude Code) or any plugin from a marketplace, a repository or --plugin-dir (it may contain a mod), and whenever the person asks for a pane, a band above the prompt, a custom /command that runs code, a guard that holds or answers tool calls, rewriting prompts or tool calls, or restyling Claude Code's interface, in any project."
---

A mod is a plugin whose JavaScript or TypeScript hooks module runs inside the Claude Code process, unsandboxed, with the person's permissions. This skill decides when to write one and how to ship it safely. API detail lives in the built-in `plugin-authoring` skill (`/plugin-authoring`) and in the types Claude Code writes into the mod's `.claude-plugin/types/` each time it loads the mod from `--plugin-dir` or loads a mod Claude wrote: those types match the running version and win over the docs pages and over memory. What a mod draws and how it looks: `mod-ui`.

Model per piece of work (`model-mix`): a guard (`tool.call`, `tool.check`, `plugin.register` hooks), anything that reads secrets or approves tool calls, and vetting someone else's mod are its security-critical row, Opus high, even when small. Delegated vetting goes to one Opus high agent with the whole source, never to fan-out readers. Panes, bands, commands and restyling are implementation: Sonnet high.

## 1. Gate: pick the lightest extension that does the job

| Need | Use |
| --- | --- |
| Standing instructions | `CLAUDE.md` or `.claude/rules/` |
| A procedure Claude runs on demand | skill |
| A specialist with its own tools, model and prompt | subagent |
| Block, allow or log on a lifecycle event with a script you already have, or rewrite a tool call's arguments (`updatedInput`) | settings hook |
| External tools or data | MCP server |
| Rewrite prompts, hold or answer a tool call without running the tool, commands that run your own code with no Claude turn, state across events, drawing in the interface | mod |

When a lighter row does the job, take it. A plugin can carry several rows at once: a mod next to skills, agents and MCP servers.

## 2. Start

- Check the version where the mod will run: `claude --version` in the shell (2.1.287 or later); in the Desktop app, which bundles its own Claude Code, `/status` in a local Code-tab session (2.1.286 or later). Remove `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` from `env` if present: 2.1.287+ ignores it, so `0` does not turn mods off.
- Copy a pattern before inventing one: the built-in mods' source in github.com/anthropics/claude-code/tree/main/mods (`diff` for a pane, `sec-default` for a guard, `agents-md` for user config).
- Keep the source in a permanent folder outside `~/.claude`. A mod Claude writes lands in `~/.claude/dev-mods/<session-id>/`, deleted after `cleanupPeriodDays`: copy it out before relying on it.
- A mod is a plugin whose `hooks/hooks.json` has `"modules": ["./register.js"]`, exporting `register(on, options)`. No Node.js, bundler or build step. Names that pass as Anthropic's fail `claude plugin validate`, and secrets in `userConfig` need `"sensitive": true`: read `writing.md` before writing the manifest.

## 3. Write hooks that load and fail safely

- Write for the static analysis, or the hook is never called: string-literal event names; `$` called in full (`$.ui.open`), never stored or destructured, passed only to same-file top-level functions or to `$.state`'s `read` and `update`; imports by relative path plus `claude-code`, no dynamic `import()` or `require`. `claude plugin validate` names each break.
- Every hook is `async ($, e, next)`: observe with `next(e)`, rewrite with `next({ ...e, field })` (`e` is frozen), answer by returning without `next`. Hooks on `turn.step` and `process.spawn` are async generators (`yield* next(e)`).
- Hooks fail open: one that throws, runs past its limit or returns the wrong shape is skipped. Every guard gets a `.catch` that answers with that event's own refusal: `{ deny }` for `tool.call`, `{ decision: 'deny', reason }` for `tool.check`, `{ refuse }` for `plugin.register`. On `tool.call` and `plugin.register`, where the guard may already have called `next`, pass on with `next.called ? next(e) : <refusal>`. On `tool.check` nothing has run yet, so its `.catch` always returns the deny, even when the guard had awaited `next(e)`.
- A guard on shell commands names every tool that runs one. On Windows the `PowerShell` tool is on by default for claude.ai and Console accounts and is Claude's primary shell, so `{ tool: 'Bash' }` alone lets every PowerShell command through; `Monitor` runs a background shell command (no `command` on a WebSocket watch). A matcher array is one-of. All three put the command in `command`; write the checks for PowerShell syntax too (`Remove-Item -Recurse`, not only `rm -rf`):

```js
on('tool.call', { tool: ['Bash', 'PowerShell', 'Monitor'] }, guard).catch(async ($, e, next) => {
  return next.called ? next(e) : { deny: 'The command guard failed, so this command was not run: ' + next.error.kind }
})
```

- A hook has 10 s of its own execution per event (50 ms for `prompt.edit`), a `.catch` 1 s, and all mods share one worker: never loop without awaiting.
- Plan for where nothing is drawn (the VS Code panel, `claude -p`, the Agent SDK, cloud sessions; Desktop WSL sessions run no mods) and fall back to a transcript line or command text. `Svg` draws only in Desktop; `Raster` and `Image` only in the terminal.
- `$.model.complete`, `$.model.classify`, `$.model.fork` and `$.agent.spawn` spend the plan: pass `model` per `model-mix` to all but `$.model.fork` (it runs on the session's model, so call it only from a command the person runs), `haiku` only as `model-mix` allows it, never Fable. Call a model only from a command, a button or a timer with a capped count, never from a hook that fires on every event. A hook that sets `model` or `effort` may move work down to the `model-mix` row, never above it or to Fable, unless the person asked for exactly that.
- Read `writing.md` for the rest: budgets and crashes, `$.process.run` on Windows, registering commands, state lifetimes and redraw, every rule on model calls, and keeping prompt text stable for the cache.

## 4. Develop and test

- Where the work runs (`coordinator-method`): a cloud worker may write the mod's code and run `claude plugin validate` and `claude plugin test`, but a cloud session draws nothing. Every drawing is checked on this machine, and the `CLAUDE_CODE_PLUGIN_DIRS` install happens here too. A mod that draws is a UI change: send a screenshot of each drawing and its fallback and wait for the ok before committing; for a cloud worker's PR, before merging.
- Load it with `claude --plugin-dir <source>` in a terminal; the Desktop Code tab takes no flags, so check Desktop drawings through `CLAUDE_CODE_PLUGIN_DIRS` there, never from a terminal run.
- After every change: `claude plugin validate <dir> --strict`, then check that its `hooks:` and `calls:` lines match the purpose.
- Tests: `*.test.ts` with `claude-code/testing`, run by `claude plugin test <dir>`. Cover every guard's failure path.
- Read `testing.md` for hot reload and protected writes, smoke checks (including Git Bash's path conversion of `/<name>`), debugging without `tail -f`, and copied installs.

## 5. Install globally

- Personal, from source in every session: `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, keeping the keys already there. Versioned and shareable: a marketplace, then `claude plugin install <name>@<marketplace>`.
- Confirm it loaded where it runs. Exact syntax, Windows JSON paths and how to confirm in the terminal and in Desktop: `testing.md`.

## 6. Vet someone else's mod

- Read the source and run `claude plugin validate <dir>` without installing. Every entry on its `hooks:` and `calls:` lines needs a reason in the mod's purpose.
- Deny rules never limit a mod's own `$.fs` and `$.process` calls, and processes it starts run outside the sandbox. A `tool.check` that answers allow approves what an `ask` rule or a non-managed `PreToolUse` hook would stop, skips the auto-mode classifier, and, without managed settings or a Team or Enterprise sign-in, can approve what a `deny` rule refuses.
- `--plugin-dir` already runs the mod's code with the person's permissions: run it only after every entry has a reason, and before installing.
- Read `vetting.md` for the entries to look at hardest, what a mod can get past, and the off switches (including what they stop besides mods).

## Done when

- The gate's choice is stated: the mod covers a need no lighter extension does, or the answer names the lighter extension and why.
- `claude plugin validate --strict` passes and every `hooks:` and `calls:` line is explained by the purpose.
- `claude plugin test` passes, with a failure-path test for every guard, and every drawing has a fallback, checked where the person will see it (terminal or Desktop).
- The source lives outside `dev-mods`, copied installs carry a bumped `version`, and the mod shows as loaded where it runs (section 5).
- For a vetted mod: each risky line is explained, it ran under `--plugin-dir` first, and the answer says install or not.
