# Overnight reference

Templates, commands and the fact table behind `SKILL.md`. Sources are the Claude Code docs pages named in each row (scheduled-tasks, prompt-caching, interactive-mode, desktop, desktop-scheduled-tasks, routines, remote-control, tools-reference, settings-reference, agent-view) and the changelog, read for this skill; local checks used `claude --version` and `claude --help` on 2.1.292.

## Pre-sleep commands

| Check | Command | Reads |
| --- | --- | --- |
| CLI version | `claude --version` | the runtime of a terminal night |
| Desktop version | no-model probe in `windows-ops`: newest `%APPDATA%\Claude\claude-code\<ver>\claude.exe --version` (layout undocumented) | Desktop's bundled Claude Code |
| Cache bucket, terminal CLI | `claude -p "hello" --output-format json` | `usage.cache_creation`: `ephemeral_1h_input_tokens` against `ephemeral_5m_input_tokens` |
| Cache bucket, the looping session | `/usage`, line `Prompt cache (main)` | the session that will actually loop |
| Usage and plan | `get_usage` (Desktop) or the usage file named in the plan line (terminal) | budget check in `model-mix` |
| Wait for a limit | `/rate-limit-options` | starts or cancels the usage-limit wait by hand |
| Phone link | `/remote-control` (Desktop), `claude --remote-control [name]` (terminal) | `remoteControlAtStartup` auto-connects every session |

## Cache and loop settings

- `promptCacheTtl` or `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` or `1h`, main conversation) and `subagentPromptCacheTtl` or `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` need v2.1.242+. `ENABLE_PROMPT_CACHING_1H=1` and `FORCE_PROMPT_CACHING_5M=1` are older; the 5-minute force wins over every other setting. Subagent frontmatter `experimental.cacheTtl` needs v2.1.248+.
- On a subscription the main conversation gets 1 hour inside plan usage. Subagents, workflows, teammates, forks and compaction get 5 minutes. Once usage credits are drawn, the main conversation also drops to 5 minutes. Each hit resets the timer.
- `autoCompactWindow`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (100k to 1M) and `--autocompact` set when auto-compact fires. Compact before sleeping, while the cache is warm.
- `ScheduleWakeup` with `stop: true` needs v2.1.202+. A wake delay is 1 minute to 1 hour.
- One bug report says an old `ScheduleWakeup` description claimed a 5-minute cache and that this was fixed in v2.1.207. The fix is not in the changelog: unverified. Source: github.com/anthropics/claude-code/issues/74149.

## Fallback loop prompt

```
/loop Read <state file path>. Do the wake steps of the overnight skill, section 4.
Pick the next delay: 30 minutes unless a watcher or CI event is pending.
End by scheduling the next wake or by stopping the loop.
```

Replace `<state file path>` with the project's scratch state file. Keep the prompt this short: it is resent on every wake.

## Surfaces at a glance

| Surface | Survives sleep | Usage-limit wait | Loop and watchers |
| --- | --- | --- | --- |
| Terminal CLI session | no, machine must be on | yes if reset under 24 h and `autoContinueAtUsageLimit` is on | `/loop` and `Monitor`, not restored after a restart |
| Desktop Code tab | no, machine must be on and the app open | unverified | same, on the bundled version |
| `/bg` or `--bg` session | survives sleep and a closed terminal, not a shutdown or reboot (shown as failed within 48 h, stopped after) | never | `/bg` carries `/loop`; `--bg` carries nothing |
| Remote Control session | needs the local process running | never | reconnects after sleep |
| Cloud session or routine | yes | not applicable | routine: 1 hour minimum, 100 scheduled runs per hour per account, research preview |

## State file template

Keep it short: it is read on every wake.

```
# Night of <date>
wake-up time: <hh:mm, from the person>
runner: <terminal 2.1.x | Desktop 2.1.x>   limit wait: <on | off | unknown>   cache bucket: <1h | 5m>
budget: color <green|yellow|red>, reserve <n>%, weekly <n>% at <time>
rules: <what may start, what is parked, stop conditions>

## Queue
- <issue/PR>: <state> -> <next step>

## In flight
- <worker, session URL or PR>: <started at>, <expected result>

## Parked (needs the person)
- <item>: waits for <decision | screenshot ok | manual merge>

## Wake log
- <time>: <what was read, what was done, next wake>
```

## Morning summary template

```
## Night summary <date>
Done: <items, one line each>
Merged: <PR numbers with subjects>
Needs you: <decision or ok, one line each, most urgent first>
Weekly points: <before> -> <after> (<n> points), 5-hour peak <n>%
Not done: <item> - <reason: red budget | limit | stalled | parked>
```

Numbers are plain readings from `model-mix`, with the time of each. A reason is always one of the listed words or a short fact.

## Not covered

- The Channels feature as a CI event source on Desktop or Windows: the page was not read.
- The exact Desktop name of the OS-notification toggle.
- Plan metering ratios for a night of wakes: take a before and after reading and record it as the run-cost note in `model-mix`.
