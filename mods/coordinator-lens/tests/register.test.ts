// The wiring of coordinator-lens, through the engine: the plugin is loaded from its folder and every
// hook runs for real. The hooks a test adds with `on` sit beneath the plugin as the world: they answer
// the tools, the usage reading, the clock, the store and the ui calls, and they record what reaches them.
// The kit wants every `on` registered before the first `$` call, so the world registers them all and a
// test steers it through the fields of `w` (answers, deny, placed, gh).
// @ts-nocheck
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0)
const MIN = 60000
const HOUR = 3600000
const PLAN = 'Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22'
const TOOL = 'mcp__coordinator-lens__budget_estimate'

const weekly = (used, hours = 144) => ({ kind: 'seven_day', percentUsed: used, resetsAt: new Date(NOW + hours * HOUR).toISOString() })
const five = used => ({ kind: 'five_hour', percentUsed: used, resetsAt: new Date(NOW + 4 * HOUR).toISOString() })
const GREEN = [weekly(17), five(0)]
const RED = [weekly(80), five(0)]

const EN = { language: 'en' }
const EN_NO_PR = { language: 'en', prPolling: 'off' }

// The world beneath the plugin.
function world(on, o = {}) {
  const w = {
    rateLimits: o.rateLimits || GREEN,
    store: new Map(Object.entries(o.store || {})),
    storeSets: [], storeDeletes: [],
    toasts: [], logs: [], commands: [], tools: [], opens: [], closes: [], renders: [],
    runs: [], calls: [], spawns: [], submits: [], usageCalls: 0, answers: {},
    placed: true, deny: {}, rewriteAgentModel: false, dropSubmit: false,
    // what $.session.surfaces() answers: a plain -p run draws nowhere ([])
    surfaces: o.surfaces || ['terminal'],
    gh: { exitCode: 0, stdout: '[]', stderr: '' },
  }
  const gate = name => (w.deny[name] ? { deny: name + ' is down' } : null)
  w.clock = mock.clock(on, { now: NOW })
  on('store.get', async ($, e) => gate('store.get') || { value: w.store.has(e.key) ? w.store.get(e.key) : undefined })
  on('store.set', async ($, e) => {
    const d = gate('store.set')
    if (d) return d
    w.store.set(e.key, e.value)
    w.storeSets.push(e.key)
    return { value: undefined }
  })
  on('store.delete', async ($, e) => {
    const d = gate('store.delete')
    if (d) return d
    w.store.delete(e.key)
    w.storeDeletes.push(e.key)
    return { value: undefined }
  })
  on('session.usage', async () => {
    w.usageCalls += 1
    return gate('session.usage') || { value: { startedAt: NOW, context: { window: 200000 }, rateLimits: w.rateLimits } }
  })
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('session.surfaces', async () => ({ value: w.surfaces }))
  on('ui.toast', async ($, e) => gate('ui.toast') || (w.toasts.push(e.text), { value: undefined }))
  on('ui.log', async ($, e) => gate('ui.log') || (w.logs.push({ text: e.text, to: e.to }), { value: undefined }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async ($, e) => {
    w.opens.push(e)
    return { value: w.placed ? { isPlaced: true } : { isPlaced: false, reason: 'too narrow' } }
  })
  on('ui.close', async ($, e) => (w.closes.push(e), { value: undefined }))
  on('command.register', async ($, e) => ((w.registerTries = (w.registerTries || 0) + 1), gate('command.register') || (w.commands.push(e), { value: { command: e.name } })))
  on('tool.register', async ($, e) => gate('tool.register') || (w.tools.push(e), { value: { tool: 'mcp__coordinator-lens__' + e.name } }))
  on('process.run', async ($, e) => {
    w.runs.push(e.argv)
    return gate('process.run') || { value: { exitCode: w.gh.exitCode, stdout: w.gh.stdout, stderr: w.gh.stderr, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => (w.rewriteAgentModel ? next({ ...e, model: 'sonnet' }) : next(e)))
  on('tool.call', async ($, e) => {
    w.calls.push(e)
    if (w.answers[e.tool]) return w.answers[e.tool](e)
    return { result: 'ran' }
  })
  on('agent.spawn', async ($, e) => (w.spawns.push(e), { model: 'claude-sonnet-5-5', agentId: 'agent-' + w.spawns.length }))
  on('prompt.submit', async ($, e) => {
    w.submits.push(e)
    return w.dropSubmit ? { drop: 'not now' } : { text: e.text, context: e.context }
  })
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('session.end', async ($, e) => ({ sessionId: e.sessionId }))
  on('session.attach', async ($, e) => ({ clientId: e.clientId }))
  on('classic.SessionStart', async () => ({}))
  on('prompt.context', async ($, e) => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  on('session.measure', async ($, e) => ({ changed: e.changed }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('skill.prompt', async ($, e) => ({ text: e.text }))
  on('classic.UserPromptExpansion', async () => ({}))
  on('command.run', async ($, e) => ({ text: 'unhandled ' + e.command }))
  on('ui.render', async ($, e) => {
    w.renders.push(e)
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'engine ' + e.component + ' ' + (e.props && typeof e.props.suffix === 'string' ? e.props.suffix : '') })
  })
  return w
}

const start = ($, o = {}) => $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true, ...o })
const PRESENTATION = { isFullscreen: false, columns: 100 }
const coord = ($, args = '') => $.command.run({ command: 'coord', args, origin: { kind: 'composer' }, presentation: PRESENTATION })
const measure = ($, rateLimits) => $.session.measure({ context: { window: 200000 }, rateLimits, changed: ['rateLimits'] })
const submit = ($, text = 'go on', origin = { kind: 'composer' }) => $.prompt.submit({ text, wait: false, origin })
const lines = text => String(text).split('\n')
// The band as the person reads it: its Texts side by side, drawn through the engine on a surface.
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 11 }, view: {} }
const bandLine = async ($, surface = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND_PROPS })
  const line = (await ui.findAll({ type: 'Text' })).map(x => x.text).join('')
  await ui.unmount()
  return line
}
// A session.start poll carries no timestamp, so the reading counts only after a response reported it.
const warm = async ($, w) => measure($, w.rateLimits)

const spawnInput = (o = {}) => ({
  tool_use_id: 'toolu_1', prompt: 'Read the files', description: 'reader', subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' }, model: 'sonnet', parentModel: 'claude-opus-5-5', background: true, fork: false, ...o,
})

const NOTICE = (id, count = 3) =>
  '<task-notification>\n<task-id>' + id + '</task-id>\n<status>completed</status>\n<summary>done</summary>\n<agent_count>' + count + '</agent_count>\n</task-notification>'

const WF = { status: 'async_launched', taskId: 'task1', runId: 'wf_1', workflowName: 'deep-review' }

