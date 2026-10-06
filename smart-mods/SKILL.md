---
name: smart-mods
description: "Claude Code mods judgement: whether a mod or a lighter extension (CLAUDE.md, skill, settings hook, MCP server) fits, how to write, test and install a mod globally, and how to vet one. Use before writing, changing, installing or reviewing a Claude Code mod (a JS/TS plugin that runs inside Claude Code) or any plugin from a marketplace, a repository or --plugin-dir (it may contain a mod), and whenever the person asks for a pane, a band above the prompt, a custom /command that runs code, a guard that holds or answers tool calls, rewriting prompts or tool calls, or restyling Claude Code's interface, in any project."
---

A mod is a plugin whose JavaScript or TypeScript hooks module runs inside the Claude Code process, unsandboxed, with the person's permissions. This skill decides when to write one and how to ship it safely. API detail lives in the built-in `plugin-authoring` skill (`/plugin-authoring`) and in the types Claude Code writes into the mod's `.claude-plugin/types/` each time it loads the mod from `--plugin-dir` or loads a mod Claude wrote: those types match the running version and win over the docs pages and over memory.

Model per piece of work (`model-mix`): a guard (`tool.call`, `tool.check`, `plugin.register` hooks), anything that reads secrets or approves tool calls, and vetting someone else's mod are its security-critical row, Opus high, even when small. Delegated vetting goes to one Opus high agent with the whole source, never to Sonnet fan-out readers. Panes, bands, commands and restyling are implementation: Sonnet high.

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
- A mod is a plugin whose `hooks/hooks.json` has `"modules": ["./register.js"]`, exporting `register(on, options)`. No Node.js, bundler or build step. A name that passes as Anthropic's fails `claude plugin validate`: a `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` prefix, the exact names `claude`, `anthropic`, `anthropics`, `claude-code` or `claude-mods`, or `official` beside claude or anthropic; `claude`, `anthropic` or `anthropics` as a whole word elsewhere is a warning that fails under `--strict`.
- Settings the person should tune go in the manifest's `userConfig`: Claude Code asks for them when the plugin is enabled and hands them to `register` as `options`. Mark tokens and keys `"sensitive": true`, or they are stored in plain text in `settings.json`.

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

- Budget: 10 s of the hook's own execution per event (50 ms for `prompt.edit`), 1 s for a `.catch`. Time inside `next` or a mods API call does not count, except `$.clock.sleep`; awaiting your own promise does. `$.process.run` has its own 30 s default (10 min max). All installed mods share one worker: never loop without awaiting. A crash traced to one mod unloads it; 3 untraced crashes unload every non-built-in mod until `/reload-plugins`.
- `$.process.run` takes an argument list and uses no shell: name a real executable (`git`, `gh`) and wrap the call in try/catch. On Windows, PowerShell cmdlets and cmd built-ins are not programs: run them as `['powershell', '-NoProfile', '-Command', '...']` (`pwsh` only where PowerShell 7 is installed) or `['cmd', '/c', '...']` only when the purpose needs them.
- Register commands in `session.start`, last in that hook or inside try/catch: a throw skips the rest of the hook.
- State by lifetime: a module variable dies on every reload; `$.state` lasts the session but resets on `/clear`, `/resume` and `/branch` (reload it from `classic.SessionStart`); `$.store` is a JSON file shared by every session on the machine, 4 MiB, kept until no session uses it for `cleanupPeriodDays`. Store get plus set and `$.fs.write` are not atomic: one key per item, read again before writing.
- Redraw: after changing a module variable or `$.store`, call `$.ui.invalidate('ui.render')`; a `$.state` write redraws by itself.
- Plan for where nothing is drawn: check which app the session runs in (`$.session.surfaces` in the generated types; `e.surface` in `ui.render` only tells `terminal` from `desktop`) and fall back to a transcript line or command text. The VS Code panel, `claude -p` and the Agent SDK run hooks without drawing; cloud sessions draw nothing; Desktop WSL sessions run no mods at all. `Svg` draws only in Desktop; `Raster` and `Image` only in the terminal. The permission prompt cannot be redrawn.
- Cost: `$.model.complete`, `$.model.classify`, `$.model.fork` and `$.agent.spawn` spend the person's plan or API key, shared with everything in `model-mix`. Pass `model` to `$.model.complete`, `$.model.classify` and `$.agent.spawn`, set to the model the `model-mix` table gives for the job (Sonnet for sorting or summarizing text), and give `$.model.complete` a low `maxTokens` (default 1024) and `effort: 'low'` for a label. Never pass the `haiku` alias the docs' examples use, never pass Fable, and never omit `model`: `$.model.classify` without it uses the engine's small fast model, and `$.agent.spawn` without it runs on the agent's own model or the session's. `$.model.fork` takes only `prompt` and always runs on the session's model, so call it only from a command the person runs. Call a model only from a command, a button or a timer with a capped count, never from hooks that fire on every event (`tool.call`, `tool.check`, `turn.step`, `ui.render`, `session.append`, `prompt.edit`).
- A `turn.step` or `agent.spawn` hook that sets `model` or `effort` follows `model-mix` too: it may move work down to the row `model-mix` gives, never above it and never to Fable, unless the person asked for exactly that.
- Text from `prompt.section`, `prompt.context` or `skill.prompt` hooks that changes between requests invalidates the prompt cache: keep it stable.

