# context-hygiene reference

Catalogue for `SKILL.md`: the layers, the cache rules, the settings and the compact templates. Sources are the Claude Code docs (costs, prompt-caching, model-config, skills, memory, mcp, sub-agents, workflows) as read on 2026-10-07 and local reads in a Desktop session. A setting name or version floor here can change: check `/status` and the docs before a decision depends on one.

Contents: layers, measuring, cache rules, settings, compact templates, unverified.

## Layers

| Layer | What loads | Measure | Cut |
| --- | --- | --- | --- |
| System prompt and built-in tools | Every turn, every session | `/context` ("System tools") | Nothing to cut. Size is not published |
| MCP tools | Tool names only while tool search defers definitions | `/context` ("MCP tools") | Disable or remove idle servers and connectors |
| MCP server instructions | Each connected server's instructions, every turn | `/context`, `get_usage` | Same |
| Skills listing | Name, description and `when_to_use` per skill, cut at 1,536 characters each; about 100 tokens per skill is the official figure | `/context`, `/skills` then `t` to sort by tokens | `disable-model-invocation`, `skillOverrides` |
| Invoked skill body | Stays in the session after the call; after auto-compact the latest call of each skill is re-attached, first 5,000 tokens each, 25,000 combined | `/context` | Load later, `context: fork` |
| `CLAUDE.md` | Global, project and local files at launch, in the main session and in every non-fork subagent | `/context` | Under 200 lines, rules in skills, `omitClaudeMd: true` on a subagent (v2.1.271+; managed policy files still load) |
| Auto memory | First 200 lines or 25KB of `MEMORY.md` | `/context` | Keep the index short |
| Messages | Everything said and returned | `/context`, `get_usage` | Section 4 of `SKILL.md`, compact, clear |

One reading, a coordinator session after about a day: 57% of a 1M window; messages 49%, system tools 3%, MCP tools 2%, skills 1%. The listed fixed layers add up to about 6%, so the hygiene that pays most is on messages.

## Measuring

| Where | Command | Gives |
| --- | --- | --- |
| Any session | `/context` | Window by category, suggestions |
| Any session | `/usage` | Plan bars, share by skill, subagent, plugin, MCP server; flags at 10%+; `Prompt cache (main)` line from v2.1.251 |
| Desktop | `get_usage` with `session_id` omitted or set | `context`: tokensUsed, contextWindow, percentUsed, autoCompactsAtPercent, categories. Unavailable for an idle, starting or archived session |
| Terminal | statusline JSON | Has a `context_window` field next to `rate_limits`; read the schema in the docs before parsing |
| Shell | `claude plugin details <name>` | Projected always-on and on-invoke tokens; a plain skill folder needs `--plugin-dir <that folder>` (estimates) |
| Shell | `claude -p "hello" --output-format json` | `usage.cache_creation` shows the 1 hour or 5 minute bucket for the terminal CLI, not for a Desktop session |
| Mod | `session.measure` event, `$.session.usage()` | `context` with tokens, window, percent after each main-thread turn; see `smart-mods` |

`/usage` attribution is approximate and local to the machine; it leaves out other devices and claude.ai.

## Cache rules

| Request | TTL on a subscription within plan usage | Once usage credits are drawn, API key, or a third-party provider (Bedrock, Vertex, Foundry) |
| --- | --- | --- |
| Main conversation | 1 hour | 5 minutes |
| Subagents, workflow agents, teammates, forks, compaction | 5 minutes | 5 minutes |

- The TTL inside a claude --cloud session is not documented (unverified).
- A cache hit resets the timer. A message after a longer break rereads the full context uncached.
- Overrides (v2.1.242+ for the two settings and their env vars): `promptCacheTtl` or `CLAUDE_CODE_PROMPT_CACHE_TTL` for the main bucket, `subagentPromptCacheTtl` or `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` for the rest, `ENABLE_PROMPT_CACHING_1H=1` for both, `FORCE_PROMPT_CACHING_5M=1` beats them all. A 1 hour write bills at a higher rate.
- Keeps the cache: effort change on Opus 5.5, Sonnet 5.5 and Fable 5.1 (subscription or API key), invoking skills, changing permission mode, spawning subagents.
- Spends the cache: a model switch (also through a skill or command frontmatter), `/fast`, connecting or removing an MCP server while tool definitions are not deferred.
- A workflow fan-out shares cache only between agents with identical model, effort, agent type, tools, schema and working directory.
- Idle cost: each `/loop` firing, each delivered cross-session message and each goal check-in sends the whole context. Goal check-ins stop after 3 per goal between prompts (v2.1.246+); `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` turns them off; `crossSessionInbound=hold` holds inbound messages.