describe('session start', () => {
  test('registers /coord and budget_estimate, reads usage, restores the store', async ($, on) => {
    const w = world(on, {
      store: {
        runCost: { samples: [{ label: 'deep-review', points: 4, weight: 9, agents: 7, at: NOW }], last: { label: 'deep-review', points: 4, agents: 7 } },
        night: { on: true, since: NOW - HOUR, nextWakeAt: null, pointsBase: 10, baseResetsAt: null, carry: 0, pointsSince: 1 },
      },
    })
    await start($)
    await warm($, w)
    expect(w.commands).toHaveLength(1)
    expect(w.commands[0]).toMatchObject({ name: 'coord', argumentHint: '[pane|night on|night off]' })
    expect(w.commands[0].description).toBe('Vista coordinatore: budget, worker, merge')
    expect(w.tools).toHaveLength(1)
    expect(w.tools[0]).toMatchObject({ name: 'budget_estimate', description: expect.stringContaining('Weekly points') })
    expect(w.tools[0].inputSchema.properties).toEqual({ haiku: { type: 'number' }, sonnet: { type: 'number' }, opus: { type: 'number' }, fable: { type: 'number' } })
    expect(w.usageCalls).toBeGreaterThan(0)
    const r = await coord($)
    expect(r.text).toContain('budget: green')
    expect(r.text).toContain('night: on')
    expect(r.text).toContain('run cost: 0.44 weekly points per Sonnet-sized agent (1 samples)')
  })

  test('the reading a poll brings at start has no known age: the budget stays unknown until a response', async ($, on) => {
    const w = world(on)
    await start($)
    const before = await coord($)
    expect(before.text).toContain('budget: unknown')
    expect(before.text).toContain('weekly 17%')
    await submit($, 'one')
    expect(w.submits[0].context).toBeUndefined()
    await warm($, w)
    expect((await coord($)).text).toContain('budget: green')
    await submit($, 'two')
    expect(w.submits[1].context).toHaveLength(1)
  })

  test('the plan read from CLAUDE.md is kept in the store and comes back after a reload', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const files = [{ path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: '# Me\n' + PLAN + '\n' }]
    await $.prompt.context({ blocks: [], instructionFiles: files })
    expect(w.store.get('planLine')).toBe('Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22')
    expect((await coord($)).text).toContain('profile Max 20x')
  })

  test('a reload restores the stored plan line; prompt.context does not fire again', async ($, on) => {
    const w = world(on, { store: { planLine: 'Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22' } })
    await start($)
    await warm($, w)
    const text = (await coord($)).text
    expect(text).toContain('profile Max 20x')
    await submit($)
    expect(w.submits[0].context[0]).toContain('weekly reset banked until 2026-10-22')
  })

  test('a stored plan line that is junk is ignored', async ($, on) => {
    const w = world(on, { store: { planLine: 42 } })
    await start($)
    await warm($, w)
    expect((await coord($)).text).toContain('profile Max 5x')
  })

  test('a plan line left out of CLAUDE.md clears the stored one', async ($, on) => {
    const w = world(on, { store: { planLine: 'Max 20x' } })
    await start($)
    await $.prompt.context({ blocks: [], instructionFiles: [{ path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: 'nothing' }] })
    expect(w.store.has('planLine')).toBe(false)
    expect(w.storeDeletes).toEqual(['planLine'])
  })

  // Pinned before as 'the planLine option wins over the store': the option is the fallback, so after a
  // reload the line read from the user CLAUDE.md (kept in the store) wins over it.
  test('after a reload the stored user line wins over the planLine option; the option is never stored', { options: { ...EN, planLine: 'Pro · reserve 25%' } }, async ($, on) => {
    const w = world(on, { store: { planLine: 'Max 20x' } })
    await start($)
    await warm($, w)
    expect((await coord($)).text).toContain('profile Max 20x')
    // no user file read: the stored line stays
    await $.prompt.context({ blocks: [], instructionFiles: [] })
    expect(w.store.get('planLine')).toBe('Max 20x')
    // the user file has no line: the stored one goes, and the option is the fallback
    await $.prompt.context({ blocks: [], instructionFiles: [{ path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: 'nothing' }] })
    expect(w.store.has('planLine')).toBe(false)
    expect((await coord($)).text).toContain('profile Pro')
  })

  test('the planLine option holds when nothing is stored, and is not stored', { options: { ...EN, planLine: 'Pro · reserve 25%' } }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    expect((await coord($)).text).toContain('profile Pro')
    await $.prompt.context({ blocks: [], instructionFiles: [] })
    expect(w.store.has('planLine')).toBe(false)
  })

  test('a project, local or memory file never sets the plan and is never stored', { options: { ...EN, planLine: 'Pro · reserve 25%' } }, async ($, on) => {
    // 88% with 10 hours left: green on the project file's reserve 0, red over the option's reserve 25
    const w = world(on, { rateLimits: [weekly(88, 10), five(10)] })
    await start($)
    await warm($, w)
    const line = 'Claude plan: Max 20x · reserve 0% · banked: weekly reset, expires 2026-10-14; weekly reset, expires 2026-10-14'
    for (const kind of ['project', 'local', 'memory']) {
      await $.prompt.context({ blocks: [], instructionFiles: [{ path: 'C:/repo/CLAUDE.md', kind, content: line }] })
    }
    expect(w.storeSets).not.toContain('planLine')
    expect(w.store.has('planLine')).toBe(false)
    const text = (await coord($)).text
    expect(text).toContain('budget: red')
    expect(text).not.toContain('profile Max 20x')
  })

  test('a stored user line is kept when no user file was read (a hook rewrote the instructions)', async ($, on) => {
    const w = world(on, { store: { planLine: 'Max 20x' } })
    await start($)
    await $.prompt.context({ blocks: [] })
    await $.prompt.context({ blocks: [], instructionFiles: [{ path: 'C:/repo/CLAUDE.md', kind: 'project', content: 'nothing' }] })
    expect(w.storeDeletes).toEqual([])
    expect(w.store.get('planLine')).toBe('Max 20x')
  })

  test('the command description follows the language option', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.commands[0].description).toBe('Coordinator view: budget, workers, merges')
  })

  test('a failing store, usage or registration never breaks the start', async ($, on) => {
    const w = world(on)
    w.deny = { 'store.get': 1, 'session.usage': 1, 'command.register': 1, 'tool.register': 1 }
    const r = await start($)
    expect(r).toEqual({ cwd: 'C:/repo' })
    expect((await coord($)).text).toContain('budget: unknown')
    expect(w.toasts).toEqual([])
  })

  test('the registration is retried on the next prompt when the first try failed', async ($, on) => {
    const w = world(on)
    w.deny = { 'command.register': 1 }
    await start($)
    expect(w.commands).toHaveLength(0)
    w.deny = {}
    await submit($)
    expect(w.commands).toHaveLength(1)
  })

  test('a host that keeps refusing the registration is asked three times in all, not on every prompt', async ($, on) => {
    const w = world(on)
    w.deny = { 'command.register': 1 }
    await start($)
    for (let i = 0; i < 5; i++) await submit($, 'p' + i)
    expect(w.registerTries).toBe(3)
    expect(w.commands).toHaveLength(0)
  })

  test('a session with nobody at the prompt starts no timers', async ($, on) => {
    // a plain -p run: nobody at the prompt and no surface
    const w = world(on, { surfaces: [] })
    await start($, { surface: null, isInteractive: false })
    const before = w.usageCalls
    await w.clock.advance(10 * MIN)
    expect(w.usageCalls).toBe(before)
  })

  test('an SDK host that attaches a surface (the Desktop app) starts the timers then', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await start($, { surface: null, isInteractive: false })
    let before = w.usageCalls
    await w.clock.advance(10 * MIN)
    expect(w.usageCalls).toBe(before)
    w.surfaces = ['desktop']
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    before = w.usageCalls
    await w.clock.advance(10 * MIN)
    expect(w.usageCalls).toBeGreaterThan(before)
  })

  test('an SDK session that already has a surface at start runs the timers', async ($, on) => {
    const w = world(on, { surfaces: ['desktop'] })
    await start($, { surface: null, isInteractive: false })
    const before = w.usageCalls
    await w.clock.advance(10 * MIN)
    expect(w.usageCalls).toBeGreaterThan(before)
  })
})

describe('/coord', () => {
  test('without an argument it answers the summary: at most 10 lines, English', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const r = await coord($)
    expect(lines(r.text).length).toBeLessThanOrEqual(10)
    expect(r.text).toContain('budget: green')
    expect(r.text).toContain('weekly 17%')
    expect(r.text).toContain('decisions: none waiting')
  })

  test('pane opens the pane and prints nothing; a pane that is not placed falls back to the text', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const opened = await coord($, 'pane')
    expect(opened.text).toBeUndefined()
    expect(w.opens).toEqual([{ id: 'coord', title: 'Coordinatore', focus: true, closeOnEscape: true }])
    w.placed = false
    const fallback = await coord($, ' PANE ')
    expect(fallback.text).toContain('budget: green')
  })

  test('every open of the pane asks for Esc to close it, and the lens never closes it unasked', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await coord($, 'pane')
    await coord($, 'pane')
    // each open sets closeOnEscape anew, so Esc (and the pane's own close mark) stay the way out
    expect(w.opens).toHaveLength(2)
    for (const o of w.opens) expect(o).toMatchObject({ id: 'coord', focus: true, closeOnEscape: true })
    expect(w.closes).toEqual([])
  })

  test('night on and off change the night line and are kept in the store', async ($, on) => {
    const w = world(on)
    await start($)
    const on1 = await coord($, 'night on')
    expect(on1.text).toContain('night: on')
    expect(w.store.get('night')).toMatchObject({ on: true })
    const off = await coord($, 'night   off')
    expect(off.text).toContain('night: off')
    expect(w.store.get('night')).toMatchObject({ on: false })
  })

  test('an unknown argument says what is accepted and still shows the summary', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const r = await coord($, 'dance now')
    expect(r.text.startsWith('/coord: unknown argument "dance now" (use pane, night on, night off)\n')).toBe(true)
    expect(r.text).toContain('budget: green')
  })

  test('other commands are not touched', async ($, on) => {
    world(on)
    await start($)
    const r = await $.command.run({ command: 'other', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })
    expect(r.text).toBe('unhandled other')
  })
})

