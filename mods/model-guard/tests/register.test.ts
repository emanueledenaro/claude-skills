import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const NOW = Date.parse('2026-10-07T12:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Weekly window resetting in 4 days: d = 3, pace ≈ 42.9.
const WEEKLY_RESET = new Date(NOW + 4 * DAY).toISOString()
const FIVE_RESET = new Date(NOW + HOUR).toISOString()

const weekly = (used: number) => ({ kind: 'seven_day', percentUsed: used, resetsAt: WEEKLY_RESET })
const fiveHour = (used: number) => ({ kind: 'five_hour', percentUsed: used, resetsAt: FIVE_RESET })

const GREEN = [weekly(40), fiveHour(10)]
const YELLOW = [weekly(60), fiveHour(10)]
const RED = [weekly(80), fiveHour(10)]
const PAUSED = [weekly(40), fiveHour(95)]

const MAX20 = { planLine: 'Max 20x · reserve 10%' }
const PRO = { planLine: 'Pro' }

type World = {
  rateLimits: unknown[]
  logs: { text: string; to: string }[]
  statuses: (string | undefined)[]
  calls: any[]
  spawns: any[]
}

// The world beneath the plugin: clock, usage reading, ui lines, and the tool and spawn bottoms.
function world(on: any, rateLimits: unknown[] = GREEN): World {
  const w: World = { rateLimits, logs: [], statuses: [], calls: [], spawns: [] }
  mock.clock(on, { now: NOW })
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: w.rateLimits } }))
  on('ui.log', async ($: any, e: any) => { w.logs.push({ text: e.text, to: e.to }); return { value: undefined } })
  on('ui.status', async ($: any, e: any) => { w.statuses.push(e.text); return { value: undefined } })
  on('tool.call', async ($: any, e: any) => { w.calls.push(e); return { result: 'ran' } })
  on('agent.spawn', async ($: any, e: any) => { w.spawns.push(e); return { model: 'resolved', agentId: 'agent-' + w.spawns.length } })
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.context', async ($: any, e: any) => ({ blocks: e.blocks }))
  on('session.measure', async ($: any, e: any) => ({ changed: e.changed }))
  return w
}

async function start($: any, isInteractive = true) {
  await $.session.start({ cwd: 'C:/repo', surface: isInteractive ? 'terminal' : null, isInteractive })
}

const AGENT = { tool: 'Agent', description: 'Fix the ticket', prompt: 'Fix issue 12' }

function spawnInput(runId: string, agentIndex: number, extra: Record<string, unknown> = {}) {
  return {
    tool_use_id: 'toolu_wf', prompt: 'Read the files', description: 'reader', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, model: 'sonnet', parentModel: 'claude-opus-5-5',
    background: true, fork: false, workflow: { runId, agentIndex }, ...extra,
  }
}

function denyText(r: any): string {
  return String((r && (r.deny ?? r.text)) || '')
}

function isRefused(r: any): boolean {
  return !!(r && (typeof r.deny === 'string' || r.isError === true))
}

