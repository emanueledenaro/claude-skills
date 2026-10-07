# Writing a mod: details

Read this from `SKILL.md` sections 2 and 3 when you create the manifest, run a process, keep state, redraw, call a model or add text to the prompt.

## Manifest and names

- A name that passes as Anthropic's fails `claude plugin validate`: a `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` prefix, the exact names `claude`, `anthropic`, `anthropics`, `claude-code` or `claude-mods`, or `official` beside claude or anthropic. `claude`, `anthropic` or `anthropics` as a whole word elsewhere is a warning that fails under `--strict`.
- Settings the person should tune go in the manifest's `userConfig`: Claude Code asks for them when the plugin is enabled and hands them to `register` as `options`. Mark tokens and keys `"sensitive": true`, or they are stored in plain text in `settings.json`.

## Hook budgets and crashes

- 10 s of the hook's own execution per event (50 ms for `prompt.edit`), 1 s for a `.catch`. Time inside `next` or a mods API call does not count, except `$.clock.sleep`; awaiting your own promise does.
- `$.process.run` has its own 30 s default (10 min max).
- All installed mods share one worker: never loop without awaiting. A crash traced to one mod unloads it; 3 untraced crashes unload every non-built-in mod until `/reload-plugins`.

## Processes

- `$.process.run` takes an argument list and uses no shell: name a real executable (`git`, `gh`) and wrap the call in try/catch.
- On Windows, PowerShell cmdlets and cmd built-ins are not programs: run them as `['powershell', '-NoProfile', '-Command', '...']` (`pwsh` only where PowerShell 7 is installed) or `['cmd', '/c', '...']` only when the purpose needs them.

## Commands

- Register commands in `session.start`, last in that hook or inside try/catch: a throw skips the rest of the hook.

## State and redraw

- A module variable dies on every reload.
- `$.state` lasts the session but resets on `/clear`, `/resume` and `/branch`: reload it from `classic.SessionStart`.
- `$.store` is a JSON file shared by every session on the machine, 4 MiB, kept until no session uses it for `cleanupPeriodDays`. Store get plus set and `$.fs.write` are not atomic: one key per item, read again before writing.
- After changing a module variable or `$.store`, call `$.ui.invalidate('ui.render')`; a `$.state` write redraws by itself.

## Surfaces

- Check which app the session runs in (`$.session.surfaces` in the generated types; `e.surface` in `ui.render` only tells `terminal` from `desktop`).
- The VS Code panel, `claude -p` and the Agent SDK run hooks without drawing; cloud sessions draw nothing; Desktop WSL sessions run no mods at all.
- `Svg` draws only in Desktop; `Raster` and `Image` only in the terminal. The permission prompt cannot be redrawn.
- What to draw and how it looks: `mod-ui`.

## Model calls

- `$.model.complete`, `$.model.classify`, `$.model.fork` and `$.agent.spawn` spend the person's plan or API key, shared with everything in `model-mix`.
- Pass `model` to `$.model.complete`, `$.model.classify` and `$.agent.spawn`, set to the model the `model-mix` table gives for the job (Haiku for sorting, classifying or summarizing short text, Sonnet when the text runs past 100K tokens), and give `$.model.complete` a low `maxTokens` (default 1024) and `effort: 'low'` for a label.
- Pass `haiku` only as `model-mix` allows it (Claude Code v2.1.293 or later, Anthropic API), never pass Fable, and never omit `model`: `$.model.classify` without it uses the engine's small fast model, and `$.agent.spawn` without it runs on the agent's own model or the session's.
- `$.model.fork` takes only `prompt` and always runs on the session's model, so call it only from a command the person runs.
- Call a model only from a command, a button or a timer with a capped count, never from hooks that fire on every event (`tool.call`, `tool.check`, `turn.step`, `ui.render`, `session.append`, `prompt.edit`).
- A `turn.step` or `agent.spawn` hook that sets `model` or `effort` follows `model-mix` too: it may move work down to the row `model-mix` gives, never above it and never to Fable, unless the person asked for exactly that.

## Prompt text

- Text from `prompt.section`, `prompt.context` or `skill.prompt` hooks that changes between requests invalidates the prompt cache: keep it stable.