describe('the context line', () => {
  test('goes onto the first prompt with a reading, then only when something changed', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await submit($, 'one')
    expect(w.submits[0].text).toBe('one')
    expect(w.submits[0].context).toHaveLength(1)
    expect(w.submits[0].context[0]).toMatch(/^coordinator-lens budget: green \(margin [+-]?\d+\) · profile Max 5x: 8 agents\/run, 1 cloud session · plan assumed \(no Claude plan line; Pro accounts use Pro\) · weekly 17% \(pace \d+\) · 5h 0% · Fable window not readable$/)
    await submit($, 'two')
    expect(w.submits[1].context).toBeUndefined()
    await measure($, [weekly(19), five(0)])
    await submit($, 'three')
    expect(w.submits[2].context).toBeUndefined()
    await measure($, [weekly(23), five(0)])
    await submit($, 'four')
    expect(w.submits[3].context).toHaveLength(1)
    expect(w.submits[3].context[0]).toContain('weekly 23%')
    await measure($, RED)
    await submit($, 'five')
    expect(w.submits[4].context[0]).toContain('budget: red')
    expect(w.submits.map(s => s.text)).toEqual(['one', 'two', 'three', 'four', 'five'])
  })

  test('the 5-hour pause counts; context already on the prompt is kept', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await submit($)
    await measure($, [weekly(17), five(95)])
    await $.prompt.submit({ text: 'with context', wait: false, origin: { kind: 'composer' }, context: ['mine'] })
    expect(w.submits[1].context).toHaveLength(2)
    expect(w.submits[1].context[0]).toBe('mine')
    expect(w.submits[1].context[1]).toContain('5h 95% (paused, resets 16:00 UTC)')
  })

  test('no line without a reading', async ($, on) => {
    const quiet = world(on, { rateLimits: [] })
    await start($)
    await submit($)
    expect(quiet.submits[0].context).toBeUndefined()
  })

  test('contextLine off', { options: { ...EN, contextLine: 'off' } }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await submit($)
    await measure($, RED)
    await submit($)
    expect(w.submits.every(s => s.context === undefined)).toBe(true)
  })

  test('a reading that went stale is told to the model', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await submit($)
    await w.clock.advance(11 * MIN)
    await submit($)
    expect(w.submits[1].context[0]).toContain('budget: unknown (old reading, read 11m ago)')
  })

  test('a prompt that was dropped below does not count as sent', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    w.dropSubmit = true
    const first = await submit($, 'x')
    expect(first.drop).toBe('not now')
    w.dropSubmit = false
    await submit($, 'y')
    expect(w.submits[1].context).toHaveLength(1)
  })

  test('the plan line of the user CLAUDE.md sets the profile; the context blocks pass untouched', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const blocks = [{ name: 'claudeMd', text: 'x' }]
    const files = [{ path: 'C:/Users/me/.claude/CLAUDE.md', kind: 'user', content: '# Me\n' + PLAN + '\n' }]
    const out = await $.prompt.context({ blocks, instructionFiles: files })
    expect(out.blocks).toEqual(blocks)
    await submit($)
    expect(w.submits[0].context[0]).toContain('profile Max 20x: 16 agents/run, 3 cloud sessions')
  })

  test('the planLine option stands in when CLAUDE.md has none', { options: { ...EN, planLine: 'Pro · reserve 25%' } }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await $.prompt.context({ blocks: [], instructionFiles: [{ path: '/x/CLAUDE.md', kind: 'user', content: 'nothing here' }] })
    await submit($)
    expect(w.submits[0].context[0]).toContain('profile Pro: 4 agents/run, 1 cloud session')
  })
})

describe('budget_estimate', () => {
  test('answers without points until a run was measured, then with them', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    const first = await $.tool.call({ tool: TOOL, sonnet: 8, opus: 2 })
    expect(first.result).toMatchObject({ points: null, fits: null, color: 'green', samples: 0, unitPoints: null })
    expect(first.result.note).toMatch(/no run-cost sample/)
    expect(w.calls.filter(c => c.tool === TOOL)).toEqual([])

    w.answers.Workflow = () => ({ result: WF })
    await measure($, [weekly(20), five(0)])
    await $.tool.call({ tool: 'Workflow', name: 'deep-review' })
    for (let i = 0; i < 6; i++) await $.agent.spawn(spawnInput({ tool_use_id: 'w' + i, workflow: { runId: 'wf_1', agentIndex: i } }))
    await submit($, NOTICE('task1', 6), { kind: 'task-notification' })
    await measure($, [weekly(23), five(0)])
    const second = await $.tool.call({ tool: TOOL, sonnet: 6 })
    expect(second.result.samples).toBe(1)
    expect(second.result.unitPoints).toBe(0.5)
    expect(second.result.points).toBe(3)
    expect(second.result.fits).toBe(true)
    expect(second.result.paused).toBe(false)
    const big = await $.tool.call({ tool: TOOL, sonnet: 600 })
    expect(big.result.fits).toBe(false)
    expect((await coord($)).text).toContain('run cost: 0.5 weekly points per Sonnet-sized agent (1 samples), last deep-review 3 points')
    expect(w.store.get('runCost')).toMatchObject({ samples: [{ label: 'deep-review', points: 3, weight: 6, plan: null }] })
  })

  test('budget_estimate prices Haiku agents at 0.05 of a Sonnet one', async ($, on) => {
    const w = world(on, { store: { runCost: { samples: [{ label: 'x', points: 2, weight: 2, agents: 2, at: NOW, plan: null }], last: null } } })
    await start($)
    await warm($, w)
    expect((await $.tool.call({ tool: TOOL, haiku: 20 })).result).toMatchObject({ points: 1, unitPoints: 1 })
    expect((await $.tool.call({ tool: TOOL, haiku: 20, sonnet: 1 })).result.points).toBe(2)
  })

  test('no launch fits while the 5-hour window is paused or the reading is stale', async ($, on) => {
    const w = world(on, {
      store: { runCost: { samples: [{ label: 'x', points: 4, weight: 8, agents: 8, at: NOW, plan: null }], last: null } },
    })
    await start($)
    await warm($, w)
    expect((await $.tool.call({ tool: TOOL, sonnet: 2 })).result).toMatchObject({ points: 1, fits: true, color: 'green' })
    w.rateLimits = [weekly(17), five(95)]
    await measure($, w.rateLimits)
    const paused = (await $.tool.call({ tool: TOOL, sonnet: 2 })).result
    expect(paused).toMatchObject({ fits: false, paused: true })
    expect(paused.note).toContain('paused until 16:00 UTC')
    w.rateLimits = GREEN
    await measure($, GREEN)
    await w.clock.advance(11 * MIN)
    expect((await $.tool.call({ tool: TOOL, sonnet: 2 })).result).toMatchObject({ fits: null, color: 'unknown' })
  })

  test('fresh usage is read when it is asked', async ($, on) => {
    const w = world(on)
    await start($)
    const before = w.usageCalls
    await $.tool.call({ tool: TOOL })
    expect(w.usageCalls).toBe(before + 1)
  })

  test('junk arguments count as zero', async ($, on) => {
    world(on)
    await start($)
    const r = await $.tool.call({ tool: TOOL, sonnet: 'many' })
    expect(r.result.points).toBe(null)
    expect(r.deny).toBeUndefined()
  })
})

describe('observers never rewrite or block', () => {
  const TOOLS = [
    { tool: 'Agent', description: 'Fix the ticket', prompt: 'Fix it', model: 'opus', effort: 'high', run_in_background: true },
    { tool: 'Workflow', name: 'deep-review', args: { a: 1 } },
    { tool: 'Bash', command: 'gh pr merge 42 --merge --match-head-commit abc' },
    { tool: 'PowerShell', command: 'claude --cloud --model sonnet "task"' },
    { tool: 'Skill', skill: 'grill-me', args: 'x' },
    { tool: 'AskUserQuestion', questions: [{ question: 'Merge?', header: 'Merge', options: [{ label: 'Yes', description: 'y' }, { label: 'No', description: 'n' }], multiSelect: false }] },
    { tool: 'Write', file_path: 'CONTEXT.md', content: 'x' },
    { tool: 'Edit', file_path: 'docs/ROADMAP.md', old_string: 'a', new_string: 'b' },
    { tool: 'ScheduleWakeup', delaySeconds: 600, reason: 'night' },
    { tool: 'Read', file_path: 'C:/repo/a.txt' },
  ]

  test('every tool call reaches the bottom as sent and comes back as the bottom answered', async ($, on) => {
    const w = world(on)
    await start($)
    for (const input of TOOLS) {
      w.answers[input.tool] = () => ({ result: { marker: input.tool } })
      const r = await $.tool.call(input)
      expect(r.result).toEqual({ marker: input.tool })
    }
    expect(w.calls.length).toBe(TOOLS.length)
    for (let i = 0; i < TOOLS.length; i++) expect(w.calls[i]).toMatchObject(TOOLS[i])
  })

  test('a deny from below reaches the model unchanged and shows as denied', async ($, on) => {
    const w = world(on)
    await start($)
    w.answers.Agent = () => ({ deny: 'budget is red' })
    w.answers.Workflow = () => ({ deny: 'budget is red' })
    w.answers.Bash = () => ({ deny: 'budget is red' })
    for (const input of [TOOLS[0], TOOLS[1], TOOLS[2]]) {
      const r = await $.tool.call(input)
      expect(r.deny).toBe('budget is red')
    }
    const text = (await coord($)).text
    expect(text).toContain('workers: 2 denied')
    // the refused merge is no merge: no step, no toast
    expect(text).toContain('merge: none in progress')
    expect(w.toasts).toEqual([])
  })

  test('agent.spawn, turn.complete, skill.prompt and the expansion pass on as sent', async ($, on) => {
    const w = world(on)
    await start($)
    const spawn = spawnInput({ description: 'reader one' })
    const r = await $.agent.spawn(spawn)
    expect(r).toEqual({ model: 'claude-sonnet-5-5', agentId: 'agent-1' })
    expect(w.spawns[0]).toMatchObject(spawn)
    const done = await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'agent-1' })
    expect(done.text).toBe('ok')
    const main = await $.turn.complete({ answer: 'main', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
    expect(main.text).toBe('main')
    const prompt = await $.skill.prompt({ skill: 'grill-me', text: 'Interview me.' })
    expect(prompt.text).toBe('Interview me.')
    await $.classic.UserPromptExpansion({ expansion_type: 'slash_command', command_name: 'to-prd', command_args: '', prompt: 'x' })
    const text = (await coord($)).text
    expect(text).toContain('workers: 1 done')
    expect(text).toContain('flow: done grill; now spec')
  })

  test('a prompt keeps its text and origin, whatever the notification said', async ($, on) => {
    const w = world(on)
    await start($)
    await submit($, NOTICE('nothing'), { kind: 'task-notification' })
    expect(w.submits[0].text).toBe(NOTICE('nothing'))
    expect(w.submits[0].origin).toEqual({ kind: 'task-notification' })
  })

  test('a broken world (no usage, no toasts, no log, no store, no registration) never changes an answer', async ($, on) => {
    const w = world(on)
    await start($)
    w.deny = { 'session.usage': 1, 'ui.toast': 1, 'ui.log': 1, 'store.get': 1, 'store.set': 1, 'process.run': 1, 'command.register': 1, 'tool.register': 1 }
    w.answers.Workflow = () => ({ result: { status: 'async_launched', taskId: 't', runId: 'wf_x', workflowName: 'x' } })
    w.answers.AskUserQuestion = () => ({ result: { answers: {} } })
    for (const input of TOOLS) {
      const r = await $.tool.call(input)
      expect(r.deny).toBeUndefined()
      expect(r.result).toBeDefined()
    }
    await $.agent.spawn(spawnInput())
    await measure($, RED)
    const out = await submit($, 'still goes', { kind: 'task-notification' })
    expect(out.text).toBe('still goes')
    await w.clock.advance(20 * MIN)
    expect((await coord($)).text).toContain('budget:')
    expect((await coord($, 'night on')).text).toContain('night: on')
    expect(w.toasts).toEqual([])
  })

  test('a model rewrite of the Agent call below leaves the lens reading the call as sent', async ($, on) => {
    const w = world(on)
    await start($)
    w.rewriteAgentModel = true
    await $.tool.call({ tool: 'Agent', description: 'writer', prompt: 'x' })
    expect(w.calls[0].model).toBe('sonnet')
    expect((await coord($)).text).toContain('workers: 1 running (writer agent)')
  })
})