describe('model-guard', () => {
  describe('unrelated tools pass untouched', () => {
    test('Read, SendMessage, TaskStop, git and gh commands reach the tool as given, even when red', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const inputs: any[] = [
        { tool: 'Read', file_path: 'C:/repo/a.txt' },
        { tool: 'SendMessage', to: 'worker-1', message: 'Fix the failing test on your PR' },
        { tool: 'TaskStop', task_id: 'task_1' },
        { tool: 'Bash', command: 'git commit -m "docs: run claude --cloud for big tasks"' },
        { tool: 'Bash', command: "gh pr create --title t --body 'launch with claude --cloud \"x\"'" },
        { tool: 'Bash', command: 'gh pr merge 12 --squash --match-head-commit abc' },
        { tool: 'PowerShell', command: 'Get-Content C:\\Users\\me\\.claude\\skills\\coordinator-method\\launch.exp' },
        { tool: 'Bash', command: 'cat ~/.claude/skills/coordinator-method/launch.exp' },
        { tool: 'RemoteTrigger', action: 'list' },
        { tool: 'Bash', command: "gh pr create --title \"x\" --body-file - <<'EOF'\nSteps:\nclaude --cloud \"fix the bug\"\nEOF" },
        { tool: 'Bash', command: "git commit -F - <<'EOF'\nclaude --cloud now gets --model\nEOF" },
        { tool: 'Bash', command: "cat > brief.md <<'EOF'\nclaude --model sonnet --cloud \"task\"\nexpect launch.exp t r l fable high\nEOF" },
        { tool: 'PowerShell', command: "@'\nDon't stop.\nclaude --cloud \"x\"\n'@ | Set-Content brief.md" },
        // Claude Code's commit and PR idiom: an odd quote or a backtick-quote code span in the body.
        { tool: 'Bash', command: "git commit -m \"$(cat <<'EOF'\nfeat: support 5\" displays\nclaude --cloud docs\nEOF\n)\"" },
        { tool: 'Bash', command: "gh pr create --title t --body \"$(cat <<'EOF'\nSet `\"enabled\": false` in config.\n\n```\nclaude -p \"msg\" --cloud abc\n```\nEOF\n)\"" },
        // Steering a cloud worker finishes open work.
        { tool: 'Bash', command: 'claude -p "Fix the failing lint on your PR #12" --cloud session_01ABC --output-format json' },
        { tool: 'PowerShell', command: 'claude --print "rebase on main" --cloud https://claude.ai/code/session_01ABC' },
        // Local management commands start no session.
        { tool: 'Bash', command: 'claude plugin validate mods/model-guard --strict' },
        { tool: 'Bash', command: 'claude --version' },
        { tool: 'Bash', command: 'claude mcp list' },
        { tool: 'Bash', command: 'claude agents --json' },
      ]
      for (const input of inputs) {
        const r = await $.tool.call(input)
        expect(isRefused(r)).toBe(false)
      }
      expect(w.calls.length).toBe(inputs.length)
      for (let i = 0; i < inputs.length; i++) expect(w.calls[i]).toMatchObject(inputs[i])
      expect(w.logs).toEqual([])
    })

    test('heredoc and here-string texts are not rewritten when green', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      const commands = [
        "gh pr create --title \"x\" --body-file - <<'EOF'\nSteps:\nclaude --cloud \"fix the bug\"\nEOF",
        "git commit -m \"$(cat <<'EOF'\nfeat: support 5\" displays\nclaude --cloud docs\nEOF\n)\"",
      ]
      for (const command of commands) await $.tool.call({ tool: 'Bash', command } as any)
      expect(w.calls.map(c => c.command)).toEqual(commands)
      expect(w.logs).toEqual([])
    })

    test('a follow-up to a cloud worker is never denied or rewritten: red, paused, Solo or green', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const steer = 'claude -p "Fix the failing test on your PR" --cloud session_01ABC --output-format json'
      for (const reading of [RED, PAUSED, GREEN]) {
        w.rateLimits = reading
        const r = await $.tool.call({ tool: 'Bash', command: steer } as any)
        expect(isRefused(r)).toBe(false)
      }
      expect(w.calls.map(c => c.command)).toEqual([steer, steer, steer])
      expect(w.logs).toEqual([])
    })

    test('a follow-up passes on Solo (Pro yellow) too', { options: PRO }, async ($, on) => {
      const w = world(on, YELLOW)
      await start($)
      const steer = 'claude -p "msg" --cloud cse_0123 --output-format json'
      expect(isRefused(await $.tool.call({ tool: 'PowerShell', command: steer } as any))).toBe(false)
      expect(w.calls[0].command).toBe(steer)
    })
  })

  describe('rule 1: Agent without a model', () => {
    test('no subagent_type, general-purpose, Explore and Plan get sonnet', async ($, on) => {
      const w = world(on)
      await start($)
      for (const type of [undefined, 'general-purpose', 'Explore', 'Plan']) {
        const input: any = type ? { ...AGENT, subagent_type: type } : { ...AGENT }
        await $.tool.call(input)
      }
      expect(w.calls.map(c => c.model)).toEqual(['sonnet', 'sonnet', 'sonnet', 'sonnet'])
      expect(w.logs.filter(l => l.to === 'transcript').length).toBe(4)
      expect(w.logs[0].text).toContain('sonnet')
    })

    test('another type keeps its own model, logged to debug only', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ ...AGENT, subagent_type: 'security-reviewer' } as any)
      expect(w.calls[0].model).toBeUndefined()
      expect(w.logs).toEqual([{ text: expect.stringContaining('security-reviewer'), to: 'debug' }])
    })

    test('a named model passes as given', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ ...AGENT, model: 'opus' } as any)
      expect(w.calls[0].model).toBe('opus')
      expect(w.logs).toEqual([])
    })
  })

  describe('rule 2: haiku', () => {
    test('the haiku alias becomes sonnet', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ ...AGENT, model: 'haiku' } as any)
      expect(w.calls[0].model).toBe('sonnet')
      expect(w.logs[0]).toEqual({ text: expect.stringContaining('haiku -> sonnet'), to: 'transcript' })
    })
  })

  describe('rule 3: fable', () => {
    test('fable becomes opus when the plan is not known', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ ...AGENT, model: 'fable', run_in_background: false } as any)
      expect(w.calls[0].model).toBe('opus')
    })

    test('fable becomes opus even on Max 20x, green, foreground, no isolation; the reason reaches the transcript once', async ($, on) => {
      const w = world(on)
      await start($)
      await $.prompt.context({ blocks: [], instructionFiles: [
        { path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: '# Me\nClaude plan: Max 20x · reserve 10%\n' },
      ] } as any)
      await $.tool.call({ ...AGENT, model: 'fable', run_in_background: false } as any)
      await $.tool.call({ ...AGENT, model: 'fable', run_in_background: false } as any)
      expect(w.calls.map(c => c.model)).toEqual(['opus', 'opus'])
      expect(w.logs).toEqual([
        { text: expect.stringContaining('fable -> opus'), to: 'transcript' },
        { text: expect.stringContaining('fable -> opus'), to: 'debug' },
      ])
      expect(w.logs[0].text).toContain('Fable')
    })

    test('fable becomes opus in the background, with isolation, or when yellow', async ($, on) => {
      const w = world(on)
      await start($)
      await $.prompt.context({ blocks: [], instructionFiles: [
        { path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: 'Claude plan: Max 20x' },
      ] } as any)
      await $.tool.call({ ...AGENT, model: 'fable' } as any)
      await $.tool.call({ ...AGENT, model: 'fable', run_in_background: false, isolation: 'worktree' } as any)
      w.rateLimits = YELLOW
      await $.tool.call({ ...AGENT, model: 'fable', run_in_background: false } as any)
      expect(w.calls.map(c => c.model)).toEqual(['opus', 'opus', 'opus'])
    })

    test('a workflow agent pinned to Fable is denied with a reason to pin opus', async ($, on) => {
      const w = world(on)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_fable', 1, { model: 'fable' }) as any)
      expect(r.deny).toContain("model: 'opus'")
      expect(w.spawns).toEqual([])
      expect(w.logs[0].to).toBe('transcript')
    })

    test('an unpinned workflow agent under a Fable session is denied', async ($, on) => {
      const w = world(on)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_fable2', 1, { model: undefined, parentModel: 'claude-fable-5-1' }) as any)
      expect(r.deny).toContain('opus')
      expect(w.spawns).toEqual([])
    })

    test('a workflow agent on the haiku alias is denied, a pinned opus id passes', async ($, on) => {
      const w = world(on)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_h', 1, { model: 'haiku' }) as any)
      expect(r.deny).toContain("model: 'sonnet'")
      const ok: any = await $.agent.spawn(spawnInput('wf_h', 2, { model: 'claude-opus-5-5' }) as any)
      expect(ok.deny).toBeUndefined()
      expect(w.spawns.length).toBe(1)
    })

    test('a spawn outside a workflow passes untouched', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const input: any = spawnInput('x', 1, { model: 'fable' })
      delete input.workflow
      const r: any = await $.agent.spawn(input)
      expect(r.deny).toBeUndefined()
      expect(w.spawns[0].model).toBe('fable')
      expect(w.logs).toEqual([])
    })
  })

  describe('rule 4: red budget', () => {
    test('denies Agent, Workflow, RemoteTrigger run, cloud and launch.exp launches with the numbers', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const launches: any[] = [
        { ...AGENT, model: 'sonnet' },
        { tool: 'Workflow', script: 'export const meta = { name: "x", description: "x", phases: [] }' },
        { tool: 'RemoteTrigger', action: 'run', trigger_id: 'trig_1' },
        { tool: 'Bash', command: 'claude --model sonnet --cloud "fix ci"' },
        { tool: 'PowerShell', command: 'expect ~/.claude/skills/coordinator-method/launch.exp task.txt rules.txt w.log sonnet high' },
      ]
      for (const input of launches) {
        const r = await $.tool.call(input)
        expect(isRefused(r)).toBe(true)
        const text = denyText(r)
        expect(text).toContain('Budget red')
        expect(text).toContain('margin +37')
        expect(text).toContain('weekly 80% used')
        expect(text).toContain('2026-10-11 12:00 UTC')
        expect(text).toContain('finish open work only')
        // Red by pace with no banked reset: no redeem advice.
        expect(text).not.toContain('redeem')
      }
      expect(w.calls).toEqual([])
      expect(w.logs.length).toBe(5)
      expect(w.logs[0].text).toContain('budget rosso')
    })

    test('the redeem advice only with a counted weekly reset and weekly use at or past 100 - reserve',
      { options: { planLine: 'Max 5x · reserve 15% · banked: weekly reset, expires 2026-10-30' } }, async ($, on) => {
        // 84% is red by pace (the banked reset lifts the pace to about 56) but under 100 - reserve.
        const w = world(on, [weekly(84), fiveHour(10)])
        await start($)
        const pace = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
        expect(denyText(pace)).toContain('Budget red')
        expect(denyText(pace)).not.toContain('redeem')
        w.rateLimits = [weekly(90), fiveHour(10)]
        const over = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
        expect(denyText(over)).toContain('A banked weekly reset is counted: ask the person to redeem it (Settings > Usage).')
      })

    test('local headless sessions (-p, --bg) are new launches: denied while red', async ($, on) => {
      const w = world(on, RED)
      await start($)
      for (const command of ['claude -p "refactor the parser" --max-turns 30', 'claude --bg "run the nightly sweep"']) {
        const r = await $.tool.call({ tool: 'Bash', command } as any)
        expect(isRefused(r)).toBe(true)
        expect(denyText(r)).toContain('Budget red')
      }
      expect(w.calls).toEqual([])
    })

    test('status pinned while red, cleared when the budget is green again', async ($, on) => {
      const w = world(on, RED)
      await start($)
      await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      expect(w.statuses[w.statuses.length - 1]).toContain('model-guard: budget rosso')
      w.rateLimits = GREEN
      await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      expect(w.statuses[w.statuses.length - 1]).toBeUndefined()
      expect(w.calls.length).toBe(1)
    })

    test('redPolicy warn allows, still applies the model rules, and logs', { options: { redPolicy: 'warn' } }, async ($, on) => {
      const w = world(on, RED)
      await start($)
      await $.tool.call({ ...AGENT } as any)
      await $.tool.call({ tool: 'Bash', command: 'claude --cloud "fix ci"' } as any)
      expect(w.calls[0].model).toBe('sonnet')
      expect(w.calls[1].command).toBe('claude --model sonnet --cloud "fix ci"')
      expect(w.logs[0].text).toContain('redPolicy warn')
      expect(w.statuses[w.statuses.length - 1]).toContain('lanci solo segnalati')
    })

    test('a Workflow resume finishes open work: allowed and logged once', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const r = await $.tool.call({ tool: 'Workflow', resumeFromRunId: 'wf_open' } as any)
      expect(isRefused(r)).toBe(false)
      expect(w.calls).toEqual([expect.objectContaining({ tool: 'Workflow', resumeFromRunId: 'wf_open' })])
      expect(w.logs).toEqual([{ text: expect.stringContaining('ripresa del workflow consentita'), to: 'transcript' }])
    })

    test('a local session resume (--resume, -c with -p or --bg) finishes open work: allowed untouched and logged', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const commands = ['claude --resume abc -p "x"', 'claude -c -p "x"', 'claude --bg --resume abc']
      for (const command of commands) expect(isRefused(await $.tool.call({ tool: 'Bash', command } as any))).toBe(false)
      expect(w.calls.map(c => c.command)).toEqual(commands)
      expect(w.logs.length).toBe(3)
      for (const l of w.logs) expect(l).toEqual({ text: expect.stringContaining('ripresa della sessione consentita'), to: 'transcript' })
      // --fork-session starts a new session: denied while red.
      const fork = await $.tool.call({ tool: 'Bash', command: 'claude --resume abc -p "x" --fork-session' } as any)
      expect(denyText(fork)).toContain('Budget red')
      expect(w.calls.length).toBe(3)
    })

    test('a RemoteTrigger update that disables a routine passes, one that enables it does not', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const off = await $.tool.call({ tool: 'RemoteTrigger', action: 'update', trigger_id: 'trig_1', body: { enabled: false } } as any)
      const on2 = await $.tool.call({ tool: 'RemoteTrigger', action: 'update', trigger_id: 'trig_1', body: { enabled: true } } as any)
      expect(isRefused(off)).toBe(false)
      expect(isRefused(on2)).toBe(true)
      expect(w.calls).toEqual([expect.objectContaining({ action: 'update', body: { enabled: false } })])
    })

    test('a session.measure reading counts when usage() has none', async ($, on) => {
      const w = world(on, [])
      await start($)
      await $.session.measure({ context: { window: 200000 }, rateLimits: RED, changed: ['rateLimits'] } as any)
      const r = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      expect(isRefused(r)).toBe(true)
      expect(w.statuses[0]).toContain('budget rosso')
    })
  })

  describe('rule 5: 5-hour window paused', () => {
    test('denies launches with the reset time', async ($, on) => {
      const w = world(on, PAUSED)
      await start($)
      const r1 = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      const r2 = await $.tool.call({ tool: 'Bash', command: 'claude --model sonnet --cloud "x"' } as any)
      for (const r of [r1, r2]) {
        expect(isRefused(r)).toBe(true)
        expect(denyText(r)).toContain('Wait until 13:00 UTC')
      }
      expect(w.calls).toEqual([])
      expect(w.logs[0].text).toContain('13:00 UTC')
    })

    test('denies even with redPolicy warn', { options: { redPolicy: 'warn' } }, async ($, on) => {
      world(on, PAUSED)
      await start($)
      const r = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      expect(isRefused(r)).toBe(true)
    })

    test('denies a Workflow resume too', async ($, on) => {
      const w = world(on, PAUSED)
      await start($)
      const r = await $.tool.call({ tool: 'Workflow', resumeFromRunId: 'wf_open' } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('Wait until 13:00 UTC')
      expect(w.calls).toEqual([])
    })

    test('denies a local headless session too', async ($, on) => {
      const w = world(on, PAUSED)
      await start($)
      const r = await $.tool.call({ tool: 'PowerShell', command: 'claude -p "x" --model sonnet' } as any)
      expect(denyText(r)).toContain('Wait until 13:00 UTC')
      expect(w.calls).toEqual([])
    })

    test('denies a local session resume too', async ($, on) => {
      const w = world(on, PAUSED)
      await start($)
      for (const command of ['claude --resume abc -p "x"', 'claude -c -p "x"', 'claude --bg --resume abc']) {
        const r = await $.tool.call({ tool: 'Bash', command } as any)
        expect(isRefused(r)).toBe(true)
        expect(denyText(r)).toContain('Wait until 13:00 UTC')
      }
      expect(w.calls).toEqual([])
    })

    test('with a banked 5-hour reset and a green week, asks to offer the redemption',
      { options: { planLine: 'Max 5x · banked: 5-hour reset, no expiry' } }, async ($, on) => {
        world(on, PAUSED)
        await start($)
        const r = await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
        expect(denyText(r)).toContain('A 5-hour reset is banked')
      })
  })

  describe('rule 6: workflow width', () => {
    test('Max 5x green: 8 agents per run, the 9th denied, a re-raised index passes, runs count apart', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      for (let i = 1; i <= 8; i++) {
        const r: any = await $.agent.spawn(spawnInput('wf_w1', i) as any)
        expect(r.deny).toBeUndefined()
      }
      const ninth: any = await $.agent.spawn(spawnInput('wf_w1', 9) as any)
      expect(ninth.deny).toContain('allows 8 per run')
      const again: any = await $.agent.spawn(spawnInput('wf_w1', 3) as any)
      expect(again.deny).toBeUndefined()
      const other: any = await $.agent.spawn(spawnInput('wf_w2', 1) as any)
      expect(other.deny).toBeUndefined()
      expect(w.spawns.length).toBe(10)
    })

    test('Max 20x yellow steps down to 8', { options: MAX20 }, async ($, on) => {
      world(on, YELLOW)
      await start($)
      for (let i = 1; i <= 8; i++) await $.agent.spawn(spawnInput('wf_y', i) as any)
      const r: any = await $.agent.spawn(spawnInput('wf_y', 9) as any)
      expect(r.deny).toContain('Max 5x, which applied when the run started, allows 8')
    })

    test('red: the first agent of a new run is denied (width 0)', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_r', 1) as any)
      expect(r.deny).toContain('allows no new workflow runs')
      expect(w.spawns).toEqual([])
    })

    test('a run started before red keeps going up to the width it started with', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      for (let i = 1; i <= 3; i++) await $.agent.spawn(spawnInput('wf_open', i) as any)
      w.rateLimits = RED
      for (let i = 4; i <= 8; i++) {
        const r: any = await $.agent.spawn(spawnInput('wf_open', i) as any)
        expect(r.deny).toBeUndefined()
      }
      const ninth: any = await $.agent.spawn(spawnInput('wf_open', 9) as any)
      expect(ninth.deny).toContain('allows 8 per run')
      const fresh: any = await $.agent.spawn(spawnInput('wf_fresh', 1) as any)
      expect(fresh.deny).toContain('allows no new workflow runs')
      expect(w.spawns.length).toBe(8)
    })

    test('a run past its width logs one transcript line, the repeats go to debug', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      for (let i = 1; i <= 12; i++) await $.agent.spawn(spawnInput('wf_wide', i) as any)
      const transcript = w.logs.filter(l => l.to === 'transcript')
      expect(transcript).toEqual([{ text: 'model-guard: workflow oltre la larghezza 8 (Max 5x), altri agenti bloccati', to: 'transcript' }])
      expect(w.logs.filter(l => l.to === 'debug').length).toBe(3)
      for (let i = 1; i <= 3; i++) await $.agent.spawn(spawnInput('wf_fab', i, { model: 'fable' }) as any)
      expect(w.logs.filter(l => l.to === 'transcript').length).toBe(2)
    })

    test('red with redPolicy warn: allowed and logged', { options: { redPolicy: 'warn' } }, async ($, on) => {
      const w = world(on, RED)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_rw', 1) as any)
      expect(r.deny).toBeUndefined()
      expect(w.logs[0].text).toContain('redPolicy warn')
    })

    test('a run admitted under redPolicy warn keeps the plan width when the budget leaves red', { options: { redPolicy: 'warn' } }, async ($, on) => {
      const w = world(on, RED)
      await start($)
      expect((await $.agent.spawn(spawnInput('wf_warn', 1) as any) as any).deny).toBeUndefined()
      w.rateLimits = GREEN
      for (let i = 2; i <= 8; i++) {
        const r: any = await $.agent.spawn(spawnInput('wf_warn', i) as any)
        expect(r.deny).toBeUndefined()
      }
      const ninth: any = await $.agent.spawn(spawnInput('wf_warn', 9) as any)
      expect(ninth.deny).toContain('Max 5x, which applied when the run started, allows 8')
      expect(w.spawns.length).toBe(8)
    })

    test('Pro yellow is Solo: an Agent with isolation remote (a cloud session) is denied, a local one passes', { options: PRO }, async ($, on) => {
      const w = world(on, YELLOW)
      await start($)
      const remote = await $.tool.call({ ...AGENT, model: 'sonnet', isolation: 'remote' } as any)
      expect(isRefused(remote)).toBe(true)
      expect(denyText(remote)).toContain("isolation 'remote'")
      const local = await $.tool.call({ ...AGENT, model: 'sonnet', isolation: 'worktree' } as any)
      expect(isRefused(local)).toBe(false)
      expect(w.calls).toEqual([expect.objectContaining({ isolation: 'worktree' })])
    })

    test('an Agent with isolation remote passes the cloud column on Max 5x and is denied while red', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      expect(isRefused(await $.tool.call({ ...AGENT, model: 'sonnet', isolation: 'remote' } as any))).toBe(false)
      w.rateLimits = RED
      expect(denyText(await $.tool.call({ ...AGENT, model: 'sonnet', isolation: 'remote' } as any))).toContain('Budget red')
      expect(w.calls.length).toBe(1)
    })

    test('Pro yellow is Solo: the Workflow call itself is denied', { options: PRO }, async ($, on) => {
      const w = world(on, YELLOW)
      await start($)
      const r = await $.tool.call({ tool: 'Workflow', name: 'review' } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('Solo')
      expect(w.calls).toEqual([])
    })

    test('Pro yellow is Solo: no new cloud session either', { options: PRO }, async ($, on) => {
      const w = world(on, YELLOW)
      await start($)
      const r = await $.tool.call({ tool: 'Bash', command: 'claude --model sonnet --cloud "x"' } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('no new cloud sessions')
      expect(w.calls).toEqual([])
      expect(w.logs[0].text).toContain('sessione cloud bloccata')
    })
  })

  describe('rule 7: cloud launches', () => {
    test('claude --cloud without --model gets --model sonnet after the executable', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ tool: 'Bash', command: 'cd repo && claude --cloud "fix the build"' } as any)
      await $.tool.call({ tool: 'PowerShell', command: '& "C:\\Tools\\claude.exe" --effort high --cloud "task"' } as any)
      await $.tool.call({ tool: 'Bash', command: 'claude --model opus --cloud "audit auth"' } as any)
      expect(w.calls.map(c => c.command)).toEqual([
        'cd repo && claude --model sonnet --cloud "fix the build"',
        '& "C:\\Tools\\claude.exe" --model sonnet --effort high --cloud "task"',
        'claude --model opus --cloud "audit auth"',
      ])
      expect(w.logs.length).toBe(2)
      expect(w.logs[0].text).toContain('--model sonnet')
    })

    test('claude --cloud on fable or the haiku alias is denied', async ($, on) => {
      const w = world(on)
      await start($)
      const r1 = await $.tool.call({ tool: 'Bash', command: 'claude --cloud --model fable "x"' } as any)
      const r2 = await $.tool.call({ tool: 'PowerShell', command: 'claude --model=haiku --cloud "x"' } as any)
      expect(isRefused(r1)).toBe(true)
      expect(isRefused(r2)).toBe(true)
      expect(w.calls).toEqual([])
    })

    test('launch.exp with fable or haiku as 4th argument is denied, sonnet passes', async ($, on) => {
      const w = world(on)
      await start($)
      const base = 'expect ~/.claude/skills/coordinator-method/launch.exp task.txt rules.txt worker.log'
      const r1 = await $.tool.call({ tool: 'Bash', command: base + ' fable high' } as any)
      const r2 = await $.tool.call({ tool: 'PowerShell', command: base + ' haiku medium' } as any)
      const r3 = await $.tool.call({ tool: 'Bash', command: base + ' sonnet high' } as any)
      expect(isRefused(r1)).toBe(true)
      expect(denyText(r1)).toContain('4th')
      expect(isRefused(r2)).toBe(true)
      expect(isRefused(r3)).toBe(false)
      expect(w.calls.map(c => c.command)).toEqual([base + ' sonnet high'])
    })

    test('a quoted cmd /c or pwsh -Command script followed by a redirection is still read', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ tool: 'PowerShell', command: 'cmd /c "claude --cloud x" 2>&1' } as any)
      const r = await $.tool.call({ tool: 'PowerShell', command: 'pwsh -Command "claude --cloud --model fable x" > o.txt' } as any)
      expect(isRefused(r)).toBe(true)
      expect(w.calls.map(c => c.command)).toEqual(['cmd /c "claude --model sonnet --cloud x" 2>&1'])
    })
  })

  describe('local headless sessions (claude -p, --bg)', () => {
    test('without --model they get --model sonnet; a named model passes', async ($, on) => {
      const w = world(on)
      await start($)
      await $.tool.call({ tool: 'Bash', command: 'claude -p "refactor the parser" --max-turns 30' } as any)
      await $.tool.call({ tool: 'PowerShell', command: 'claude --bg "run the nightly sweep"' } as any)
      await $.tool.call({ tool: 'Bash', command: 'claude --print --model opus "audit auth"' } as any)
      expect(w.calls.map(c => c.command)).toEqual([
        'claude --model sonnet -p "refactor the parser" --max-turns 30',
        'claude --model sonnet --bg "run the nightly sweep"',
        'claude --print --model opus "audit auth"',
      ])
      expect(w.logs.length).toBe(2)
      expect(w.logs[0].text).toContain('claude -p/--bg')
    })

    test('on fable or the bare haiku alias they are denied; a pinned Haiku id passes', async ($, on) => {
      const w = world(on)
      await start($)
      const r1 = await $.tool.call({ tool: 'Bash', command: 'claude -p "x" --model fable' } as any)
      const r2 = await $.tool.call({ tool: 'Bash', command: 'claude --bg --model haiku "x"' } as any)
      const r3 = await $.tool.call({ tool: 'Bash', command: 'claude -p "x" --model claude-haiku-5-5' } as any)
      expect(denyText(r1)).toContain('Headless and background sessions')
      expect(isRefused(r2)).toBe(true)
      expect(isRefused(r3)).toBe(false)
      expect(w.calls.length).toBe(1)
    })

    test('Solo (Pro yellow) has no cloud slot but still runs a local one', { options: PRO }, async ($, on) => {
      const w = world(on, YELLOW)
      await start($)
      const r = await $.tool.call({ tool: 'Bash', command: 'claude -p "x"' } as any)
      expect(isRefused(r)).toBe(false)
      expect(w.calls[0].command).toBe('claude --model sonnet -p "x"')
    })

    test('a resume gets no --model in green; --fork-session does; Fable on a resume is denied', async ($, on) => {
      const w = world(on, GREEN)
      await start($)
      const commands = ['claude --resume abc -p "x"', 'claude -c -p "x"', 'claude --bg --resume abc']
      for (const command of commands) await $.tool.call({ tool: 'Bash', command } as any)
      await $.tool.call({ tool: 'Bash', command: 'claude --resume abc -p "x" --fork-session' } as any)
      const fable = await $.tool.call({ tool: 'Bash', command: 'claude --resume abc -p x --model fable' } as any)
      expect(denyText(fable)).toContain('never run Fable')
      expect(w.calls.map(c => c.command)).toEqual([...commands, 'claude --model sonnet --resume abc -p "x" --fork-session'])
      expect(w.logs.map(l => l.text)).toEqual([expect.stringContaining('claude -p/--bg'), expect.stringContaining('fable')])
    })
  })

  describe('Start-Process: words inside a quoted prompt are no flags', () => {
    test('a cloud launch whose prompt mentions -p is still a launch: no --model denied, --model fable denied, opus passes', async ($, on) => {
      const w = world(on)
      await start($)
      const none = await $.tool.call({ tool: 'PowerShell', command: "Start-Process claude -ArgumentList '--cloud','\"fix the -p flag parsing\"'" } as any)
      expect(denyText(none)).toContain('nested shell script (or Start-Process)')
      const fable = await $.tool.call({ tool: 'PowerShell', command: "Start-Process claude -ArgumentList '--model','fable','--cloud','\"explain -p\"'" } as any)
      expect(denyText(fable)).toContain('Cloud sessions never run Fable')
      const opus = "Start-Process claude -ArgumentList '--model','opus','--cloud','\"fix the -p flag parsing\"'"
      expect(isRefused(await $.tool.call({ tool: 'PowerShell', command: opus } as any))).toBe(false)
      expect(w.calls.map(c => c.command)).toEqual([opus])
    })
  })

  describe('Monitor runs shell commands too', () => {
    test('a Monitor launch is checked like Bash: launch.exp on fable denied, claude --cloud rewritten', async ($, on) => {
      const w = world(on)
      await start($)
      const bad = await $.tool.call({ tool: 'Monitor', description: 'w', timeout_ms: 1000, command: 'expect launch.exp t r l fable high' } as any)
      expect(isRefused(bad)).toBe(true)
      await $.tool.call({ tool: 'Monitor', description: 'w', timeout_ms: 1000, command: 'claude --cloud "x"' } as any)
      expect(w.calls.map(c => c.command)).toEqual(['claude --model sonnet --cloud "x"'])
    })

    test('a Monitor watch without a command (a WebSocket) passes untouched, even when red', async ($, on) => {
      const w = world(on, RED)
      await start($)
      const input = { tool: 'Monitor', description: 'ws', timeout_ms: 1000, ws: { url: 'wss://example.test/feed' } }
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls).toEqual([expect.objectContaining(input)])
      expect(w.logs).toEqual([])
    })
  })

  describe('rule 8: no reading yet', () => {
    test('interactive: allowed, logged once', async ($, on) => {
      const w = world(on, [])
      await start($, true)
      await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      await $.tool.call({ ...AGENT, model: 'opus' } as any)
      expect(w.calls.length).toBe(2)
      expect(w.logs.length).toBe(1)
      expect(w.logs[0].text).toContain('nessuna lettura')
    })

    test('non-interactive (a Desktop session starts as SDK, an API-key session never has a reading): allowed, logged once', async ($, on) => {
      const w = world(on, [])
      await start($, false)
      await $.tool.call({ tool: 'Workflow', name: 'review' } as any)
      await $.tool.call({ ...AGENT } as any)
      await $.tool.call({ tool: 'Bash', command: 'claude --cloud "x"' } as any)
      expect(w.calls.length).toBe(3)
      expect(w.calls[1].model).toBe('sonnet')
      expect(w.calls[2].command).toBe('claude --model sonnet --cloud "x"')
      expect(w.logs[0].text).toContain('nessuna lettura del budget ancora')
      expect(w.logs.filter(l => l.text.includes('nessuna lettura')).length).toBe(1)
    })

    test('no further line once a reading has come', async ($, on) => {
      const w = world(on, [])
      await start($)
      await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      w.rateLimits = GREEN
      await $.tool.call({ ...AGENT, model: 'sonnet' } as any)
      expect(w.logs.length).toBe(1)
    })
  })

  describe('language', () => {
    test('English lines with language en; the model text stays English', { options: { language: 'en' } }, async ($, on) => {
      const w = world(on, RED)
      await start($)
      const r = await $.tool.call({ ...AGENT } as any)
      expect(w.logs[0].text).toContain('launch blocked, budget red')
      expect(denyText(r)).toContain('Budget red')
    })
  })

  describe('guard failure paths refuse', () => {
    test('Agent guard fails closed', async ($, on) => {
      const w = world(on)
      await start($)
      const r = await $.tool.call({ ...AGENT, model: 42 } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('model-guard could not check this launch')
      expect(w.calls).toEqual([])
      expect(w.logs[0].text).toContain('controllo fallito')
    })

    test('Workflow guard fails closed', async ($, on) => {
      const w = world(on)
      await start($)
      const r = await $.tool.call({ tool: 'Workflow', script: 42 } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('model-guard could not check this launch')
      expect(w.calls).toEqual([])
    })

    test('RemoteTrigger guard fails closed', async ($, on) => {
      const w = world(on)
      await start($)
      const r = await $.tool.call({ tool: 'RemoteTrigger', action: 42 } as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('model-guard could not check this launch')
      expect(w.calls).toEqual([])
    })

    test('Bash and PowerShell guard fails closed', async ($, on) => {
      const w = world(on)
      await start($)
      const r1 = await $.tool.call({ tool: 'Bash', command: 42 } as any)
      const r2 = await $.tool.call({ tool: 'PowerShell', command: { claude: '--cloud' } } as any)
      const r3 = await $.tool.call({ tool: 'Monitor', description: 'w', timeout_ms: 1000, command: 42 } as any)
      expect(isRefused(r1)).toBe(true)
      expect(isRefused(r2)).toBe(true)
      expect(isRefused(r3)).toBe(true)
      expect(denyText(r1)).toContain('model-guard could not check this launch')
      expect(w.calls).toEqual([])
    })

    test('agent.spawn guard fails closed', async ($, on) => {
      const w = world(on)
      await start($)
      const r: any = await $.agent.spawn(spawnInput('wf_bad', 'one' as any) as any)
      expect(r.deny).toContain('model-guard could not check this launch')
      expect(w.spawns).toEqual([])
    })
  })

  describe('re-entry passes on', () => {
    // A plugin beneath model-guard that, inside the guard's own usage reading, raises the same
    // event again: that call rises beneath the guard's own frame, so its .catch answers with
    // kind 're-entry' and must pass it on. (The host refuses a plugin's $.tool.call of Agent or
    // Workflow, so those two guards' re-entry cannot be raised here; they share the same .catch.)
    const NESTER: any = {
      name: 'nester',
      tier: 'append',
      register(on: any) {
        let n = 0
        on('session.usage', async ($: any, e: any, next: any) => {
          n++
          if (n === 1) await $.tool.call({ tool: 'Bash', command: 'claude --cloud "nested"' })
          if (n === 2) {
            await $.agent.spawn({
              tool_use_id: 'toolu_n', prompt: 'p', description: 'd', subagentType: 'general-purpose',
              model: 'fable', background: true, workflow: { runId: 'wf_nested', agentIndex: 1 },
            })
          }
          if (n === 3) await $.tool.call({ tool: 'RemoteTrigger', action: 'run', trigger_id: 'trig_n' })
          return next(e)
        })
      },
    }

    test('each guard passes on a launch raised beneath its own frame, even when red', { plugins: [NESTER] }, async ($, on) => {
      const w = world(on, RED)
      await start($)
      const outer = [
        await $.tool.call({ tool: 'Bash', command: 'claude --model opus --cloud "outer"' } as any),
        await $.agent.spawn(spawnInput('wf_outer', 1) as any),
        await $.tool.call({ tool: 'RemoteTrigger', action: 'run', trigger_id: 'trig_o' } as any),
      ]
      for (const r of outer) expect(isRefused(r)).toBe(true)
      expect(w.calls).toEqual([
        expect.objectContaining({ tool: 'Bash', command: 'claude --cloud "nested"' }),
        expect.objectContaining({ tool: 'RemoteTrigger', action: 'run', trigger_id: 'trig_n' }),
      ])
      // A plugin's own spawn carries no workflow field, so this one only shows the spawn guard passes it on.
      expect(w.spawns).toEqual([expect.objectContaining({ model: 'fable' })])
      expect(w.logs.length).toBe(3)
    })
  })

  describe('observers pass on unchanged', () => {
    test('session.start, prompt.context and session.measure return what lies beneath', async ($, on) => {
      world(on)
      const s = await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true } as any)
      expect(s).toEqual({ cwd: 'C:/repo' })
      const blocks = [{ name: 'currentDate', text: '2026-10-07' }]
      const c = await $.prompt.context({ blocks, instructionFiles: [{ path: 'C:/u/.claude/CLAUDE.md', kind: 'user', content: 'Claude plan: Max 20x' }] } as any)
      expect(c).toMatchObject({ blocks })
      const m = await $.session.measure({ context: { window: 200000 }, rateLimits: GREEN, changed: ['rateLimits'] } as any)
      expect(m).toEqual({ changed: ['rateLimits'] })
    })
  })
})
