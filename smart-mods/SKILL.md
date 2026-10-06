---
name: smart-mods
description: "Claude Code mods judgement: when a mod is the right extension, how to write, test and install one globally, and how to vet someone else's. Use before writing, changing, installing or reviewing a Claude Code mod (a JS/TS plugin that runs inside Claude Code), in any project."
---

A mod is a plugin whose JavaScript or TypeScript hooks module runs inside the Claude Code process, unsandboxed, with the person's permissions. This skill decides when to write one and how to ship it safely. API detail lives in the built-in `plugin-authoring` skill (`/plugin-authoring`) and in the types Claude Code writes into the mod's `.claude-plugin/types/` each time it loads the mod from `--plugin-dir` or loads a mod Claude wrote: those types match the running version and win over the docs pages and over memory.

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
- A mod is a plugin whose `hooks/hooks.json` has `"modules": ["./register.js"]`, exporting `register(on, options)`. No Node.js, bundler or build step. A name that passes as Anthropic's fails `claude plugin validate`: a `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` prefix, the exact names `claude`, `anthropic`, `anthropics`, `claude-code` or `claude-mods`, or `official` beside claude or anthropic; `claude` or `anthropic` as a word elsewhere is a warning that fails under `--strict`. Settings the person should tune go in the manifest's `userConfig`: Claude Code asks for them when the plugin is enabled and hands them to `register` as `options`.

## 3. Write hooks that load and fail safely

- Write for the static analysis, or the hook is never called: string-literal event names; `$` called in full (`$.ui.open`), never stored or destructured, passed only to same-file top-level functions or to `$.state`'s `read` and `update`; imports by relative path plus `claude-code`, no dynamic `import()` or `require`. `claude plugin validate` names each break.
- Every hook is `async ($, e, next)`: observe with `next(e)`, rewrite with `next({ ...e, field })` (`e` is frozen), answer by returning without `next`. Hooks on `turn.step` and `process.spawn` are async generators (`yield* next(e)`).
- Hooks fail open: one that throws or runs past its limit is skipped. Every guard gets a `.catch` that denies:

```js
on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
  return { deny: 'The command guard failed, so this command was not run: ' + next.error.kind }
})
```

- Budget: 10 s of the hook's own execution per event (50 ms for `prompt.edit`), 1 s for a `.catch`. Time inside `next` or a mods API call does not count, except `$.clock.sleep`; awaiting your own promise does. `$.process.run` has its own 30 s default (10 min max). All installed mods share one worker: never loop without awaiting. A crash traced to one mod unloads it; 3 untraced crashes unload every non-built-in mod until `/reload-plugins`.
- Register commands in `session.start`, last in that hook or inside try/catch: a throw skips the rest of the hook.
- State by lifetime: a module variable dies on every reload; `$.state` lasts the session but resets on `/clear`, `/resume` and `/branch` (reload it from `classic.SessionStart`); `$.store` is a JSON file shared by every session on the machine, 4 MiB, kept until no session uses it for `cleanupPeriodDays`. Store get plus set and `$.fs.write` are not atomic: one key per item, read again before writing.
- Redraw: after changing a module variable or `$.store`, call `$.ui.invalidate('ui.render')`; a `$.state` write redraws by itself.
- Plan for where nothing is drawn: check which app the session runs in (`$.session.surfaces` in the generated types; `e.surface` in `ui.render` only tells `terminal` from `desktop`) and fall back to a transcript line or command text. The VS Code panel, `claude -p` and the Agent SDK run hooks without drawing; cloud sessions draw nothing; Desktop WSL sessions run no mods at all. `Svg` draws only in Desktop; `Raster` and `Image` only in the terminal. The permission prompt cannot be redrawn.
- Cost: `$.model.complete` spends the person's plan or API key: cheapest model that fits, low `maxTokens`. Text from `prompt.section`, `prompt.context` or `skill.prompt` hooks that changes between requests invalidates the prompt cache: keep it stable.

## 4. Develop and test