describe('workers from the engine', () => {
  test('a workflow: launch, agents counted once each, end by notification', async ($, on) => {
    const w = world(on)
    w.answers.Workflow = () => ({ result: WF })
    await start($)
    await $.tool.call({ tool: 'Workflow', script: 'x' })
    for (let i = 0; i < 4; i++) await $.agent.spawn(spawnInput({ tool_use_id: 'w' + i, model: i < 3 ? 'sonnet' : 'opus', workflow: { runId: 'wf_1', agentIndex: i } }))
    await $.agent.spawn(spawnInput({ tool_use_id: 'w0', workflow: { runId: 'wf_1', agentIndex: 0 } }))
    expect((await coord($)).text).toContain('workers: 1 running (deep-review wf 4/8)')
    await submit($, NOTICE('task1', 4), { kind: 'task-notification' })
    expect((await coord($)).text).toContain('workers: 1 done')
  })

  test('a cloud launch from a shell command, in Bash and in PowerShell', async ($, on) => {
    const w = world(on)
    w.answers.Bash = () => ({ result: { stdout: 'Started https://claude.ai/code/session_01ABC\n', stderr: '', interrupted: false } })
    w.answers.PowerShell = () => ({ result: { stdout: 'Started https://claude.ai/code/session_02DEF\n', stderr: '', interrupted: false } })
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'claude --cloud --model sonnet "fix ci"' })
    await $.tool.call({ tool: 'PowerShell', command: 'claude --cloud --model sonnet "docs"' })
    expect((await coord($)).text).toContain('workers: 2 running (fix ci cloud, docs cloud)')
  })

  // Pinned before as "three failures switch it off": the poll now backs off (15, 30, then 60 minutes)
  // after three failures in a row and keeps trying, and an old list says how old it is.
  test('the pull request poll feeds the prs line; after three failures it backs off and keeps trying', async ($, on) => {
    const w = world(on)
    const OK = { exitCode: 0, stdout: JSON.stringify([{ number: 42, title: 'feat', state: 'OPEN', url: 'https://github.com/a/b/pull/42', isDraft: false, mergeable: 'MERGEABLE', statusCheckRollup: [{ conclusion: 'SUCCESS', status: 'COMPLETED' }] }]), stderr: '' }
    w.gh = OK
    await start($)
    expect(w.runs[0]).toEqual(['gh', 'pr', 'list', '--json', 'number,title,state,url,isDraft,mergeable,statusCheckRollup', '--limit', '20'])
    expect((await coord($)).text).toContain('prs: #42 open green')
    w.gh = { exitCode: 1, stdout: '', stderr: 'not logged in' }
    const before = w.runs.length
    // fails at 5, 10 and 15 minutes, then waits 15 minutes: the next try is at 30, then 30 more
    await w.clock.advance(40 * MIN)
    expect(w.runs.length).toBe(before + 4)
    // the list from the start is old now: the model is told when it was read
    expect((await coord($)).text).toContain('prs (list read 40m ago): #42 open green')
    w.gh = OK
    await w.clock.advance(20 * MIN)
    expect(w.runs.length).toBe(before + 5)
    expect((await coord($)).text).toContain('prs: #42 open green')
    await w.clock.advance(5 * MIN)
    expect(w.runs.length).toBe(before + 6)
  })

  test('a poll that succeeds starts the failure count over', async ($, on) => {
    const w = world(on)
    const FAIL = { exitCode: 1, stdout: '', stderr: 'offline' }
    await start($)
    expect(w.runs).toHaveLength(1)
    w.gh = FAIL
    await w.clock.advance(10 * MIN)
    w.gh = { exitCode: 0, stdout: '[]', stderr: '' }
    await w.clock.advance(5 * MIN)
    w.gh = FAIL
    await w.clock.advance(10 * MIN)
    expect(w.runs).toHaveLength(6)
    // two failures since the last success: no back-off yet, the next poll runs
    await w.clock.advance(5 * MIN)
    expect(w.runs).toHaveLength(7)
  })

  test('prPolling off never runs gh', { options: EN_NO_PR }, async ($, on) => {
    const w = world(on)
    await start($)
    await w.clock.advance(20 * MIN)
    expect(w.runs).toEqual([])
  })

  test('a gh that cannot start backs off quietly', async ($, on) => {
    const w = world(on)
    w.deny = { 'process.run': 1 }
    await start($)
    await w.clock.advance(30 * MIN)
    // at 0, 5 and 10 minutes, then 15 minutes later
    expect(w.runs.length).toBe(4)
    expect((await coord($)).text).toContain('budget:')
    expect(w.toasts).toEqual([])
  })
})