## Settings and variables

All of these are the person's configuration: propose, do not set (`update-config` makes the edit once they agree).

| Goal | Setting |
| --- | --- |
| Lower the auto-compact window | `/autocompact 500k`, `--autocompact <auto\|tokens>`, `autoCompactWindow`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (100k to 1M); the env var beats the others; since v2.1.288 the command saves the window per model |
| Hold sessions to 200K | `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`. Sonnet 5.5 and Opus 5.5 are native 1M with no price premium; Haiku 5.5 is 1M but costs 5× per token past 100K. Every turn still resends the history |
| Drop MCP | `/mcp`, `disabledMcpServers`, `claude mcp remove`, `disableClaudeAiConnectors` or `ENABLE_CLAUDEAI_MCP_SERVERS=false` |
| Tool search | `ENABLE_TOOL_SEARCH=false` turns deferral off; a non-first-party `ANTHROPIC_BASE_URL` turns it off unless `ENABLE_TOOL_SEARCH=true` and the proxy forwards `tool_reference` blocks |
| Cap MCP output | `MAX_MCP_OUTPUT_TOKENS` (default 25,000, warning at 10,000, text over 50,000 characters goes to disk) |
| Skill listing | `disable-model-invocation: true` (also stops preloading into subagents and a scheduled task running the skill); `skillOverrides` values `on`, `name-only`, `user-invocable-only`, `off`, matched by skill name; plugin skills are not covered, use `/plugin`; `/skills` cycles the state |
| Subagent model | Order: per-call `model`, frontmatter, `CLAUDE_CODE_SUBAGENT_MODEL`, main model. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) makes the variable win (`model-mix`) |
| Thinking spend | Thinking cannot be switched off on Opus 5.5, Sonnet 5.5 and Haiku 5.5; lowering effort is the lever |

## Compact templates

Pick one and fill the angle brackets. Say what to keep and what to drop; a focus without a drop list keeps too much.

- Coordinator mid-queue: `/compact keep: the queue with status per item, open PRs with branch and head SHA, decisions taken and why, the budget color and last reading, the next action. Drop: file contents, command output, resolved review threads, exploration that led nowhere.`
- Implementation thread: `/compact keep: the ticket and its acceptance criteria, files changed and why, failing checks with their exact messages, what is left. Drop: full file reads, passing test output.`
- Research or review: `/compact keep: confirmed, refuted and unverified claims with source URLs and dates, the open gaps. Drop: fetched page bodies.`
- Before sleeping: compact with the first template, then write the scratch state file (`overnight`).

## Unverified

- Tool search deferral is confirmed as the default; the version that made it the default (v2.1.221 was claimed) is not.
- Whether workflow agents receive the skills listing and the global `CLAUDE.md`: docs say non-fork subagents load `CLAUDE.md`; the skills listing is not confirmed.
- A total budget for the skills listing across all skills: only the per-skill 1,536 character cap was found.
- The fixed per-turn size of the system prompt and built-in tools: not published. `/context` on the machine is the number.
- The effect of a terse output style on plan usage: no source, not quantified.
- Whether the main conversation really gets a 1 hour TTL in the Desktop Code tab: docs say yes, one third-party issue says 5 minutes. Read `/usage` in that session.
- `/skill-doctor` (v2.1.252+, needs feature-flag fetching) as a measuring tool: its scope and its availability in the Desktop-bundled build were not checked (`skill-audit`).
- The 500k auto-compact window and the 50% compact threshold are house starting values, not documented limits.