- Run `claude --plugin-dir <source>`: the mod reloads on save, and a broken save keeps the previous version loaded. To have Claude change it, start the session that way; files saved during a turn reload when the turn ends.
- A mod Claude writes asks once per session to enable hot reloading: answer "Enable for this session". It never loads under `claude -p`, `dontAsk`, an untrusted workspace, `--safe-mode`, `--bare` or `disableAllHooks`. Under `default` and `acceptEdits`, writes to the mod's files under `~/.claude/dev-mods/` or the `--plugin-dir` folder are protected-path writes and ask for approval.
- After every change: `claude plugin validate <dir> --strict`, then check that its `hooks:` and `calls:` lines match the purpose. Smoke-check a command with `claude -p "/<name>" --plugin-dir <dir>`.
- Tests: `*.test.ts` with `claude-code/testing`, run by `claude plugin test <dir>`. Cover every guard's failure path.
- Debug: `claude --debug-file <path> --plugin-dir <dir>` and `$.ui.log(msg, { to: 'debug' })`. Follow the file with `tail -f <path> | grep <mod-name>`; in PowerShell, `Get-Content -Wait <path> | Select-String <mod-name>`. To check whether mods can load at all, run `claude plugin test` in a folder without a mod and read its message.
- Never edit a copied install (GitHub, git, URL or npm marketplace): it is cached per version, so edit the source, bump `version` and reinstall. A relative-path plugin in a marketplace added from a local path loads in place: edits apply on `/reload-plugins`, and `version` does not pin it.

## 5. Install globally

- Personal, loaded from source in every session: add the absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, paths separated by `;` on Windows and `:` elsewhere.
- Versioned and shareable: list it in a marketplace (`.claude-plugin/marketplace.json`), `claude plugin marketplace add <path-or-repo>`, `claude plugin install <name>@<marketplace>`, then `/reload-plugins` in open sessions. A marketplace added from a local path points at that folder and loads its relative-path plugins in place: moving or deleting it stops the mod.
- Confirm the `N mod active` line in `/plugin`. A shared mod's README names the Claude Code version it was tested with.

## 6. Vet someone else's mod

- Read the source and run `claude plugin validate <dir>` without installing. Every item needs a reason in the mod's purpose:
  - `calls:` `$.fs.read` and `$.fs.write`, `$.process.run` and `$.process.spawn`, `$.http.fetch`, `$.env.get` and `$.env.set` (also read the `env reads:` and `env writes:` lines), `$.settings.read`, `$.mcp.call`, `$.model.complete`, `$.prompt.submit` (with `asUser: true` it speaks as the person), `$.session.send`.
  - `hooks:` `tool.call`, `tool.check`, `prompt.submit`, `session.append`, `ui.render{component=AskUserQuestion}`, `plugin.register` and `engine.create` (they act on other mods).
- `tool.check` returning allow approves calls an `ask` rule would prompt for and calls a non-managed `PreToolUse` hook blocked, and in auto mode skips the classifier. Without managed settings or a Team or Enterprise sign-in, it can also approve calls a `deny` rule refuses. Processes a mod starts run outside the sandbox.
- Run it with `--plugin-dir` before installing. Off switches: disable in `/plugin` for one mod; `--safe-mode` or `--bare` for one session; `"disableAllHooks": true` in `~/.claude/settings.json` for every mod the person installed (it also stops their settings hooks and custom status line; the plugin's skills, agents and MCP servers still load, and organization-managed mods keep running). Built-in mods stay on.

## Done when

- The gate's choice is stated: the mod covers a need no lighter extension does, or the answer names the lighter extension and why.
- `claude plugin validate --strict` passes and every `hooks:` and `calls:` line is explained by the purpose.
- `claude plugin test` passes, with a failure-path test for every guard, and every drawing has a fallback.
- The source lives outside `dev-mods`, copied installs carry a bumped `version`, and `/plugin` shows the mod active.
- For a vetted mod: each risky line is explained, it ran under `--plugin-dir` first, and the answer says install or not.