describe('toasts', () => {
  const ASK = { tool: 'AskUserQuestion', questions: [{ question: 'Merge #42 now?', header: 'Merge', options: [], multiSelect: false }] }

  test('a question waiting toasts once per question', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await $.tool.call(ASK)
    expect(w.toasts).toEqual(['Waiting for you: Merge #42 now?'])
    // the call came back: the question no longer waits
    expect((await coord($)).text).toContain('decisions: none waiting')
    await $.tool.call({ ...ASK, tool_use_id: 'ask2' })
    expect(w.toasts).toHaveLength(2)
  })

  test('the default language is Italian', async ($, on) => {
    const w = world(on)
    await start($)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Unire?', header: 'x', options: [], multiSelect: false }] })
    expect(w.toasts).toEqual(['Ti aspetta: Unire?'])
  })

  test('a merge toasts once', { options: EN }, async ($, on) => {
    const w = world(on)
    w.answers.Bash = () => ({ result: { stdout: '✓ Merged pull request #42', stderr: '', interrupted: false } })
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 42 --merge --match-head-commit abc --subject "feat (#42)"' })
    expect(w.toasts).toEqual(['Merged #42'])
    await $.tool.call({ tool: 'Bash', command: 'gh issue close 7' })
    expect(w.toasts).toEqual(['Merged #42'])
    expect((await coord($)).text).toContain('merge: #42 3/7 steps')
  })

  test('a budget color change toasts once, after it held, and logs one line; the same reading does not repeat it', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await measure($, GREEN)
    expect(w.toasts).toEqual([])
    w.rateLimits = RED
    await measure($, RED)
    expect(w.toasts).toEqual([])
    await w.clock.advance(4 * MIN)
    expect(w.toasts).toEqual([])
    await measure($, RED)
    await w.clock.advance(2 * MIN)
    expect(w.toasts).toEqual(['Budget is now red'])
    expect(w.logs).toEqual([{ text: 'coordinator-lens: budget green -> red', to: 'transcript' }])
    await measure($, [weekly(81), five(0)])
    await w.clock.advance(10 * MIN)
    expect(w.toasts).toHaveLength(1)
    expect(w.logs).toHaveLength(1)
    w.rateLimits = GREEN
    await measure($, GREEN)
    await w.clock.advance(6 * MIN)
    expect(w.toasts).toEqual(['Budget is now red', 'Budget is now green'])
    expect((await coord($)).text).toContain('budget: green')
  })

  test('a color that flips back before it held is never toasted, logged or put in the decisions', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await measure($, GREEN)
    for (let i = 0; i < 4; i++) {
      w.rateLimits = RED
      await measure($, RED)
      await w.clock.advance(2 * MIN)
      w.rateLimits = GREEN
      await measure($, GREEN)
      await w.clock.advance(2 * MIN)
    }
    expect(w.toasts).toEqual([])
    expect(w.logs).toEqual([])
    expect((await coord($)).text).toContain('decisions: none waiting')
  })

  test('a stalled worker toasts once, then the worker is seen again', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await $.agent.spawn(spawnInput({ description: 'slow reader' }))
    await w.clock.advance(9 * MIN)
    expect(w.toasts).toEqual([])
    await w.clock.advance(3 * MIN)
    expect(w.toasts).toEqual(['No news from slow reader'])
    await w.clock.advance(5 * MIN)
    expect(w.toasts).toHaveLength(1)
    await $.tool.call({ tool: 'Read', file_path: 'a.txt', agentId: 'agent-1' })
    expect((await coord($)).text).toContain('workers: 1 running (slow reader agent)')
  })

  test('the stalled limit is the option', { options: { ...EN, stalledMinutes: '5' } }, async ($, on) => {
    const w = world(on)
    await start($)
    await $.agent.spawn(spawnInput({ description: 'quick limit' }))
    await w.clock.advance(7 * MIN)
    expect(w.toasts).toEqual(['No news from quick limit'])
  })

  test('no toast and no log line carries a middle dot or a dot mark, in either language', async ($, on) => {
    const w = world(on)
    w.answers.Bash = () => ({ result: { stdout: '✓ Merged pull request #42', stderr: '', interrupted: false } })
    await start($)
    await measure($, GREEN)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Unire #42?', header: 'x', options: [], multiSelect: false }] })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 42 --merge --match-head-commit abc --subject "feat (#42)"' })
    await $.agent.spawn(spawnInput({ description: 'slow reader' }))
    w.rateLimits = RED
    await measure($, RED)
    await w.clock.advance(4 * MIN)
    await measure($, RED)
    await w.clock.advance(12 * MIN)
    expect(w.toasts).toEqual(['Ti aspetta: Unire #42?', 'Merge fatto: #42', 'Il budget ora è rosso', 'Nessuna notizia da slow reader'])
    expect(w.logs).toEqual([{ text: 'coordinator-lens: budget verde -> rosso', to: 'transcript' }])
    for (const text of [...w.toasts, ...w.logs.map(l => l.text)]) expect(text).not.toMatch(/[·●]/)
  })

  test('the English toasts and log line say it with words and spaces only too', { options: EN }, async ($, on) => {
    const w = world(on)
    w.answers.Bash = () => ({ result: { stdout: '✓ Merged pull request #42', stderr: '', interrupted: false } })
    await start($)
    await measure($, GREEN)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Merge #42 now?', header: 'x', options: [], multiSelect: false }] })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 42 --merge --match-head-commit abc --subject "feat (#42)"' })
    await $.agent.spawn(spawnInput({ description: 'slow reader' }))
    w.rateLimits = RED
    await measure($, RED)
    await w.clock.advance(4 * MIN)
    await measure($, RED)
    await w.clock.advance(12 * MIN)
    expect(w.toasts).toEqual(['Waiting for you: Merge #42 now?', 'Merged #42', 'Budget is now red', 'No news from slow reader'])
    expect(w.logs).toEqual([{ text: 'coordinator-lens: budget green -> red', to: 'transcript' }])
    for (const text of [...w.toasts, ...w.logs.map(l => l.text)]) expect(text).not.toMatch(/[·●]/)
  })

  test('warnings and plain tool calls never toast', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'git push --force origin x' })
    await $.tool.call({ tool: 'Bash', command: 'gh issue create --title t' })
    await $.tool.call({ tool: 'Read', file_path: 'a' })
    expect(w.toasts).toEqual([])
    expect((await coord($)).text).toContain('warnings:')
  })
})