## 4. Develop and test

- Where the work runs (`coordinator-method`): a cloud worker may write the mod's code and run `claude plugin validate` and `claude plugin test`, but a cloud session draws nothing. Every drawing is checked on this machine, and the `CLAUDE_CODE_PLUGIN_DIRS` install happens here too. A mod that draws is a UI change: send a screenshot of each drawing and its fallback and wait for the ok before committing; for a cloud worker's PR, before merging.
- Terminal: run `claude --plugin-dir <source>`: the mod reloads on save, and a broken save keeps the previous version loaded. To have Claude change it, start the session that way; files saved during a turn reload when the turn ends.
- Desktop: the Code tab takes no flags and runs its own bundled Claude Code. Add the source to `CLAUDE_CODE_PLUGIN_DIRS` (section 5), open a new local session, read its version with `/status` (types generated by a terminal session describe the terminal's version), and check every drawing and its fallback there; after each edit run `/reload-plugins`. Never report a Desktop-only drawing as checked from a terminal run.
- A mod Claude writes asks once per session to enable hot reloading: answer "Enable for this session". It never loads under `claude -p`, `dontAsk`, an untrusted workspace, `--safe-mode`, `--bare` or `disableAllHooks`. Under `default` and `acceptEdits`, writes to the mod's files under `~/.claude/dev-mods/` or the `--plugin-dir` folder are protected-path writes and ask for approval.
- After every change: `claude plugin validate <dir> --strict`, then check that its `hooks:` and `calls:` lines match the purpose. Smoke-check a command with `claude -p "/<name>" --plugin-dir <dir> --model sonnet --max-turns 1`: a mod command starts no Claude turn, but a mod that failed to load or a mistyped name reaches the model. In Git Bash prefix `MSYS2_ARG_CONV_EXCL='/<name>'`, or `/<name>` is turned into a file path and sent to the model as a prompt; it still converts `<dir>` and `<path>`. With `MSYS_NO_PATHCONV=1` instead, write every path as `C:/...`, never `~/` or `/c/`.
- Tests: `*.test.ts` with `claude-code/testing`, run by `claude plugin test <dir>`. Cover every guard's failure path.
- Debug: `$.ui.log(msg, { to: 'debug' })` writes to the debug log. As an agent, reproduce with `claude -p "/<name>" --plugin-dir <dir> --model sonnet --max-turns 1 --debug-file <path>` (in Git Bash with the same prefix; load errors also go to stderr), then read the log once: `grep <mod-name> <path> | tail -n 50`, or in PowerShell `Select-String -Path <path> -Pattern <mod-name> | Select-Object -Last 50`. Never run `tail -f` or `Get-Content -Wait` from a tool call: they never exit. For an interactive repro, ask the person to run `claude --debug-file <path> --plugin-dir <dir>` in a terminal. To check whether mods can load at all, run `claude plugin test` in a folder without a mod and read its message.
- Never edit a copied install (GitHub, git, URL or npm marketplace): it is cached per version, so edit the source, bump `version` and reinstall. A relative-path plugin in a marketplace added from a local path loads in place: edits apply on `/reload-plugins`, and `version` does not pin it.

## 5. Install globally

- Personal, loaded from source in every session: add `CLAUDE_CODE_PLUGIN_DIRS` to the `env` block of `~/.claude/settings.json`, keeping the keys already there. Absolute paths, separated by `;` on Windows and `:` elsewhere; in JSON on Windows double every backslash: `"CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<you>\\mods\\my-mod"`.
- Versioned and shareable: list it in a marketplace (`.claude-plugin/marketplace.json`), `claude plugin marketplace add <path-or-repo>`, `claude plugin install <name>@<marketplace>`, then `/reload-plugins` in open sessions. A marketplace added from a local path points at that folder and loads its relative-path plugins in place: moving or deleting it stops the mod.
- Confirm the mod loaded: in a terminal session `/plugin` shows a dim `N mod active · <name>` line under its tabs. In the Desktop Code tab use + → Plugins → Manage plugins; for a mod loaded from `CLAUDE_CODE_PLUGIN_DIRS`, run its command or look for its drawing. A shared mod's README names the Claude Code version it was tested with.

## 6. Vet someone else's mod

- Read the source and run `claude plugin validate <dir>` without installing. Every entry on the `hooks:` and `calls:` lines needs a reason in the mod's purpose; the lists below are where to look hardest, not the only entries that count:
  - `calls:` `$.fs.*`, `$.process.*`, `$.http.fetch`, `$.env.*` (read the `env reads:` and `env writes:` lines), `$.settings.read`, `$.mcp.*`, `$.tool.call`, `$.command.run`, `$.config.set`, `$.session.messages`, `$.session.send`, `$.prompt.submit` (with `asUser: true` it speaks as the person), `$.prompt.fill`, and `$.model.*` and `$.agent.spawn` (they spend the plan).
  - `hooks:` `tool.call`, `tool.check`, `prompt.submit`, `session.append`, `ui.render{component=AskUserQuestion}`; `turn.step` and `agent.spawn` (they can switch the model or effort of every request or subagent, spending usage and overriding `model-mix`); `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`, `skill.prompt`, `tool.describe`, `prompt.mention` (they rewrite or redirect what Claude reads, skills included); `session.receive`, `session.send` (they can read or suppress messages between sessions); `ui.input`, `ui.press` (they see what the person types into other mods' fields); `config.set`; `plugin.register`, `engine.create` and any hook named after a mods API method, such as `fs.read`, `http.fetch` or `model.complete` (they act on other mods' calls).
- Deny rules never limit a mod's own `$.fs` and `$.process` calls: with `Read(.env)` denied, a mod can still read `.env`. `tool.check` returning allow approves calls an `ask` rule would prompt for and calls a non-managed `PreToolUse` hook blocked, and in auto mode skips the classifier. Without managed settings or a Team or Enterprise sign-in, it can also approve calls a `deny` rule refuses. Processes a mod starts run outside the sandbox.
- `--plugin-dir` already runs the mod's code with the person's permissions: run it only after every entry above has a reason, and before installing.
- Off switches: disable in `/plugin` (Desktop: + → Plugins → Manage plugins) for one mod; `--safe-mode` or `--bare` for one session; `"disableAllHooks": true` in `~/.claude/settings.json` for every mod the person installed (the plugin's skills, agents and MCP servers still load, and organization-managed mods keep running). Built-in mods stay on. `disableAllHooks` and `--safe-mode` also stop the person's settings hooks and custom status line, so a terminal `usage file:` that `model-mix` reads stops updating: say so, and expect its budget check to ask for `/usage` until the line runs again.

## Done when

- The gate's choice is stated: the mod covers a need no lighter extension does, or the answer names the lighter extension and why.
- `claude plugin validate --strict` passes and every `hooks:` and `calls:` line is explained by the purpose.
- `claude plugin test` passes, with a failure-path test for every guard, and every drawing has a fallback, checked where the person will see it (terminal or Desktop).
- The source lives outside `dev-mods`, copied installs carry a bumped `version`, and the mod shows as loaded where it runs (section 5).
- For a vetted mod: each risky line is explained, it ran under `--plugin-dir` first, and the answer says install or not.
