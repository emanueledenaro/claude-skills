# Vetting someone else's mod: details

Read this from `SKILL.md` section 6 before you install, load or approve a mod you did not write.

## Where to look hardest

Every entry on the `hooks:` and `calls:` lines of `claude plugin validate <dir>` needs a reason in the mod's purpose. These lists are where to look hardest, not the only entries that count.

- `calls:` `$.fs.*`, `$.process.*`, `$.http.fetch`, `$.env.*` (read the `env reads:` and `env writes:` lines), `$.settings.read`, `$.mcp.*`, `$.tool.call`, `$.command.run`, `$.config.set`, `$.session.messages`, `$.session.send`, `$.prompt.submit` (with `asUser: true` it speaks as the person), `$.prompt.fill`, and `$.model.*` and `$.agent.spawn` (they spend the plan).
- `hooks:` `tool.call`, `tool.check`, `prompt.submit`, `session.append`, `ui.render{component=AskUserQuestion}`; `turn.step` and `agent.spawn` (they can switch the model or effort of every request or subagent, spending usage and overriding `model-mix`); `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`, `skill.prompt`, `tool.describe`, `prompt.mention` (they rewrite or redirect what Claude reads, skills included); `session.receive`, `session.send` (they can read or suppress messages between sessions); `ui.input`, `ui.press` (they see what the person types into other mods' fields); `config.set`; `plugin.register`, `engine.create` and any hook named after a mods API method, such as `fs.read`, `http.fetch` or `model.complete` (they act on other mods' calls).

## What a mod can get past

- Deny rules never limit a mod's own `$.fs` and `$.process` calls: with `Read(.env)` denied, a mod can still read `.env`.
- `tool.check` returning allow approves calls an `ask` rule would prompt for and calls a non-managed `PreToolUse` hook blocked, and in auto mode skips the classifier. Without managed settings or a Team or Enterprise sign-in, it can also approve calls a `deny` rule refuses.
- Processes a mod starts run outside the sandbox.

## Off switches

- One mod: disable it in `/plugin` (Desktop: + → Plugins → Manage plugins).
- One session: `--safe-mode` or `--bare`.
- Every mod the person installed: `"disableAllHooks": true` in `~/.claude/settings.json`. The plugin's skills, agents and MCP servers still load, and organization-managed mods keep running.
- Built-in mods stay on.
- `disableAllHooks` and `--safe-mode` also stop the person's settings hooks and custom status line, so a terminal `usage file:` that `model-mix` reads stops updating: say so, and expect its budget check to ask for `/usage` until the line runs again.