describe('drawing', () => {
  const BAND = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 11 }, view: {} }
  const PANE = { title: 'Coordinator', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} }

  for (const surface of ['terminal', 'desktop']) {
    test('band on ' + surface + ': one line with the working workflow, no buttons', { options: EN }, async ($, on) => {
      const w = world(on)
      w.answers.Workflow = () => ({ result: WF })
      await start($)
      await $.tool.call({ tool: 'Workflow', script: 'x' })
      await $.agent.spawn(spawnInput({ workflow: { runId: 'wf_1', agentIndex: 0 } }))
      const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND })
      // a dim label and its value, sections four spaces apart, no dot, no middle dot
      expect(await ui.find({ type: 'Text', text: 'Working ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 (wf deep-review 1/8)' })).toBeDefined()
      const lineOf = async handle => (await handle.findAll({ type: 'Text' })).map(x => x.text).join('')
      // the reading a poll brings at start has no known age yet: the budget word is "waiting", and
      // the week shows its percentage without a pace
      expect(await lineOf(ui)).toBe('Budget waiting    Week 17%    5h 0%    Working 1 (wf deep-review 1/8)')
      expect((await ui.drawn()).props.flexDirection).toBe('row')
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
      await ui.unmount()
      // once a response reported the reading, the budget sections come first
      await warm($, w)
      const warmed = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND })
      const line = await lineOf(warmed)
      expect(line).toMatch(/^Budget green    Week 17% \(pace \d+%\)    5h 0%    Working 1 \(wf deep-review 1\/8\)$/)
      expect(line).not.toMatch(/[●·]/)
      expect((await warmed.drawn()).props.flexDirection).toBe('row')
      expect(await warmed.findAll({ type: 'Button' })).toHaveLength(0)
      expect(await warmed.findAll({ type: 'Svg' })).toHaveLength(0)
      await warmed.unmount()
    })

    test('band on ' + surface + ' is Italian by default', async ($, on) => {
      const w = world(on)
      w.answers.Workflow = () => ({ result: WF })
      await start($)
      await warm($, w)
      await $.tool.call({ tool: 'Workflow', script: 'x' })
      await $.agent.spawn(spawnInput({ workflow: { runId: 'wf_1', agentIndex: 0 } }))
      const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND })
      const line = (await ui.findAll({ type: 'Text' })).map(x => x.text).join('')
      expect(line).toMatch(/^Budget verde    Settimana 17% \(ritmo \d+%\)    5 ore 0%    Al lavoro 1 \(wf deep-review 1\/8\)$/)
      await ui.unmount()
    })

    test('band on ' + surface + ' yields to a survey and takes no rows when there is nothing', { options: EN }, async ($, on) => {
      const w = world(on, { rateLimits: [] })
      await start($)
      const quiet = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND })
      expect(await quiet.find({ type: 'Text', text: /engine AbovePrompt/ })).toBeDefined()
      await quiet.unmount()
      w.rateLimits = GREEN
      await measure($, GREEN)
      const survey = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
      expect(await survey.find({ type: 'Text', text: /engine AbovePrompt/ })).toBeDefined()
      await survey.unmount()
    })

    test('card on ' + surface + ': the pace bar is an Svg only on desktop', { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const text = (await coord($)).text
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coord', args: '', text, isErrored: false },
      })
      expect(await ui.find({ type: 'Text', text: 'snapshot   /coord pane for the live panel' })).toBeDefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
      // the sections are a dim UPPERCASE label in a 12-cell column, then the value; no head dot, no middle dot
      expect(await ui.find({ type: 'Text', text: 'BUDGET      ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'WORKERS     ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Week +$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /[·]/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
      await ui.unmount()
    })

    test('the card is the snapshot of the run: a later reading does not redraw it, and a card with no snapshot is plain text on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const text = (await coord($)).text
      w.rateLimits = [weekly(64), five(0)]
      await measure($, w.rateLimits)
      const props = { command: 'coord', args: '', text, isErrored: false }
      const old = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'CommandOutput', props })
      expect(await old.find({ type: 'Text', text: /17%/ })).toBeDefined()
      expect(await old.find({ type: 'Text', text: /64%/ })).toBeUndefined()
      await old.unmount()
      const later = (await coord($)).text
      expect(later).toContain('weekly 64%')
      const fresh = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'CommandOutput', props: { ...props, text: later } })
      expect(await fresh.find({ type: 'Text', text: /64%/ })).toBeDefined()
      await fresh.unmount()
      const lost = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'CommandOutput', props: { ...props, text: 'budget: green' } })
      expect(await lost.find({ type: 'Text', text: /engine CommandOutput/ })).toBeDefined()
      await lost.unmount()
    })

    test('rows with the same text keep their own snapshot: a redraw never swaps it, a new row takes the newest, on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const row = (id, text) => $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput', requestId: id,
        props: { command: 'coord', args: '', text, isErrored: false },
      })
      const text = (await coord($)).text
      const first = await row('row-1', text)
      expect(await first.find({ type: 'Text', text: /resets in 4h$/ })).toBeDefined()
      await first.unmount()
      // 15 minutes later with the same percentages the command answers the same text (a fresh reading's
      // text carries no times), while the card shows times: 4h to the reset has become 3h 45m
      await w.clock.advance(15 * MIN)
      await measure($, w.rateLimits)
      const later = (await coord($)).text
      expect(later).toBe(text)
      const second = await row('row-2', later)
      expect(await second.find({ type: 'Text', text: /resets in 3h 45m$/ })).toBeDefined()
      expect(await second.find({ type: 'Text', text: /resets in 4h$/ })).toBeUndefined()
      await second.unmount()
      // the first row is drawn again (a resize does): it keeps the snapshot it had
      const again = await row('row-1', text)
      expect(await again.find({ type: 'Text', text: /resets in 4h$/ })).toBeDefined()
      expect(await again.find({ type: 'Text', text: /3h 45m/ })).toBeUndefined()
      await again.unmount()
      // and the second keeps its own
      const secondAgain = await row('row-2', later)
      expect(await secondAgain.find({ type: 'Text', text: /resets in 3h 45m$/ })).toBeDefined()
      await secondAgain.unmount()
    })

    test('an unknown argument keeps its plain text, with the line that says what is accepted, on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const text = (await coord($, 'dance now')).text
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coord', args: 'dance now', text, isErrored: false },
      })
      expect(await ui.find({ type: 'Text', text: /engine CommandOutput/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /snapshot/ })).toBeUndefined()
      await ui.unmount()
      const known = (await coord($, 'night on')).text
      const card = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coord', args: 'night on', text: known, isErrored: false },
      })
      expect(await card.find({ type: 'Text', text: /snapshot/ })).toBeDefined()
      await card.unmount()
    })

    test('only /coord and a plugin-prefixed coord draw the card, not a command that merely ends with coord on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const text = (await coord($)).text
      const other = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'subcoord', args: '', text, isErrored: false },
      })
      expect(await other.find({ type: 'Text', text: /snapshot/ })).toBeUndefined()
      await other.unmount()
      const prefixed = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coordinator-lens:coord', args: '', text, isErrored: false },
      })
      expect(await prefixed.find({ type: 'Text', text: /snapshot/ })).toBeDefined()
      await prefixed.unmount()
    })

    test('a command text with the "coordinator-lens: " prefix, as the transcript shows it, draws the card, not the plain text, on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      const text = (await coord($)).text
      expect(text.startsWith('budget: ')).toBe(true)
      const prefixed = 'coordinator-lens: ' + text
      for (const [command, shown] of [['coord', prefixed], ['coordinator-lens:coord', prefixed], ['coord', prefixed + '\n']]) {
        const ui = await $.ui.mount({
          plugin: 'coordinator-lens', surface, component: 'CommandOutput',
          props: { command, args: '', text: shown, isErrored: false },
        })
        // the card tree: a rounded box with the title, the state word and the snapshot footer
        expect((await ui.drawn()).props.borderStyle, command).toBe('round')
        expect(await ui.find({ type: 'Text', text: 'Budget ' })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: 'green' })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: 'snapshot   /coord pane for the live panel' })).toBeDefined()
        expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
        // and not the plain text of the command
        expect(await ui.find({ type: 'Text', text: /engine CommandOutput/ })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /coordinator-lens: budget/ })).toBeUndefined()
        await ui.unmount()
      }
      // the card is still the snapshot of that run, found through the prefix
      w.rateLimits = [weekly(64), five(0)]
      await measure($, w.rateLimits)
      const old = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coord', args: '', text: prefixed, isErrored: false },
      })
      expect(await old.find({ type: 'Text', text: /17%/ })).toBeDefined()
      expect(await old.find({ type: 'Text', text: /64%/ })).toBeUndefined()
      await old.unmount()
      // a prefixed text with no snapshot behind it stays what the command printed
      const lost = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'coord', args: '', text: 'coordinator-lens: budget: green', isErrored: false },
      })
      expect(await lost.find({ type: 'Text', text: /engine CommandOutput/ })).toBeDefined()
      expect(await lost.find({ type: 'Text', text: /snapshot/ })).toBeUndefined()
      await lost.unmount()
    })

    test('other commands keep their own output on ' + surface, { options: EN }, async ($, on) => {
      world(on)
      await start($)
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'status', args: '', text: 'all fine', isErrored: false },
      })
      expect(await ui.find({ type: 'Text', text: /engine CommandOutput/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /snapshot/ })).toBeUndefined()
      await ui.unmount()
    })

    // Pinned before as 'the pane draws no close Button of its own': mod-ui asks for one on x (role dismiss).
    test('pane on ' + surface + ': tabs switch, night toggles, and the close button on x closes the pane', { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'Pane', requestId: 'coord', props: PANE })
      expect((await ui.find({ key: 'tab-overview' })).props.variant).toBe('primary')
      const tabs = (await ui.findAll({ type: 'Button' })).filter(b => b.props.key.startsWith('tab-'))
      expect(tabs.map(b => b.props.key)).toEqual(['tab-overview', 'tab-workers', 'tab-merge', 'tab-flow', 'tab-night'])
      expect((await ui.find({ key: 'close' })).props).toMatchObject({ label: 'Close', hotkey: 'x', role: 'dismiss' })
      await ui.press({ key: 'tab-night' })
      expect((await ui.find({ key: 'tab-night' })).props.variant).toBe('primary')
      expect((await ui.find({ key: 'night-toggle' })).props.label).toBe('Turn night on')
      await ui.press({ key: 'night-toggle' })
      expect((await ui.find({ key: 'night-toggle' })).props.label).toBe('Turn night off')
      expect((await coord($)).text).toContain('night: on')
      // nothing but the close button closes it
      expect(w.closes).toEqual([])
      await ui.press({ key: 'close' })
      expect(w.closes).toHaveLength(1)
      expect(w.closes[0]).toMatchObject({ id: 'coord' })
      await ui.unmount()
    })

    test('another pane is left to the engine on ' + surface, async ($, on) => {
      world(on)
      await start($)
      const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'Pane', requestId: 'other', props: PANE })
      expect(await ui.find({ type: 'Text', text: /engine Pane/ })).toBeDefined()
      expect(await ui.find({ key: 'tab-overview' })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('the spinner carries the workflow and its width while one runs', { options: EN }, async ($, on) => {
    const w = world(on)
    w.answers.Workflow = () => ({ result: WF })
    await start($)
    const props = { word: 'Working', message: null, suffix: '', mode: 'responding' }
    const target = { component: 'Spinner', surface: 'terminal', requestId: 'main', viewport: { columns: 100, rows: 30 }, props }
    await $.ui.render(target)
    expect(w.renders[w.renders.length - 1].props.suffix).toBe('')
    await $.tool.call({ tool: 'Workflow', script: 'x' })
    await $.agent.spawn(spawnInput({ workflow: { runId: 'wf_1', agentIndex: 0 } }))
    await $.ui.render(target)
    expect(w.renders[w.renders.length - 1].props.suffix).toBe('  wf deep-review 1/8')
    await $.ui.render({ ...target, props: { ...props, suffix: ' (3s)' } })
    expect(w.renders[w.renders.length - 1].props.suffix).toBe(' (3s)  wf deep-review 1/8')
    expect(w.renders[w.renders.length - 1].props.suffix).not.toContain('·')
  })
})

// In the real runtime session.measure lists rateLimits only when a window moved a whole point, so most
// events carry none. The lens then reads $.session.usage(): the response that raised the event just
// reported those windows, which makes the reading fresh. Without that, a reading that came from the 60 s
// poll (no timestamp) would never get an age and the band would say "waiting" for the whole session.
describe('a session.measure that carries no rateLimits', () => {
  // what the engine raises for a turn that moved the context but no rate-limit window
  const quietMeasure = ($, e = {}) => $.session.measure({ context: { window: 200000 }, rateLimits: [], changed: ['context'], ...e })

  test('stamps the reading usage() holds as fresh: the band leaves "waiting" for the pace color', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await w.clock.advance(MIN)
    // the 60 s poll brought the windows, but a poll has no timestamp: the age is unknown, so the band waits
    expect(await bandLine($)).toBe('Budget waiting    Week 17%    5h 0%')
    expect((await coord($)).text).toContain('budget: unknown')
    const before = w.usageCalls
    await quietMeasure($)
    expect(w.usageCalls).toBe(before + 1)
    expect(await bandLine($)).toMatch(/^Budget green {4}Week 17% \(pace \d+%\) {4}5h 0%$/)
    expect((await coord($)).text).toContain('budget: green')
    // and the model hears it on the next prompt
    await submit($, 'next')
    expect(w.submits[0].context[0]).toContain('coordinator-lens budget: green')
  })

  test('a measure with no rateLimits field at all is read the same way', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    expect(await bandLine($)).toMatch(/^Budget waiting /)
    await $.session.measure({ context: { window: 200000 }, changed: ['context'] })
    expect(await bandLine($)).toMatch(/^Budget green /)
    expect(w.usageCalls).toBeGreaterThan(1)
  })

  test('the pace color follows the windows usage() holds, not an older reading', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await quietMeasure($)
    expect(await bandLine($)).toMatch(/^Budget green /)
    w.rateLimits = RED
    await quietMeasure($)
    expect(await bandLine($)).toMatch(/^Budget red {4}Week 80% /)
  })

  test('with usage() down or empty it leaves the band as it was and never throws', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    w.deny = { 'session.usage': 1 }
    await quietMeasure($)
    expect(await bandLine($)).toMatch(/^Budget waiting /)
    w.deny = {}
    w.rateLimits = []
    await quietMeasure($)
    expect(await bandLine($)).toMatch(/^Budget waiting /)
    expect((await coord($)).text).toContain('budget: unknown')
  })
})

