---
name: context-hygiene
description: "Keeping a Claude Code session cheap and sharp: what every turn pays for (system prompt, tools, MCP server instructions, skills listing, CLAUDE.md, memory, messages), how to measure it (/context, /usage, get_usage context in Desktop), when to /compact with a focus, /clear or hand off to a fresh session, the auto-compact window, prompt-cache TTL and idle wakes, trimming MCP servers and skills, and when a subagent keeps verbose work out of the window. Use when a session grows long or context is high (\"sessione lunga\", \"troppo contesto\", \"compatta\", \"/compact\", \"usage drains fast\"), before a big read or log dump, when adding MCP servers or skills, before a long idle or overnight wait, or when choosing clear versus compact versus handoff, in any project."
---

Decide what a session spends on context and when to shrink it. Every request re-sends the whole conversation, so the size of the context sets the price of every later turn, for the person's plan as much as for any API bill. Plan budget and colors live in `model-mix`, handoff of a coordinator in `coordinator-method`, overnight wakes in `overnight`, skill audits in `skill-audit`, workflow shapes in `smart-ultracode`. Tables, settings and the list of unverified points are in `reference.md`: read it when you need a setting name, a version floor or a cache rule.

## 1. What every turn pays

- **Fixed layers**, paid on every turn: system prompt, built-in tools, MCP tool names and server instructions, the skills listing (name and description of each skill), the global and project `CLAUDE.md`, the start of auto memory. Non-fork subagents pay `CLAUDE.md` (not Explore or Plan) and MCP servers again; whether they also get the skills listing and auto memory is unverified (`reference.md`).
- **Messages**, which grow: prompts, replies, tool results, invoked skill bodies. They stay until a compact or a `/clear`.
- One reading of the coordinator session after about a day: 57% of a 1M window, of which messages 49%, system tools 3%, MCP tools 2%, skills 1%. Messages dominate, so cut them first. Trim the fixed layers second: they are small per session but multiply across subagents and workflow agents.
- The cache decides what a turn costs: inside the TTL the history is read at the cached rate, after it the history is rewritten uncached. Cached re-reads cost about the same on every model, so the model choice does not change this part (`model-mix`).

## 2. Measure first

- `/context`: what fills the window, by category, with suggestions. Run it before trimming anything.
- Desktop: the read-only tool `get_usage` (`mcp__ccd_session_mgmt__get_usage`) returns `context` for this session or, with `session_id`, for another: tokens, percent, where auto-compact starts, the largest categories. An idle, starting or archived session reports it unavailable. The same call gives the plan windows for the budget check.
- `/usage`: share of recent usage by skill, subagent, plugin and MCP server, and flags for long context and cache misses at 10% or more. It counts this machine's history only, and it has no JSON mode. The `Prompt cache (main)` line (v2.1.251+) shows the TTL in use.
- Plugin or skill cost: `claude plugin details <name>` in a shell; for a plain skill folder, `claude --plugin-dir <skill folder> plugin details <name>`, one folder per call (`skill-audit`).
- Never guess a token count. Read one.

## 3. Compact, clear or hand off

| State | Do |
| --- | --- |
| The next task is unrelated and its state lives in files or the tracker | `/clear`. It costs nothing |
| The same task continues, history is long, cache is warm | `/compact` with a focus, at the next natural break |
| A break of over an hour with a big context | The next message reprocesses everything. `/clear` or hand off, unless the history is still needed |
| Past about half the window at a break, after a day of work, after two compactions, or moving to another surface | Hand off to a fresh session |
| Budget yellow or red | Compact at the next break (`model-mix`) |

- Natural breaks: after a merge, after a workflow result is read and its findings are written down, before a long wait, before sleeping.
- The thresholds are house starting values, not published limits.
- Write down what must survive before you shrink: decisions and why, open PRs and branches, the next step. A summary can blur them. The tracker and the scratch state file are the memory (`coordinator-method`).
- Compact with a focus: `/compact keep <what must survive>; drop <what can go>`. Templates are in `reference.md`. A `Compact instructions` section in `CLAUDE.md` steers every compaction.
- Compact while the cache is warm. The compaction request is itself large, and after a TTL gap it reads the whole history uncached.
- Handoff: the `handoff` skill writes the document to the OS temp dir. A coordinator hands off as `coordinator-method` says.
- Auto-compact starts late on a 1M model (about 97% of the window, 967K tokens) and summarizes without a focus. Propose a lower window, for example `/autocompact 500k` (unverified starting value), and let the person decide: settings are theirs.