// budget.md's 10-minute rule is for launch decisions. What the person sees keeps the color of the last
// known reading and says how old it is; the model, budget_estimate and the toasts keep the rule.
describe('a reading older than 10 minutes', () => {
  test('the band keeps the last known color with its age, in English and in Italian; "waiting" is not shown', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    expect(await bandLine($)).toMatch(/^Budget green {4}Week 17% \(pace \d+%\) {4}5h 0%$/)
    await w.clock.advance(12 * MIN)
    // the polls since then carried the same numbers: they do not make the reading look new
    expect(w.usageCalls).toBeGreaterThan(10)
    expect(await bandLine($)).toMatch(/^Budget green \(read 12m ago\) {4}Week 17% \(pace \d+%\) {4}5h 0%$/)
    expect(await bandLine($, 'desktop')).toMatch(/^Budget green \(read 12m ago\) {4}Week 17%/)
    await w.clock.advance(53 * MIN)
    expect(await bandLine($)).toMatch(/^Budget green \(read 1h 5m ago\) /)
  })

  test('Italian by default', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await w.clock.advance(12 * MIN)
    expect(await bandLine($)).toMatch(/^Budget verde \(lettura di 12m fa\) {4}Settimana 17% \(ritmo \d+%\) {4}5 ore 0%$/)
  })

  test('the next response puts the age away; a new color shows at once', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await w.clock.advance(12 * MIN)
    expect(await bandLine($)).toMatch(/\(read 12m ago\)/)
    w.rateLimits = [weekly(30), five(0)]
    await measure($, w.rateLimits)
    expect(await bandLine($)).toMatch(/^Budget yellow {4}Week 30% /)
    // and a reading that sat unchanged for a long time shows its last color, not "waiting", in red too
    w.rateLimits = RED
    await measure($, RED)
    await w.clock.advance(20 * MIN)
    expect(await bandLine($)).toMatch(/^Budget red \(read 20m ago\) {4}Week 80% /)
  })

  test('the model still hears that the reading is old, and budget_estimate leaves the fit open', { options: EN }, async ($, on) => {
    const w = world(on, {
      store: { runCost: { samples: [{ label: 'x', points: 4, weight: 8, agents: 8, at: NOW, plan: null }], last: null } },
    })
    await start($)
    await warm($, w)
    await submit($, 'one')
    expect(w.submits[0].context[0]).toContain('budget: green')
    await w.clock.advance(12 * MIN)
    expect(await bandLine($)).toMatch(/^Budget green \(read 12m ago\) /)
    // the command text is for the model and for where nothing draws: the color is unknown, and it says
    // the reading is old and how old
    const text = (await coord($)).text
    expect(text).toContain('budget: unknown (old reading, read 12m ago)')
    await submit($, 'two')
    expect(w.submits[1].context).toHaveLength(1)
    expect(w.submits[1].context[0]).toContain('budget: unknown (old reading, read 12m ago)')
    expect(w.submits[1].context[0]).not.toContain('pace')
    expect((await $.tool.call({ tool: TOOL, sonnet: 2 })).result).toMatchObject({ points: 1, fits: null, color: 'unknown' })
  })

  test('nothing is toasted or logged when a reading gets old, or when a new one shows the same color again', { options: EN }, async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await w.clock.advance(12 * MIN)
    await measure($, GREEN)
    expect(w.toasts).toEqual([])
    expect(w.logs).toEqual([])
  })

  for (const surface of ['terminal', 'desktop']) {
    test('the card says it in its title and in the BUDGET block, with the same pace bar, on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      await w.clock.advance(12 * MIN)
      const text = (await coord($)).text
      expect(text).toContain('budget: unknown')
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput', requestId: 'old-row',
        props: { command: 'coord', args: '', text, isErrored: false },
      })
      expect((await ui.drawn()).props.borderStyle).toBe('round')
      // the title and the block: the word, then the age, both dim
      const words = await ui.findAll({ type: 'Text', text: 'green' })
      const ages = await ui.findAll({ type: 'Text', text: ' (read 12m ago)' })
      expect(words).toHaveLength(2)
      expect(ages).toHaveLength(2)
      for (const x of [...words, ...ages]) expect(x.props.dimColor).toBe(true)
      expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      await ui.unmount()
      // the card is the snapshot of that run: later it still says 12m, though the reading is older by now
      await w.clock.advance(30 * MIN)
      const again = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput', requestId: 'old-row',
        props: { command: 'coord', args: '', text, isErrored: false },
      })
      expect(await again.find({ type: 'Text', text: ' (read 12m ago)' })).toBeDefined()
      expect(await again.find({ type: 'Text', text: ' (read 42m ago)' })).toBeUndefined()
      await again.unmount()
    })

    test('the pane shows the BUDGET block with the age on ' + surface, { options: EN }, async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      await w.clock.advance(12 * MIN)
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'Pane', requestId: 'coord',
        props: { title: 'Coordinator', isFocused: true, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: ' (read 12m ago)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'green' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /waiting/ })).toBeUndefined()
      await ui.press({ key: 'tab-night' })
      expect(await ui.find({ type: 'Text', text: '12m ago' })).toBeDefined()
      await ui.unmount()
    })
  }
})

describe('the shared store', () => {
  test('the run cost is read before it is written: another session\'s samples are kept', async ($, on) => {
    const w = world(on)
    w.answers.Workflow = () => ({ result: WF })
    await start($)
    await measure($, [weekly(20), five(0)])
    await $.tool.call({ tool: 'Workflow', name: 'deep-review' })
    for (let i = 0; i < 6; i++) await $.agent.spawn(spawnInput({ tool_use_id: 'w' + i, workflow: { runId: 'wf_1', agentIndex: i } }))
    // another session stores its own sample while this run is going
    w.store.set('runCost', { samples: [{ label: 'elsewhere', points: 5, weight: 10, agents: 10, at: NOW - HOUR, plan: null }], last: { label: 'elsewhere', points: 5, agents: 10 } })
    await submit($, NOTICE('task1', 6), { kind: 'task-notification' })
    await measure($, [weekly(23), five(0)])
    const saved = w.store.get('runCost')
    expect(saved.samples.map(x => x.label)).toEqual(['elsewhere', 'deep-review'])
    expect(saved.last).toMatchObject({ label: 'deep-review', points: 3 })
    expect((await coord($)).text).toContain('(2 samples)')
  })

  test('night is written when this session changes it, and left alone by a session that did not', async ($, on) => {
    const w = world(on)
    await start($)
    await measure($, GREEN)
    expect(w.storeSets).not.toContain('night')
    await coord($, 'night on')
    expect(w.store.get('night')).toMatchObject({ on: true })
    await coord($, 'night off')
    expect(w.store.get('night')).toMatchObject({ on: false })
  })

  test('a session still holding night on does not turn it back on after another session turned it off', async ($, on) => {
    const w = world(on)
    await start($)
    await measure($, GREEN)
    await coord($, 'night on')
    w.storeSets.length = 0
    // another session turns night off
    w.store.set('night', { on: false, since: null, nextWakeAt: null, pointsBase: null, baseResetsAt: null, carry: 0, pointsSince: null })
    await measure($, [weekly(19), five(0)])
    expect(w.storeSets).not.toContain('night')
    expect(w.store.get('night')).toMatchObject({ on: false })
  })

  test('a night that is still going on keeps its progress in the store', async ($, on) => {
    const w = world(on)
    await start($)
    await measure($, GREEN)
    await coord($, 'night on')
    await measure($, [weekly(19), five(0)])
    expect(w.store.get('night')).toMatchObject({ on: true, pointsSince: 2 })
  })
})

describe('redeemed resets across a reload', () => {
  const LINE = 'Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22'

  test('a redemption is kept in the store as soon as it is seen', async ($, on) => {
    const w = world(on, { store: { planLine: LINE }, rateLimits: [weekly(40), five(0)] })
    await start($)
    await measure($, [weekly(40), five(0)])
    w.rateLimits = [weekly(2), five(0)]
    await measure($, [weekly(2), five(0)])
    expect(w.store.get('redeemed')).toMatchObject({ keys: ['weekly:2026-10-22'], mark: { used: 2 } })
    await submit($)
    expect(w.submits[0].context[0]).not.toContain('weekly reset banked')
  })

  test('after a reload the redeemed reset does not count again', async ($, on) => {
    const w = world(on, { store: { planLine: LINE, redeemed: { keys: ['weekly:2026-10-22'], mark: null } } })
    await start($)
    await warm($, w)
    await submit($)
    expect(w.submits[0].context[0]).toContain('budget:')
    expect(w.submits[0].context[0]).not.toContain('weekly reset banked until 2026-10-22')
  })

  test('a high reading before the reload and a low one after it is still a redemption', async ($, on) => {
    const w = world(on, { store: { planLine: LINE, redeemed: { keys: [], mark: { resetsAt: NOW + 144 * HOUR, used: 60 } } }, rateLimits: [weekly(3), five(0)] })
    await start($)
    expect(w.store.get('redeemed')).toMatchObject({ keys: ['weekly:2026-10-22'] })
  })
})

describe('the session', () => {
  for (const source of ['clear', 'resume', 'compact']) {
    test('after a ' + source + ' the first prompt carries the budget line again', async ($, on) => {
      const w = world(on)
      await start($)
      await warm($, w)
      await submit($, 'one')
      expect(w.submits[0].context).toHaveLength(1)
      await submit($, 'two')
      expect(w.submits[1].context).toBeUndefined()
      await $.classic.SessionStart({ source })
      await submit($, 'three')
      expect(w.submits[2].context).toHaveLength(1)
    })
  }

  test('a startup does not send the budget line again', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await submit($, 'one')
    await $.classic.SessionStart({ source: 'startup' })
    await submit($, 'two')
    expect(w.submits[1].context).toBeUndefined()
  })

  test('a clear registers the command and the tool again; a startup does not', async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.commands).toHaveLength(1)
    await $.classic.SessionStart({ source: 'clear' })
    expect(w.commands).toHaveLength(2)
    expect(w.tools).toHaveLength(2)
    await $.classic.SessionStart({ source: 'startup' })
    expect(w.commands).toHaveLength(2)
    await $.classic.SessionStart({ source: 'resume' })
    expect(w.commands).toHaveLength(3)
    expect(w.tools).toHaveLength(3)
  })

  test('the end of the session stops the timers', async ($, on) => {
    const w = world(on)
    await start($)
    await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })
    const before = w.usageCalls
    await w.clock.advance(5 * MIN)
    expect(w.usageCalls).toBe(before)
  })

  test('after a hot reload, with no session.start, the first prompt starts the lens', async ($, on) => {
    const w = world(on)
    await submit($, 'first')
    expect(w.commands).toHaveLength(1)
    expect(w.tools).toHaveLength(1)
    expect(w.usageCalls).toBeGreaterThan(0)
    expect(w.submits[0].context).toBeUndefined()
    const before = w.usageCalls
    await w.clock.advance(2 * MIN)
    expect(w.usageCalls).toBe(before + 2)
    await warm($, w)
    await submit($, 'second')
    expect(w.submits[1].context).toHaveLength(1)
  })

  test('after a hot reload, /coord as the first event starts the lens', async ($, on) => {
    const w = world(on, { store: { night: { on: true, since: NOW - HOUR, nextWakeAt: null, pointsBase: 10, baseResetsAt: null, carry: 0, pointsSince: 1 } } })
    const r = await coord($)
    expect(w.commands).toHaveLength(1)
    expect(w.tools).toHaveLength(1)
    // the store was read: the night that was on comes back
    expect(r.text).toContain('night: on')
  })

  test('after a hot reload, a measure as the first event starts the lens', async ($, on) => {
    const w = world(on, { store: { runCost: { samples: [{ label: 'deep-review', points: 4, weight: 8, agents: 8, at: NOW }], last: null } } })
    await measure($, GREEN)
    expect(w.commands).toHaveLength(1)
    expect(w.tools).toHaveLength(1)
    expect((await coord($)).text).toContain('run cost: 0.5 weekly points per Sonnet-sized agent (1 samples)')
  })

  test('the timer reads usage every minute', async ($, on) => {
    const w = world(on)
    await start($)
    const before = w.usageCalls
    await w.clock.advance(3 * MIN)
    expect(w.usageCalls).toBe(before + 3)
  })
})

describe('second fix round', () => {
  test('a Workflow call that comes back as an error shows a failed worker, not a running one', async ($, on) => {
    const w = world(on)
    w.answers.Workflow = () => ({ result: 'script failed', isError: true, text: 'script failed' })
    await start($)
    await $.tool.call({ tool: 'Workflow', script: 'x' })
    expect((await coord($)).text).toContain('workers: 1 failed')
  })

  test('a session URL on stderr, or only in the text of an error answer, is still a cloud worker', async ($, on) => {
    const w = world(on)
    await start($)
    w.answers.Bash = () => ({ result: { stdout: '', stderr: 'Started https://claude.ai/code/session_ERR1\n', interrupted: false } })
    await $.tool.call({ tool: 'Bash', command: 'claude --cloud --model sonnet "on stderr"' })
    w.answers.Bash = () => ({ result: 'exit 1', isError: true, text: 'Started https://claude.ai/code/session_TXT2' })
    await $.tool.call({ tool: 'Bash', command: 'claude --cloud --model sonnet "in text"' })
    expect((await coord($)).text).toContain('workers: 2 running (on stderr cloud, in text cloud)')
    // the URL itself was read: a notification that names it ends that worker, and only that one
    const notice = '<task-notification>\n<task-id>other</task-id>\n<status>completed</status>\n<summary>https://claude.ai/code/session_ERR1 finished</summary>\n</task-notification>'
    await submit($, notice, { kind: 'task-notification' })
    expect((await coord($)).text).toContain('workers: 1 running (in text cloud), 1 done')
  })

  test('/coord pane in a -p run (no surface) answers with the text and opens nothing', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await start($, { surface: null, isInteractive: false })
    await warm($, w)
    const r = await coord($, 'pane')
    expect(r.text).toContain('budget: green')
    expect(w.opens).toEqual([])
  })

  test('/coord pane in an SDK session with a desktop surface opens the pane', async ($, on) => {
    // the Desktop app is an SDK host: session.start says nobody is at the prompt, yet it draws panes
    const w = world(on, { surfaces: ['desktop'] })
    await start($, { surface: null, isInteractive: false })
    await warm($, w)
    const r = await coord($, 'pane')
    expect(w.opens).toHaveLength(1)
    expect(r.text).toBeUndefined()
  })

  test('an unknown argument keeps the whole answer at 10 lines', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q', questions: [{ question: 'Merge?', header: 'M', options: [], multiSelect: false }] })
    await coord($, 'night on')
    await $.tool.call({ tool: 'Bash', command: 'gh issue create --title x' })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 3 --merge' })
    await $.tool.call({ tool: 'Skill', skill: 'grill-me' })
    expect(lines((await coord($)).text).length).toBe(10)
    const r = await coord($, 'dance')
    expect(lines(r.text)).toHaveLength(10)
    expect(lines(r.text)[0]).toBe('/coord: unknown argument "dance" (use pane, night on, night off)')
  })

  test('a wake is shown only once the call went through, at the time the runtime clamps it to', async ($, on) => {
    const w = world(on)
    await start($)
    await coord($, 'night on')
    w.answers.ScheduleWakeup = () => ({ deny: 'not now' })
    await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 600, reason: 'night' })
    expect((await coord($)).text).not.toContain('next wake')
    w.answers.ScheduleWakeup = () => ({ result: 'scheduled' })
    await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 10, reason: 'night' })
    expect((await coord($)).text).toContain('next wake in 1m')
    await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 99999, reason: 'night' })
    expect((await coord($)).text).toContain('next wake in 1h')
  })

  test('a merge that goes on in the background is recorded only when its notification says it ended well', async ($, on) => {
    const w = world(on)
    await start($)
    w.answers.Bash = () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bash_1' } })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12 --merge --match-head-commit abc', run_in_background: true })
    expect((await coord($)).text).not.toContain('merged')
    expect(w.toasts).toEqual([])
    const done = '<task-notification>\n<task-id>bash_1</task-id>\n<status>completed</status>\n<summary>Background command completed (exit code 0)</summary>\n</task-notification>'
    await submit($, done, { kind: 'task-notification' })
    expect((await coord($)).text).toMatch(/merge: #12 \d\/7 steps/)
    expect(w.toasts).toEqual(['Merge fatto: #12'])
    // one that ended badly, or that timed out into the background with no id, is no merge
    w.answers.Bash = () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bash_2' } })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 13 --merge' })
    await submit($, done.replace('bash_1', 'bash_2').replace('completed</status>', 'failed</status>'), { kind: 'task-notification' })
    w.answers.Bash = () => ({ result: { stdout: '', stderr: '', interrupted: false, timedOutAfterMs: 120000 } })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 14 --merge' })
    expect(w.toasts).toEqual(['Merge fatto: #12'])
    const text = (await coord($)).text
    expect(text).toContain('merge: #13 0/7 steps')
    expect(text).not.toContain('#14')
  })

  test('with no plan line the model reads that the plan is assumed', async ($, on) => {
    const w = world(on)
    await start($)
    await warm($, w)
    expect(lines((await coord($)).text)[0]).toContain('profile Max 5x, plan assumed (no Claude plan line; Pro accounts use Pro)')
    await $.prompt.context({ blocks: [], instructionFiles: [{ path: '/u/CLAUDE.md', kind: 'user', content: PLAN }] })
    expect((await coord($)).text).not.toContain('plan assumed')
  })
})