## 4. Keep messages small

- Bound every command: `| head`, `--limit`, `gh ... --json <fields> -q <filter>`, `git diff --stat` before `git diff`, `git log --oneline -n 20`.
- Search before reading, and read a range of a file, not the file. Send a big output to a scratch file and grep it.
- An MCP result over 10,000 tokens warns; the default cap is 25,000 (`MAX_MCP_OUTPUT_TOKENS`). Ask for fewer fields or a smaller page.
- One tool call that reads little beats three that read a lot. Do not re-read a file you just wrote.
- A mechanical check (CI state, PR list, usage) is a shell or read-only call with a short output, not a model task (`model-mix`).
- Loading a skill adds its whole body to the session. Load one when its work starts, not as a precaution.

## 5. Subagents for verbose work

- A subagent has its own window. Big reads, log digs and wide greps stay there and only its summary returns. It still spends the same plan limits.
- Each non-fork subagent loads the whole `CLAUDE.md` set and a git status snapshot and inherits MCP servers; the built-in Explore and Plan agents skip `CLAUDE.md` and the git snapshot. A subagent also gets a 5-minute cache TTL, not 1 hour.
- So delegate work that is large and whose answer is small. Do not delegate a lookup that costs less than the brief. Ask for a short answer: findings with `file:line`, no pasted contents.
- Model and effort per `model-mix`; fan-out width and shape per `smart-ultracode`.
- A fork starts from the whole parent conversation: use it to isolate output, not to save tokens.

## 6. Do not bust the cache

- Do not switch model mid-task, and do not turn on `/fast`: either rereads the whole history uncached. A skill or command whose frontmatter names another model does the same.
- Safe while working: a change of effort on Opus 5.5 and Sonnet 5.5, invoking a skill, a permission mode change, spawning a subagent.
- Connecting or removing an MCP server is safe only while tool search defers tool definitions.
- Idle sessions still spend. Each `/loop` firing, cross-session message and goal check-in sends the full context. Rules for a night are in `overnight`.
- The main conversation has a 1 hour TTL on a subscription within plan usage and 5 minutes once usage credits are drawn. Docs say this; one third-party report says otherwise. Check the `/usage` line before a design depends on it.

## 7. Trim the fixed layers

Ask the person before changing their own configuration. Show the `/context` number first.

- **MCP.** Tool definitions are deferred by default, so tool names and each server's instructions are what loads. Disable idle servers (`/mcp`, `disabledMcpServers`, `claude mcp remove`, `disableClaudeAiConnectors`). A CLI such as `gh` costs no per-tool listing, so prefer it over an MCP server for the same job.
- **Skills.** Each skill's description is listed every session, capped at 1,536 characters. A skill with `disable-model-invocation: true` leaves the listing. `skillOverrides` sets `name-only`, `user-invocable-only` or `off`. `context: fork` keeps a skill's body out of the main window. Trim only if `/context` shows the skills at a few percent or more, and check that the skill still triggers. The audit method is `skill-audit`.
- **CLAUDE.md and memory.** Under 200 lines per file. `@imports` still load at launch. Path-scoped `.claude/rules` load only when matching files are touched. Move steps that matter for one workflow into a skill. Only the first 200 lines or 25KB of `MEMORY.md` load.
- **Output style and terse personas.** Their effect on plan usage is unquantified: do not count on them.

## Done when

- A `/context` or `get_usage` reading was taken before any trim, and its number is quoted.
- The choice of compact, clear or handoff is stated with its reason, and what must survive is written down.
- No setting changed without the person's ok.
- No model switch or `/fast` happened mid-task, and no idle wake sends a context that a compact could have shrunk first.
