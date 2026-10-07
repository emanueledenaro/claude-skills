// The tracker is pure: state in, state out, with `now` passed in. These tests drive the reducers the way
// register.js does and read the result through viewModel.
// @ts-nocheck
import { test, expect, describe } from 'claude-code/testing'
import {
  createState, setPlan, planFromContext, planFromOption, applyUsage, budgetOf, onAgentToolCall, onAgentToolResult,
  onAgentSpawned, onTurnComplete, touch, onWorkflowLaunch, onTaskNotification, onMeasure, onShellCommand, onPrList,
  onSkill, onFileWrite, onQuestion, onQuestionAnswered, onWake, onColorChange, setNight, tick, viewModel, notifications,
  estimateRun, dump, restore, mergeRunCost, MERGE_STEPS, ROUND_ITEMS, STAGES,
} from '../hooks/tracker.js'
import { parsePlanLine } from '../hooks/budget.js'
import * as budgetModule from '../hooks/budget.js'

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0)
const MIN = 60000
const HOUR = 3600000
const PLAN = 'Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22'

function limits(weekly, five = 0, at = NOW, weeks = 144) {
  const out = []
  if (weekly !== null) out.push({ kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(at + weeks * HOUR).toISOString() })
  if (five !== null) out.push({ kind: 'five_hour', percentUsed: five, resetsAt: new Date(at + 4 * HOUR).toISOString() })
  return out
}

function fresh(weekly = 20, at = NOW) {
  const s = createState()
  setPlan(s, parsePlanLine(PLAN))
  applyUsage(s, { rateLimits: limits(weekly, 0, NOW), now: at, fresh: true })
  return s
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps
const vmOf = (s, now = NOW, lang = 'en') => viewModel(s, budgetOf(s, now), lang, now)
const worker = (s, id, now = NOW) => vmOf(s, now).workers.find(w => w.id === id)
const steps = vm => Object.fromEntries(vm.merge.steps.map(x => [x.key, x.done]))
const items = vm => Object.fromEntries(vm.round.items.map(x => [x.key, x.done]))
const stages = vm => Object.fromEntries(vm.flow.stages.map(x => [x.key, x.state]))

function spawnWf(s, runId, index, model, now = NOW, agentId = 'a' + runId + index) {
  onAgentSpawned(s, { toolUseId: 'tu' + index, input: { workflow: { runId, agentIndex: index }, model, parentModel: 'opus', tool_use_id: 'tu' + index }, result: { model: model || 'opus', agentId }, now })
}

describe('view model', () => {
  test('an empty state has the full contract shape', () => {
    const vm = vmOf(createState())
    expect(Object.keys(vm).sort()).toEqual(['budget', 'decisions', 'flow', 'lang', 'merge', 'night', 'now', 'prs', 'round', 'runCost', 'workers'])
    expect(vm.budget.color).toBe('unknown')
    expect(vm.budget.lastReadingAt).toBe(null)
    expect(vm.merge.steps.map(x => x.key)).toEqual(MERGE_STEPS)
    expect(vm.merge.steps.every(x => x.done === false)).toBe(true)
    expect(vm.round.items.map(x => x.key)).toEqual(ROUND_ITEMS)
    expect(vm.flow.stages.map(x => x.key)).toEqual(STAGES)
    expect(vm.flow.stages.every(x => x.state === 'todo')).toBe(true)
    expect(vm.flow.current).toBe(null)
    expect(vm.workers).toEqual([])
    expect(vm.night).toEqual({ on: false, since: null, nextWakeAt: null, pointsSince: null })
    expect(vm.runCost).toEqual({ unitPoints: null, samples: 0, last: null })
  })

  test('the language is normalised and the state is not shared with the view model', () => {
    const s = fresh()
    expect(viewModel(s, null, 'fr', NOW).lang).toBe('it')
    expect(vmOf(s, NOW, 'en').lang).toBe('en')
    onAgentToolCall(s, { toolUseId: 't1', input: { description: 'one' }, now: NOW })
    const vm = vmOf(s)
    vm.workers[0].label = 'changed'
    expect(vmOf(s).workers[0].label).toBe('one')
  })
})

describe('budget', () => {
  test('a reading gives a color; without one the color is unknown', () => {
    expect(budgetOf(createState(), NOW).color).toBe('unknown')
    const s = fresh(17)
    const b = budgetOf(s, NOW)
    expect(b.color).toBe('green')
    expect(b.lastReadingAt).toBe(NOW)
  })

  test('a poll without news does not make an old reading look new', () => {
    const s = fresh(20)
    applyUsage(s, { rateLimits: limits(20), now: NOW + 5 * MIN, fresh: false })
    expect(budgetOf(s, NOW + 5 * MIN).lastReadingAt).toBe(NOW)
    expect(budgetOf(s, NOW + 11 * MIN).color).toBe('unknown')
    applyUsage(s, { rateLimits: limits(21), now: NOW + 12 * MIN, fresh: false })
    expect(budgetOf(s, NOW + 12 * MIN).lastReadingAt).toBe(NOW + 12 * MIN)
    onMeasure(s, { rateLimits: limits(21), now: NOW + 15 * MIN })
    expect(budgetOf(s, NOW + 15 * MIN).lastReadingAt).toBe(NOW + 15 * MIN)
  })

  test('an empty or foreign reading is ignored', () => {
    const s = fresh(20)
    applyUsage(s, { rateLimits: [], now: NOW + MIN, fresh: true })
    applyUsage(s, { rateLimits: [{ kind: 'spend_limit', percentUsed: 5 }], now: NOW + MIN, fresh: true })
    applyUsage(s, { rateLimits: null, now: NOW + MIN, fresh: true })
    expect(budgetOf(s, NOW + MIN).weekly.used).toBe(20)
  })

  test('weekly use falling inside one window means a banked reset was redeemed: it stops counting', () => {
    const s = fresh(40)
    expect(budgetOf(s, NOW).resets).toHaveLength(1)
    applyUsage(s, { rateLimits: limits(2), now: NOW + MIN, fresh: true })
    expect(budgetOf(s, NOW + MIN).resets).toHaveLength(0)
    expect(s.redeemedKeys).toEqual(['weekly:2026-10-22'])
  })

  test('a small fall or a new window is not a redemption', () => {
    const s = fresh(40)
    applyUsage(s, { rateLimits: limits(38.5), now: NOW + MIN, fresh: true })
    applyUsage(s, { rateLimits: limits(2, 0, NOW + 200 * HOUR), now: NOW + 2 * MIN, fresh: true })
    expect(s.redeemedKeys).toEqual([])
  })

  test('the redeemed reset is remembered by its entry: removing it from the plan line does not drop a second one', () => {
    const s = createState()
    setPlan(s, parsePlanLine('Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-20; weekly reset, expires 2026-10-28'))
    applyUsage(s, { rateLimits: limits(80), now: NOW, fresh: true })
    applyUsage(s, { rateLimits: limits(1), now: NOW + MIN, fresh: true })
    expect(s.redeemedKeys).toEqual(['weekly:2026-10-20'])
    expect(budgetOf(s, NOW + MIN).resets.map(r => r.expires)).toEqual(['2026-10-28'])
    // the person takes the redeemed entry out of the plan line; the next prompt.context re-reads it
    setPlan(s, parsePlanLine('Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-28'))
    expect(budgetOf(s, NOW + MIN).resets.map(r => r.expires)).toEqual(['2026-10-28'])
    // a second redemption takes the one entry left
    applyUsage(s, { rateLimits: limits(60), now: NOW + 2 * MIN, fresh: true })
    applyUsage(s, { rateLimits: limits(1), now: NOW + 3 * MIN, fresh: true })
    expect(s.redeemedKeys).toEqual(['weekly:2026-10-20', 'weekly:2026-10-28'])
    expect(budgetOf(s, NOW + 3 * MIN).resets).toHaveLength(0)
  })

  test('two resets that expire the same day are redeemed one at a time', () => {
    const s = createState()
    setPlan(s, parsePlanLine('Claude plan: Max 20x · banked: weekly reset, expires 2026-10-20; weekly reset, expires 2026-10-20'))
    applyUsage(s, { rateLimits: limits(80), now: NOW, fresh: true })
    applyUsage(s, { rateLimits: limits(1), now: NOW + MIN, fresh: true })
    expect(budgetOf(s, NOW + MIN).resets).toHaveLength(1)
  })

  test('a poll before any measured reading has an unknown age: the color stays unknown until a measure', () => {
    const s = createState()
    setPlan(s, parsePlanLine(PLAN))
    applyUsage(s, { rateLimits: limits(17), now: NOW, fresh: false })
    let b = budgetOf(s, NOW)
    expect(b.color).toBe('unknown')
    expect(b.reason).toBe('stale-reading')
    expect(b.lastReadingAt).toBe(null)
    expect(b.weekly.used).toBe(17)
    applyUsage(s, { rateLimits: limits(18), now: NOW + MIN, fresh: false })
    expect(budgetOf(s, NOW + MIN).color).toBe('unknown')
    onMeasure(s, { rateLimits: limits(18), now: NOW + 2 * MIN })
    b = budgetOf(s, NOW + 2 * MIN)
    expect(b.color).toBe('green')
    expect(b.lastReadingAt).toBe(NOW + 2 * MIN)
  })

  test('a reading older than 10 minutes: the budget keeps the rule (unknown), `shown` keeps the last known color for the person', () => {
    const s = fresh(17)
    expect(budgetOf(s, NOW + 10 * MIN)).toMatchObject({ color: 'green', shown: null })
    const b = budgetOf(s, NOW + 12 * MIN)
    // what the model, budget_estimate and the toasts read: budget.md's 10-minute rule
    expect(b).toMatchObject({ color: 'unknown', reason: 'stale-reading', pace: null, margin: null, lastReadingAt: NOW })
    expect(b.weekly.used).toBe(17)
    // what the person sees: the color worked out from the same windows, without the staleness cut
    expect(b.shown).toMatchObject({ color: 'green', reason: 'pace' })
    expect(b.shown.pace).toBeGreaterThan(0)
    expect(b.shown.profile.name).toBe('Max 20x')
    expect(b.shown.weekly.used).toBe(17)
    // it is the budget a fresh reading of the same windows would give at that moment
    const same = budgetOf(fresh(17, NOW + 12 * MIN), NOW + 12 * MIN)
    expect(same.shown).toBe(null)
    expect(near(b.shown.pace, same.pace)).toBe(true)
    expect(near(b.shown.margin, same.margin)).toBe(true)
    expect(b.shown.color).toBe(same.color)
    // the view model carries both
    const vm = vmOf(s, NOW + 12 * MIN)
    expect(vm.budget.color).toBe('unknown')
    expect(vm.budget.shown.color).toBe('green')
    expect(vm.budget.lastReadingAt).toBe(NOW)
  })

  test('the last known color follows the pace: yellow steps the profile down, red launches nothing', () => {
    // an old red or yellow reading keeps holding for the model too (budget.js never loosens the guard)
    const yellow = budgetOf(fresh(45), NOW + 15 * MIN)
    expect(yellow).toMatchObject({ color: 'yellow', shown: { color: 'yellow' } })
    expect(yellow.profile.name).toBe('Max 5x')
    expect(yellow.shown.profile.name).toBe('Max 5x')
    const red = budgetOf(fresh(60), NOW + 15 * MIN)
    expect(red).toMatchObject({ color: 'red', shown: { color: 'red' } })
    expect(red.profile.width).toBe(0)
    expect(red.shown.profile.width).toBe(0)
  })

  test('`shown` exists only for a reading of known age that is older than 10 minutes and still has its window', () => {
    // a reading that just came: the budget itself
    expect(budgetOf(fresh(17), NOW).shown).toBe(null)
    // no reading at all
    expect(budgetOf(createState(), NOW + HOUR).shown).toBe(null)
    // a poll before any response has no age: it stays unknown, nothing to show an age for
    const polled = createState()
    setPlan(polled, parsePlanLine(PLAN))
    applyUsage(polled, { rateLimits: limits(17), now: NOW, fresh: false })
    expect(budgetOf(polled, NOW + HOUR)).toMatchObject({ color: 'unknown', lastReadingAt: null, shown: null })
    // a 5-hour window alone has no weekly pace to color
    const fiveOnly = createState()
    applyUsage(fiveOnly, { rateLimits: limits(null, 10), now: NOW, fresh: true })
    expect(budgetOf(fiveOnly, NOW + HOUR)).toMatchObject({ color: 'unknown', reason: 'no-reading', shown: null })
    // the weekly window ended while the reading sat there: the numbers are not this week's any more
    const over = fresh(17)
    expect(budgetOf(over, NOW + 145 * HOUR)).toMatchObject({ color: 'unknown', shown: null })
    // the next reading puts it back
    const again = fresh(17)
    onMeasure(again, { rateLimits: limits(18), now: NOW + 13 * MIN })
    expect(budgetOf(again, NOW + 13 * MIN)).toMatchObject({ color: 'green', shown: null })
  })

  test('budget_estimate keeps fits open on an old reading, whatever `shown` says', () => {
    const s = fresh(17)
    s.runCost.samples.push({ label: 'x', points: 4, weight: 8, agents: 8, at: NOW, plan: 'Max 20x' })
    const b = budgetOf(s, NOW + 12 * MIN)
    expect(b.shown.color).toBe('green')
    expect(estimateRun(s, b, { sonnet: 2 })).toMatchObject({ points: 1, fits: null, color: 'unknown' })
  })

  test('an old reading raises no color toast: the cut budget is unknown, and unknown never counts', () => {
    const s = fresh(17)
    const before = vmOf(s, NOW)
    const after = vmOf(s, NOW + 12 * MIN)
    expect(notifications(before, after).filter(n => n.kind === 'color')).toEqual([])
  })

  test('plan: the user file first, then another file, then the option; a bare option text gets its prefix', () => {
    const files = [
      { path: '/repo/CLAUDE.md', kind: 'project', content: 'Claude plan: Pro' },
      { path: '/home/u/.claude/CLAUDE.md', kind: 'user', content: '# Notes\n' + PLAN + '\n' },
    ]
    expect(planFromContext(files, '').name).toBe('Max 20x')
    expect(planFromContext([files[0]], '').name).toBe('Pro')
    expect(planFromContext([], 'Max 5x · reserve 15%').name).toBe('Max 5x')
    expect(planFromContext(undefined, '')).toBe(null)
    expect(planFromOption('  ')).toBe(null)
    expect(planFromOption(PLAN).reserve).toBe(10)
  })
})

describe('workflow cost', () => {
  function run(s, { runId = 'wf_1', t0 = NOW, spawns = [['sonnet', 5], ['opus', 2]], after = 24, notice } = {}) {
    onWorkflowLaunch(s, { toolUseId: 'tuw', input: { script: "export const meta = { name: 'deep-review' }" }, result: { status: 'async_launched', taskId: 'task1', runId, workflowName: 'deep-review' }, now: t0 })
    let i = 0
    for (const [model, n] of spawns) for (let k = 0; k < n; k++) spawnWf(s, runId, i++, model, t0 + MIN)
    onTaskNotification(s, notice || '<task-notification><task-id>task1</task-id><status>completed</status><summary>done</summary><agent_count>' + i + '</agent_count><subagent_tokens>1500000</subagent_tokens></task-notification>', t0 + 30 * MIN)
    onMeasure(s, { rateLimits: limits(after), now: t0 + 31 * MIN })
  }

  test('launch, spawn, notification and measure give the run its points and the unit its value', () => {
    const s = fresh(20)
    onWorkflowLaunch(s, { toolUseId: 'tuw', input: { script: 'x' }, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1', workflowName: 'deep-review' }, now: NOW })
    let w = worker(s, 'wf_1')
    expect(w).toMatchObject({ kind: 'workflow', label: 'deep-review', status: 'running', agents: null, points: null })
    for (let i = 0; i < 5; i++) spawnWf(s, 'wf_1', i, 'sonnet', NOW + MIN)
    for (let i = 5; i < 7; i++) spawnWf(s, 'wf_1', i, 'claude-opus-4-8', NOW + MIN)
    spawnWf(s, 'wf_1', 3, 'sonnet', NOW + MIN)
    w = worker(s, 'wf_1', NOW + MIN)
    expect(w.agents).toEqual({ total: 7, sonnet: 5, opus: 2, fable: 0, other: 0 })
    onTaskNotification(s, '<task-id>task1</task-id>\n<status>completed</status>\n<summary>ok</summary>\n<agent_count>7</agent_count>\n<subagent_tokens>1.5M</subagent_tokens>', NOW + 30 * MIN)
    w = worker(s, 'wf_1', NOW + 30 * MIN)
    expect(w.status).toBe('done')
    expect(w.endedAt).toBe(NOW + 30 * MIN)
    expect(w.points).toBe(null)
    onMeasure(s, { rateLimits: limits(24), now: NOW + 31 * MIN })
    const vm = vmOf(s, NOW + 31 * MIN)
    expect(vm.workers[0].points).toBe(4)
    expect(vm.runCost.samples).toBe(1)
    expect(near(vm.runCost.unitPoints, 4 / 9)).toBe(true)
    expect(vm.runCost.last).toEqual({ label: 'deep-review', points: 4, agents: 7 })
  })

  test('the unit is the mean over runs; a run that missed agents is not a sample', () => {
    const s = fresh(20)
    run(s, { runId: 'wf_1', after: 24 })
    run(s, { runId: 'wf_2', t0: NOW + 2 * HOUR, spawns: [['sonnet', 4]], after: 26 })
    const vm = vmOf(s, NOW + 3 * HOUR)
    expect(vm.runCost.samples).toBe(2)
    expect(near(vm.runCost.unitPoints, (4 / 9 + 2 / 4) / 2)).toBe(true)
    const m = fresh(20)
    run(m, { spawns: [['sonnet', 3]], notice: '<task-id>task1</task-id><status>completed</status><agent_count>9</agent_count>', after: 30 })
    expect(vmOf(m, NOW + HOUR).runCost.samples).toBe(0)
    expect(worker(m, 'wf_1', NOW + HOUR).points).toBe(10)
  })

  test('the points wait for the first reading after the notification', () => {
    const s = fresh(20)
    run(s, { after: 24 })
    onTaskNotification(s, '<task-id>nothing</task-id><status>completed</status>', NOW + HOUR)
    expect(vmOf(s, NOW + HOUR).runCost.samples).toBe(1)
    const early = fresh(20)
    onWorkflowLaunch(early, { toolUseId: 'tuw', input: {}, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1' }, now: NOW })
    spawnWf(early, 'wf_1', 0, 'sonnet', NOW + MIN)
    onTaskNotification(early, '<task-id>task1</task-id><status>completed</status>', NOW + 10 * MIN)
    onMeasure(early, { rateLimits: limits(21), now: NOW + 5 * MIN })
    expect(worker(early, 'wf_1', NOW + 10 * MIN).points).toBe(null)
    onMeasure(early, { rateLimits: limits(22), now: NOW + 11 * MIN })
    expect(worker(early, 'wf_1', NOW + 11 * MIN).points).toBe(2)
  })

  test('a run that straddles a redemption or a new weekly window has no points', () => {
    const redeemed = fresh(30)
    onWorkflowLaunch(redeemed, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1' }, now: NOW })
    spawnWf(redeemed, 'wf_1', 0, 'sonnet', NOW + MIN)
    applyUsage(redeemed, { rateLimits: limits(3), now: NOW + 10 * MIN, fresh: true })
    onTaskNotification(redeemed, '<task-id>task1</task-id><status>completed</status>', NOW + 20 * MIN)
    onMeasure(redeemed, { rateLimits: limits(5), now: NOW + 21 * MIN })
    expect(worker(redeemed, 'wf_1', NOW + 21 * MIN).points).toBe(null)
    expect(vmOf(redeemed, NOW + 21 * MIN).runCost.samples).toBe(0)

    const rolled = fresh(60)
    onWorkflowLaunch(rolled, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1' }, now: NOW })
    spawnWf(rolled, 'wf_1', 0, 'sonnet', NOW + MIN)
    onTaskNotification(rolled, '<task-id>task1</task-id><status>completed</status>', NOW + 20 * MIN)
    onMeasure(rolled, { rateLimits: limits(2, 0, NOW + 20 * MIN, 150), now: NOW + 21 * MIN })
    expect(worker(rolled, 'wf_1', NOW + 21 * MIN).points).toBe(null)
  })

  test('a resumed workflow starts over: a fresh reading, its agents counted anew, no inflated sample', () => {
    const s = fresh(10)
    run(s, { runId: 'wf_1', spawns: [['sonnet', 4]], after: 14 })
    expect(s.runCost.samples).toEqual([expect.objectContaining({ points: 4, weight: 4 })])
    // other work moves the weekly percent while the run sits finished
    applyUsage(s, { rateLimits: limits(20), now: NOW + HOUR, fresh: true })
    onWorkflowLaunch(s, { toolUseId: 'tr', input: { resumeFromRunId: 'wf_1' }, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1', workflowName: 'deep-review' }, now: NOW + HOUR })
    let w = worker(s, 'wf_1', NOW + HOUR)
    expect(w.status).toBe('running')
    expect(w.endedAt).toBe(null)
    expect(w.agents).toBe(null)
    expect(w.points).toBe(null)
    spawnWf(s, 'wf_1', 0, 'sonnet', NOW + HOUR + MIN)
    spawnWf(s, 'wf_1', 4, 'sonnet', NOW + HOUR + MIN)
    expect(worker(s, 'wf_1', NOW + HOUR + MIN).agents.total).toBe(2)
    onTaskNotification(s, '<task-id>task1</task-id><status>completed</status><agent_count>2</agent_count>', NOW + 2 * HOUR)
    onMeasure(s, { rateLimits: limits(22), now: NOW + 2 * HOUR + MIN })
    w = worker(s, 'wf_1', NOW + 2 * HOUR + MIN)
    expect(w.points).toBe(2)
    expect(s.runCost.samples.map(x => x.points)).toEqual([4, 2])
  })

  test('a resumed run whose agent.spawn arrives before the launch result is reset once, by the spawn', () => {
    const s = fresh(10)
    run(s, { runId: 'wf_1', spawns: [['sonnet', 4]], after: 14 })
    applyUsage(s, { rateLimits: limits(20), now: NOW + HOUR, fresh: true })
    spawnWf(s, 'wf_1', 4, 'sonnet', NOW + HOUR)
    const w = worker(s, 'wf_1', NOW + HOUR)
    expect(w).toMatchObject({ status: 'running', endedAt: null })
    expect(w.agents.total).toBe(1)
    onWorkflowLaunch(s, { toolUseId: 'tr', input: {}, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1' }, now: NOW + HOUR + MIN })
    expect(worker(s, 'wf_1', NOW + HOUR + MIN).agents.total).toBe(1)
    onTaskNotification(s, '<task-id>task1</task-id><status>completed</status>', NOW + 2 * HOUR)
    onMeasure(s, { rateLimits: limits(22), now: NOW + 2 * HOUR + MIN })
    expect(worker(s, 'wf_1', NOW + 2 * HOUR + MIN).points).toBe(2)
  })

  test('a failed or killed workflow ends as failed', () => {
    const s = fresh()
    onWorkflowLaunch(s, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 'task1', runId: 'wf_1' }, now: NOW })
    onTaskNotification(s, '<task-id>task1</task-id><status>killed</status>', NOW + MIN)
    expect(worker(s, 'wf_1', NOW + MIN).status).toBe('failed')
  })

  test('agents of a run seen before its launch result still count, and the launch names the run later', () => {
    const s = fresh()
    spawnWf(s, 'wf_9', 0, 'sonnet')
    spawnWf(s, 'wf_9', 1, 'fable')
    expect(worker(s, 'wf_9').label).toBe('workflow')
    onWorkflowLaunch(s, { toolUseId: 'tuw', input: { name: 'ignored' }, result: { status: 'async_launched', taskId: 'task9', runId: 'wf_9', workflowName: 'late-name' }, now: NOW + MIN })
    const vm = vmOf(s, NOW + MIN)
    expect(vm.workers).toHaveLength(1)
    expect(vm.workers[0]).toMatchObject({ label: 'late-name', agents: { total: 2, sonnet: 1, fable: 1 } })
  })

  test('the name comes from the result, then the meta of the script, then the input', () => {
    const s = fresh()
    onWorkflowLaunch(s, { toolUseId: 'a', input: { script: "export const meta = {\n  name: 'from-meta',\n  description: 'x' }\n" }, result: { status: 'async_launched', runId: 'wf_a' }, now: NOW })
    onWorkflowLaunch(s, { toolUseId: 'b', input: { name: 'from-input' }, result: { status: 'async_launched', runId: 'wf_b' }, now: NOW })
    onWorkflowLaunch(s, { toolUseId: 'c', input: { scriptPath: 'C:\\w\\flows\\nightly.js' }, result: { status: 'async_launched', runId: 'wf_c' }, now: NOW })
    onWorkflowLaunch(s, { toolUseId: 'd', input: {}, result: { status: 'async_launched', runId: 'wf_d' }, now: NOW })
    const labels = Object.fromEntries(vmOf(s).workers.map(w => [w.id, w.label]))
    expect(labels).toEqual({ wf_a: 'from-meta', wf_b: 'from-input', wf_c: 'nightly', wf_d: 'workflow' })
  })

  test('a denied, errored or remote launch', () => {
    const s = fresh()
    onWorkflowLaunch(s, { toolUseId: 'a', input: { name: 'x' }, result: { deny: 'budget is red' }, now: NOW })
    onWorkflowLaunch(s, { toolUseId: 'b', input: { name: 'y' }, result: { status: 'async_launched', runId: 'wf_b', error: 'boom' }, now: NOW })
    onWorkflowLaunch(s, { toolUseId: 'c', input: { name: 'z' }, result: { status: 'remote_launched', taskType: 'remote_agent', taskId: 't', sessionUrl: 'https://claude.ai/code/session_1' }, now: NOW })
    const by = Object.fromEntries(vmOf(s).workers.map(w => [w.label, w]))
    expect(by.x.status).toBe('denied')
    expect(by.y.status).toBe('failed')
    expect(by.z).toMatchObject({ kind: 'cloud', status: 'launched', url: 'https://claude.ai/code/session_1' })
  })

  test('in flight points show once a run-cost unit is known', () => {
    const s = fresh(20)
    run(s, { runId: 'wf_1', after: 24 })
    expect(budgetOf(s, NOW + HOUR).inFlight).toBe(0)
    onWorkflowLaunch(s, { toolUseId: 'b', input: {}, result: { status: 'async_launched', taskId: 'task2', runId: 'wf_2' }, now: NOW + HOUR })
    for (let i = 0; i < 4; i++) spawnWf(s, 'wf_2', i, 'sonnet', NOW + HOUR + MIN)
    const b = budgetOf(s, NOW + HOUR + 2 * MIN)
    expect(b.inFlight).toBeGreaterThan(1)
    expect(b.inFlight).toBeLessThan(4)
  })
})

describe('agents', () => {
  test('tool call, spawn and turn complete follow one agent from start to done', () => {
    const s = fresh()
    onAgentToolCall(s, { toolUseId: 'tu1', input: { description: 'review: auth', model: 'sonnet', effort: 'high', run_in_background: true }, now: NOW })
    expect(worker(s, 'tool:tu1')).toMatchObject({ kind: 'agent', label: 'review: auth', model: 'sonnet', effort: 'high', status: 'running', agents: null })
    onAgentSpawned(s, { toolUseId: 'tu1', input: { tool_use_id: 'tu1', description: 'review: auth', model: 'sonnet' }, result: { model: 'claude-sonnet-5-5', agentId: 'ag1' }, now: NOW + MIN })
    expect(vmOf(s).workers).toHaveLength(1)
    expect(worker(s, 'tool:tu1', NOW + MIN).model).toBe('claude-sonnet-5-5')
    onTurnComplete(s, { agentId: 'ag1', now: NOW + 5 * MIN, reason: 'answer' })
    expect(worker(s, 'tool:tu1', NOW + 5 * MIN)).toMatchObject({ status: 'done', endedAt: NOW + 5 * MIN })
  })

  test('an aborted turn fails the agent; a turn of the main loop changes nothing', () => {
    const s = fresh()
    onAgentSpawned(s, { toolUseId: 'tu1', input: { tool_use_id: 'tu1', description: 'x' }, result: { model: 'sonnet', agentId: 'ag1' }, now: NOW })
    onTurnComplete(s, { agentId: undefined, now: NOW + MIN, reason: 'answer' })
    expect(worker(s, 'ag1').status).toBe('running')
    onTurnComplete(s, { agentId: 'ag1', now: NOW + 2 * MIN, reason: 'aborted' })
    expect(worker(s, 'ag1', NOW + 2 * MIN).status).toBe('failed')
  })

  test('a workflow agent finishing does not finish the workflow', () => {
    const s = fresh()
    onWorkflowLaunch(s, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 't', runId: 'wf_1' }, now: NOW })
    spawnWf(s, 'wf_1', 0, 'sonnet', NOW + MIN, 'wa0')
    onTurnComplete(s, { agentId: 'wa0', now: NOW + 2 * MIN, reason: 'answer' })
    expect(worker(s, 'wf_1', NOW + 2 * MIN)).toMatchObject({ status: 'running', lastSeenAt: NOW + 2 * MIN })
  })

  test('a denied or errored Agent call, a foreground result and a remote launch', () => {
    const s = fresh()
    onAgentToolCall(s, { toolUseId: 'd', input: { description: 'denied one', model: 'fable' }, now: NOW })
    onAgentToolResult(s, { toolUseId: 'd', deny: 'budget red', now: NOW })
    onAgentToolCall(s, { toolUseId: 'e', input: { description: 'error one' }, now: NOW })
    onAgentToolResult(s, { toolUseId: 'e', isError: true, now: NOW })
    onAgentToolCall(s, { toolUseId: 'f', input: { description: 'foreground one', run_in_background: false }, now: NOW })
    onAgentToolResult(s, { toolUseId: 'f', result: { status: 'completed', agentId: 'af', resolvedModel: 'claude-opus-4-8' }, now: NOW + MIN })
    onAgentToolCall(s, { toolUseId: 'r', input: { description: 'remote one', isolation: 'remote' }, now: NOW })
    onAgentToolResult(s, { toolUseId: 'r', result: { status: 'remote_launched', taskId: 'rt', sessionUrl: 'https://claude.ai/code/session_r' }, now: NOW })
    onAgentToolCall(s, { toolUseId: 'b', input: { description: 'background one' }, now: NOW })
    onAgentToolResult(s, { toolUseId: 'b', result: { status: 'async_launched', agentId: 'ab', resolvedModel: 'claude-sonnet-5-5' }, now: NOW })
    const by = Object.fromEntries(vmOf(s, NOW + MIN).workers.map(w => [w.label, w]))
    expect(by['denied one'].status).toBe('denied')
    expect(by['error one'].status).toBe('failed')
    expect(by['foreground one']).toMatchObject({ status: 'done', model: 'claude-opus-4-8' })
    expect(by['remote one']).toMatchObject({ kind: 'cloud', status: 'launched', url: 'https://claude.ai/code/session_r' })
    expect(by['background one']).toMatchObject({ status: 'running', model: 'claude-sonnet-5-5' })
    onTaskNotification(s, '<task-id>ab</task-id><status>completed</status>', NOW + 3 * MIN)
    expect(worker(s, 'tool:b', NOW + 3 * MIN).status).toBe('done')
  })

  test('a spawn that was denied by another hook, and a spawn with no tool call before it', () => {
    const s = fresh()
    onAgentToolCall(s, { toolUseId: 'x', input: { description: 'refused' }, now: NOW })
    onAgentSpawned(s, { toolUseId: 'x', input: { tool_use_id: 'x', description: 'refused' }, result: { deny: 'no' }, now: NOW })
    expect(worker(s, 'tool:x').status).toBe('denied')
    onAgentSpawned(s, { toolUseId: 'y', input: { tool_use_id: 'y', description: 'teammate', isTeammate: true, model: 'opus' }, result: { model: 'opus', agentId: 'ay' }, now: NOW })
    expect(worker(s, 'ay')).toMatchObject({ label: 'teammate', status: 'running', model: 'opus' })
    spawnWf(s, 'wf_5', 0, 'sonnet')
    s.workers.find(w => w.id === 'wf_5').status = 'running'
    onAgentSpawned(s, { toolUseId: 'z', input: { workflow: { runId: 'wf_5', agentIndex: 1 } }, result: { deny: 'width' }, now: NOW })
    expect(worker(s, 'wf_5').agents.total).toBe(1)
  })

  test('a model name of another family counts as other, a missing model too', () => {
    const s = fresh()
    spawnWf(s, 'wf_1', 0, 'claude-haiku-4-5')
    onAgentSpawned(s, { toolUseId: 'q', input: { workflow: { runId: 'wf_1', agentIndex: 1 } }, result: { model: undefined, agentId: 'q' }, now: NOW })
    expect(worker(s, 'wf_1').agents).toMatchObject({ total: 2, other: 2 })
  })
})

describe('stalled', () => {
  test('a running agent with no news is flagged once and cleared when it is seen again', () => {
    const s = fresh()
    onAgentSpawned(s, { toolUseId: 'a', input: { tool_use_id: 'a', description: 'slow' }, result: { model: 'sonnet', agentId: 'ag1' }, now: NOW })
    expect(tick(s, NOW + 9 * MIN, 10)).toEqual([])
    expect(tick(s, NOW + 11 * MIN, 10)).toEqual(['ag1'])
    expect(tick(s, NOW + 12 * MIN, 10)).toEqual([])
    expect(worker(s, 'ag1', NOW + 12 * MIN).stalled).toBe(true)
    touch(s, 'ag1', NOW + 13 * MIN)
    expect(worker(s, 'ag1', NOW + 13 * MIN).stalled).toBe(false)
    expect(tick(s, NOW + 20 * MIN, 10)).toEqual([])
    expect(tick(s, NOW + 24 * MIN, 10)).toEqual(['ag1'])
  })

  test('the limit follows the option, and finished or cloud workers are never stalled', () => {
    const s = fresh()
    onAgentSpawned(s, { toolUseId: 'a', input: { tool_use_id: 'a', description: 'one' }, result: { model: 'sonnet', agentId: 'ag1' }, now: NOW })
    onAgentSpawned(s, { toolUseId: 'b', input: { tool_use_id: 'b', description: 'two' }, result: { model: 'sonnet', agentId: 'ag2' }, now: NOW })
    onTurnComplete(s, { agentId: 'ag2', now: NOW + MIN, reason: 'answer' })
    onShellCommand(s, { command: 'claude --cloud --model sonnet "fix it"', output: 'https://claude.ai/code/session_c1', isError: false, now: NOW })
    expect(tick(s, NOW + 4 * MIN, 5)).toEqual([])
    expect(tick(s, NOW + 6 * MIN, 5)).toEqual(['ag1'])
    expect(tick(s, NOW + 5 * HOUR, 30)).toEqual([])
    expect(vmOf(s, NOW + 5 * HOUR).workers.find(w => w.kind === 'cloud').status).toBe('launched')
  })

  test('a cloud session seen from somewhere can be stalled; one older than a day is closed', () => {
    const s = fresh()
    onShellCommand(s, { command: 'claude --cloud "x"', output: 'https://claude.ai/code/session_c2', isError: false, now: NOW })
    touch(s, 'https://claude.ai/code/session_c2', NOW + MIN)
    expect(tick(s, NOW + 20 * MIN, 10)).toEqual(['https://claude.ai/code/session_c2'])
    expect(tick(s, NOW + 25 * HOUR, 10)).toEqual([])
    expect(vmOf(s, NOW + 25 * HOUR).workers[0].status).toBe('done')
  })

  test('a workflow is alive while any of its agents is seen', () => {
    const s = fresh()
    onWorkflowLaunch(s, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 't', runId: 'wf_1' }, now: NOW })
    spawnWf(s, 'wf_1', 0, 'sonnet', NOW, 'wa0')
    touch(s, 'wa0', NOW + 8 * MIN)
    expect(tick(s, NOW + 15 * MIN, 10)).toEqual([])
    expect(tick(s, NOW + 19 * MIN, 10)).toEqual(['wf_1'])
  })
})

describe('shell commands', () => {
  const run = (s, command, output = '', extra = {}) => onShellCommand(s, { command, output, isError: false, now: NOW, ...extra })

  test('a cloud launch with claude: model, effort, label and the session url from the output', () => {
    const s = fresh()
    run(s, 'claude --model opus --effort high --cloud "Fix the flaky CI timeout in auth"', 'Session started: https://claude.ai/code/session_01ABC.\n')
    expect(vmOf(s).workers[0]).toMatchObject({
      kind: 'cloud', status: 'launched', model: 'opus', effort: 'high', url: 'https://claude.ai/code/session_01ABC', label: 'Fix the flaky CI timeout in auth',
    })
    run(s, 'claude --model=sonnet --cloud "other task" 2>&1', 'https://claude.ai/code/session_02')
    expect(vmOf(s).workers.map(w => w.model)).toEqual(['opus', 'sonnet'])
  })

  test('a cloud launch with launch.exp: the fourth argument is the model, the defaults are sonnet high', () => {
    const s = fresh()
    run(s, 'expect ~/.claude/skills/coordinator-method/launch.exp "ci-fix" rules.md /tmp/ci-fix.log opus xhigh', 'https://claude.ai/code/session_a1')
    run(s, 'expect C:\\Users\\me\\launch.exp docs-roadmap - /tmp/docs.log', 'https://claude.ai/code/session_a2')
    const [a, b] = vmOf(s).workers
    expect(a).toMatchObject({ model: 'opus', effort: 'xhigh', label: 'ci-fix' })
    expect(b).toMatchObject({ model: 'sonnet', effort: 'high', label: 'docs-roadmap' })
  })

  test('PowerShell and compound commands: the call operator, semicolons, bash -c, env prefix', () => {
    const s = fresh()
    run(s, "cd C:\\repo; & claude --cloud --model sonnet 'ps task'", 'https://claude.ai/code/session_p1')
    run(s, 'bash -lc "claude --cloud --model sonnet \'inner task\'"', 'https://claude.ai/code/session_p2')
    run(s, 'FOO=1 claude.exe --cloud "env task" && echo done', 'https://claude.ai/code/session_p3')
    expect(vmOf(s).workers.map(w => w.label)).toEqual(['ps task', 'inner task', 'env task'])
  })

  test('a cloud launch that was denied or failed, and one launched twice', () => {
    const s = fresh()
    run(s, 'claude --cloud --model fable "nope"', 'budget is red', { denied: true })
    run(s, 'claude --cloud "broken"', 'error: not logged in', { isError: true })
    run(s, 'claude --cloud "twice"', 'https://claude.ai/code/session_t')
    run(s, 'claude --cloud "twice"', 'https://claude.ai/code/session_t')
    expect(vmOf(s).workers.map(w => [w.label, w.status])).toEqual([['nope', 'denied'], ['broken', 'failed'], ['twice', 'launched']])
  })

  test('commands that only mention claude or launch.exp launch nothing', () => {
    const s = fresh()
    run(s, 'grep -r --cloud src', '')
    run(s, 'cat ~/.claude/skills/coordinator-method/launch.exp', '#!/usr/bin/expect')
    run(s, 'git log --oneline', '')
    expect(vmOf(s).workers).toEqual([])
  })

  test('text inside quotes, such as a pull request body or a commit message, is never read as a command', () => {
    const s = fresh()
    run(s, 'gh pr create --title "docs: no git push --force" --body "$(cat <<\'EOF\'\nNever run git push --force; use claude --cloud --model sonnet "x" && gh issue create --title a\nEOF\n)"', 'https://github.com/a/b/pull/3')
    run(s, 'git commit -m "explain git commit --amend and gh pr merge 9 --match-head-commit z"', '[feat-x 1234567] explain')
    const vm = vmOf(s)
    expect(vm.workers).toEqual([])
    expect(vm.flow.warnings).toEqual([])
    expect(vm.prs.map(p => p.number)).toEqual([3])
    expect(steps(vm).merged).toBe(false)
    expect(steps(vm).headPinned).toBe(false)
  })

  test('a pull request from creation to merge', () => {
    const s = fresh()
    run(s, 'gh pr create --title "feat(auth): add device flow" --body "x"', 'https://github.com/acme/app/pull/42\n')
    let vm = vmOf(s)
    expect(vm.prs[0]).toMatchObject({ number: 42, title: 'feat(auth): add device flow', state: 'open', url: 'https://github.com/acme/app/pull/42', draft: false })
    expect(vm.merge.pr).toBe(42)
    expect(stages(vm).pr).toBe('done')
    run(s, 'git fetch origin && git merge -m "chore: merge origin/main into feat" origin/main', 'Already up to date.')
    run(s, 'gh pr checks 42', 'build\tpass\t1m\nlint\tpass\t10s')
    run(s, 'gh pr merge 42 --merge --match-head-commit abc123 --subject "feat(auth): add device flow (#42)"', '✓ Merged pull request #42')
    vm = vmOf(s)
    expect(steps(vm)).toEqual({ realign: true, checks: true, headPinned: true, merged: true, ticketsClosed: false, roadmap: false, unblocked: false })
    expect(vm.prs[0].state).toBe('merged')
    expect(vm.decisions[0]).toMatchObject({ kind: 'merge', text: 'Merged #42', pending: false, ref: 42 })
    run(s, 'gh issue close 7 --comment "done in #42"', '✓ Closed issue #7')
    expect(steps(vmOf(s)).ticketsClosed).toBe(true)
  })

  test('failing or pending checks keep the step open; a merge that failed is not a merge', () => {
    const s = fresh()
    run(s, 'gh pr checks 42', 'build\tfail\t1m\nlint\tpass\t10s')
    expect(steps(vmOf(s)).checks).toBe(false)
    run(s, 'gh pr checks 42', 'build\tpending\t0\nlint\tpass\t10s')
    expect(steps(vmOf(s)).checks).toBe(false)
    run(s, 'gh pr checks 42', 'All checks were successful\n0 failing, 2 successful')
    expect(steps(vmOf(s)).checks).toBe(true)
    run(s, 'gh pr merge 42 --merge --match-head-commit abc', 'X Pull request #42 is not mergeable', { isError: true })
    const vm = vmOf(s)
    expect(steps(vm).merged).toBe(false)
    expect(steps(vm).headPinned).toBe(true)
    expect(vm.decisions).toEqual([])
    run(s, 'gh pr merge 42 --auto --merge', 'Auto-merge enabled')
    expect(steps(vmOf(s)).merged).toBe(false)
    run(s, 'gh pr merge 42 --merge --match-head-commit abc', 'Merged', { denied: true })
    expect(steps(vmOf(s)).merged).toBe(false)
  })

  test('a merge resets the round; the next merge starts with fresh steps and the next launch unblocks', () => {
    const s = fresh()
    run(s, 'gh run list --branch main --limit 5', 'completed success CI main')
    run(s, 'gh run view 99 --log-failed', 'ok')
    expect(items(vmOf(s)).mainCi).toBe(true)
    run(s, 'gh pr merge 42 --merge --match-head-commit abc', '✓ Merged')
    let vm = vmOf(s)
    expect(items(vm).mainCi).toBe(false)
    expect(vm.round.since).toBe(NOW)
    run(s, 'claude --cloud --model sonnet "next ticket"', 'https://claude.ai/code/session_n')
    expect(steps(vmOf(s)).unblocked).toBe(true)
    run(s, 'git merge origin/main', 'Merge made')
    vm = vmOf(s)
    expect(steps(vm)).toEqual({ realign: true, checks: false, headPinned: false, merged: false, ticketsClosed: false, roadmap: false, unblocked: false })
    expect(vm.merge.pr).toBe(null)
  })

  test('round items: one signal is probable, two distinct signals are done', () => {
    const s = fresh()
    run(s, 'gh pr list --state open', '#42 feat')
    expect(items(vmOf(s)).prsAndIssues).toBe('probable')
    run(s, 'gh pr list --state open', '#42 feat')
    expect(items(vmOf(s)).prsAndIssues).toBe('probable')
    run(s, 'gh issue list --label ready-for-agent', '#7 thing')
    expect(items(vmOf(s)).prsAndIssues).toBe(true)
    run(s, 'gh pr diff 42', 'diff --git')
    expect(items(vmOf(s)).diffReviewed).toBe('probable')
    run(s, 'gh pr view 42 --comments', 'comments')
    const vm = vmOf(s)
    expect(items(vm).diffReviewed).toBe(true)
    expect(items(vm).idleWorkers).toBe('probable')
    run(s, 'git diff origin/main...feature --stat', '1 file changed')
    expect(items(vmOf(s)).duplicates).toBe('probable')
    expect(vm.round.since).toBe(NOW)
  })

  test('warnings: issue without a milestone, force pushes, amend after a push, commit on main', () => {
    const s = fresh()
    run(s, 'gh issue create --title "x" --body "y" --label ready-for-agent', 'https://github.com/acme/app/issues/9')
    run(s, 'gh issue create --title "x" --milestone "v1"', 'https://github.com/acme/app/issues/10')
    run(s, 'git commit -m "wip"', '[feat-x 1a2b3c4] wip\n 1 file changed')
    run(s, 'git commit --amend --no-edit', '[feat-x 5d6e7f8] wip')
    expect(vmOf(s).flow.warnings.map(w => w.key)).toEqual(['milestone'])
    run(s, 'git push origin feat-x', 'To github.com:acme/app')
    run(s, 'git commit --amend --no-edit', '[feat-x 9a9a9a9] wip')
    run(s, 'git push --force origin feat-x', 'forced update')
    run(s, 'git push --force-with-lease origin feat-x', 'forced update')
    run(s, 'git push -f origin feat-x', 'forced update')
    run(s, 'git commit -m "on main"', '[main 0a0b0c0] on main')
    run(s, 'git commit -m "root"', '[master (root-commit) deadbee] root')
    const vm = vmOf(s)
    expect(vm.flow.warnings.map(w => w.key)).toEqual(['milestone', 'amend', 'force', 'forceLease', 'mainCommit'])
    expect(vm.flow.warnings.find(w => w.key === 'milestone').text).toContain('--milestone')
    expect(vm.decisions.filter(d => d.kind === 'warning')).toHaveLength(5)
    expect(vm.decisions.every(d => d.pending === false)).toBe(true)
  })

  test('the branch comes from git output when the commit prints none', () => {
    const s = fresh()
    run(s, 'git switch main', "Switched to branch 'main'")
    run(s, 'git commit -m "quiet"', '')
    expect(vmOf(s).flow.warnings.map(w => w.key)).toEqual(['mainCommit'])
    const t2 = fresh()
    run(t2, 'git status', 'On branch work\nnothing to commit')
    run(t2, 'git commit -m "quiet"', '')
    expect(vmOf(t2).flow.warnings).toEqual([])
  })

  test('a failed push is not a push and a denied command changes nothing', () => {
    const s = fresh()
    run(s, 'git push origin x', 'rejected', { isError: true })
    run(s, 'git commit --amend --no-edit', '[x 1234567] y')
    run(s, 'git push --force origin x', 'blocked', { denied: true })
    run(s, 'gh issue create --title t', 'blocked', { denied: true })
    expect(vmOf(s).flow.warnings).toEqual([])
  })

  test('the same warning in a burst is logged once', () => {
    const s = fresh()
    for (let i = 0; i < 4; i++) run(s, 'git push --force origin x', 'ok')
    expect(vmOf(s).decisions.filter(d => d.kind === 'warning')).toHaveLength(1)
  })

  test('the roadmap step is probable after an issue edit or a roadmap file write', () => {
    const s = fresh()
    onFileWrite(s, 'docs/ROADMAP.md', NOW)
    expect(steps(vmOf(s)).roadmap).toBe('probable')
    const u = fresh()
    run(u, 'gh issue edit 3 --body-file roadmap.md', 'ok')
    expect(steps(vmOf(u)).roadmap).toBe('probable')
  })

  test('odd input does not throw', () => {
    const s = fresh()
    for (const command of [undefined, null, '', '   ', '"', "gh 'unterminated", '& & &', ';;;', 'gh', 'git', 'gh pr', 'claude']) {
      onShellCommand(s, { command, output: undefined, isError: false, now: NOW })
    }
    expect(vmOf(s).workers).toEqual([])
  })
})

describe('pull requests', () => {
  const rollup = (...c) => c.map(x => ({ conclusion: x[0], status: x[1] || 'COMPLETED' }))

  test('the list becomes pull requests with checks', () => {
    const s = fresh()
    onPrList(s, JSON.stringify([
      { number: 5, title: 'green one', state: 'OPEN', url: 'https://github.com/a/b/pull/5', isDraft: false, mergeable: 'MERGEABLE', statusCheckRollup: rollup(['SUCCESS'], ['SKIPPED']) },
      { number: 6, title: 'red one', state: 'OPEN', url: 'https://github.com/a/b/pull/6', isDraft: true, mergeable: 'CONFLICTING', statusCheckRollup: rollup(['SUCCESS'], ['FAILURE']) },
      { number: 7, title: 'pending one', state: 'OPEN', url: null, isDraft: false, mergeable: 'UNKNOWN', statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: '' }] },
      { number: 8, title: 'no checks', state: 'OPEN', statusCheckRollup: [] },
      { number: 9, state: 'CLOSED', title: 'closed' },
    ]), NOW)
    const prs = vmOf(s).prs
    expect(prs.map(p => [p.number, p.checks, p.draft, p.state])).toEqual([[5, 'green', false, 'open'], [6, 'red', true, 'open'], [7, 'pending', false, 'open'], [8, 'none', false, 'open'], [9, 'none', false, 'closed']])
    expect(prs[1].mergeable).toBe('CONFLICTING')
    expect(prs[2].url).toBe(null)
  })

  test('a merged pull request stays after the poll no longer lists it; bad json is ignored', () => {
    const s = fresh()
    onShellCommand(s, { command: 'gh pr create --title "t"', output: 'https://github.com/a/b/pull/3', isError: false, now: NOW })
    onShellCommand(s, { command: 'gh pr merge 3 --merge --match-head-commit abc', output: 'Merged', isError: false, now: NOW })
    onPrList(s, JSON.stringify([{ number: 4, title: 'new', state: 'OPEN', statusCheckRollup: [] }]), NOW)
    expect(vmOf(s).prs.map(p => [p.number, p.state])).toEqual([[4, 'open'], [3, 'merged']])
    onPrList(s, 'not json', NOW)
    onPrList(s, '{"a":1}', NOW)
    onPrList(s, null, NOW)
    expect(vmOf(s).prs).toHaveLength(2)
  })

  test('the poll feeds the checks step of the pull request being merged', () => {
    const s = fresh()
    onShellCommand(s, { command: 'gh pr merge 5 --merge', output: '', isError: true, now: NOW })
    onPrList(s, [{ number: 5, title: 'x', state: 'OPEN', statusCheckRollup: rollup(['SUCCESS']) }], NOW)
    expect(steps(vmOf(s)).checks).toBe(true)
    onPrList(s, [{ number: 5, title: 'x', state: 'OPEN', statusCheckRollup: rollup(['FAILURE']) }], NOW)
    expect(steps(vmOf(s)).checks).toBe(false)
  })
})

describe('skill flow', () => {
  test('stages advance in order and the active one is current', () => {
    const s = fresh()
    expect(onSkill(s, { name: 'grill-with-docs', via: 'command', now: NOW })).toBe(true)
    let vm = vmOf(s)
    expect(stages(vm)).toEqual({ grill: 'active', spec: 'todo', tickets: 'todo', build: 'todo', review: 'todo', pr: 'todo' })
    expect(vm.flow.current).toBe('grill')
    onSkill(s, { name: 'to-prd', via: 'command', now: NOW + MIN })
    onSkill(s, { name: 'to-issues', via: 'command', now: NOW + 2 * MIN })
    onSkill(s, { name: 'implement', via: 'command', now: NOW + 3 * MIN })
    onSkill(s, { name: 'tdd', via: 'tool', now: NOW + 4 * MIN })
    vm = vmOf(s)
    expect(stages(vm)).toEqual({ grill: 'done', spec: 'done', tickets: 'done', build: 'active', review: 'todo', pr: 'todo' })
    onSkill(s, { name: 'code-review', via: 'tool', now: NOW + 5 * MIN })
    onSkill(s, { name: 'pr', via: 'tool', now: NOW + 6 * MIN })
    expect(vmOf(s).flow.current).toBe('pr')
    onShellCommand(s, { command: 'gh pr create --fill', output: 'https://github.com/a/b/pull/1', isError: false, now: NOW + 7 * MIN })
    vm = vmOf(s)
    expect(vm.flow.stages.every(x => x.state === 'done')).toBe(true)
    expect(vm.flow.current).toBe(null)
  })

  test('both sets of names, plugin prefixes and a slash are recognised by their tail', () => {
    for (const [name, stage] of [
      ['grill-me', 'grill'], ['grilling', 'grill'], ['domain-modeling', 'grill'], ['mattpocock-skills:grill-with-docs', 'grill'],
      ['to-spec', 'spec'], ['to-tickets', 'tickets'], ['/implement-spec', 'build'], ['plugin:tdd', 'build'], ['code-review', 'review'],
    ]) {
      const s = fresh()
      onSkill(s, { name, via: 'tool', now: NOW })
      expect(vmOf(s).flow.current, name).toBe(stage)
    }
  })

  test('side skills are listed newest first without duplicates and leave the stages alone', () => {
    const s = fresh()
    for (const [name, at] of [['triage', 1], ['diagnosing-bugs', 10], ['handoff', 20], ['triage', 30], ['wayfinder', 40], ['zoom-out', 50]]) onSkill(s, { name, via: 'command', now: NOW + at * MIN })
    const vm = vmOf(s)
    expect(vm.flow.side.map(x => x.key)).toEqual(['zoom-out', 'wayfinder', 'triage', 'handoff', 'diagnosing-bugs'])
    expect(vm.flow.stages.every(x => x.state === 'todo')).toBe(true)
  })

  test('the upstream entry point and the design skill show as side skills', () => {
    const s = fresh()
    expect(onSkill(s, { name: 'ask-matt', via: 'tool', now: NOW })).toBe(true)
    expect(onSkill(s, { name: 'mattpocock-skills:codebase-design', via: 'tool', now: NOW + MIN })).toBe(true)
    expect(vmOf(s).flow.side.map(x => x.key)).toEqual(['codebase-design', 'ask-matt'])
    expect(vmOf(s).flow.current).toBe(null)
  })

  test('the same skill seen twice in a moment (command and prompt) counts once; other skills are ignored', () => {
    const s = fresh()
    expect(onSkill(s, { name: 'grill-me', via: 'command', now: NOW })).toBe(true)
    expect(onSkill(s, { name: 'grill-me', via: 'prompt', now: NOW + 500 })).toBe(false)
    expect(onSkill(s, { name: 'model-mix', via: 'tool', now: NOW })).toBe(false)
    expect(onSkill(s, { name: '', via: 'tool', now: NOW })).toBe(false)
    expect(onSkill(s, { name: undefined, via: 'tool', now: NOW })).toBe(false)
    expect(vmOf(s).flow.side).toEqual([])
  })

  test('a skill that calls an earlier stage does not move the flow back; a new grill after a pr starts over', () => {
    const s = fresh()
    onSkill(s, { name: 'implement', via: 'command', now: NOW })
    onSkill(s, { name: 'code-review', via: 'tool', now: NOW + MIN })
    onSkill(s, { name: 'tdd', via: 'tool', now: NOW + 2 * MIN })
    expect(stages(vmOf(s))).toMatchObject({ build: 'done', review: 'active' })
    onSkill(s, { name: 'pr', via: 'tool', now: NOW + 3 * MIN })
    onShellCommand(s, { command: 'gh pr create --fill', output: 'https://github.com/a/b/pull/2', isError: false, now: NOW + 4 * MIN })
    onSkill(s, { name: 'grill-me', via: 'command', now: NOW + 10 * MIN })
    expect(stages(vmOf(s))).toEqual({ grill: 'active', spec: 'todo', tickets: 'todo', build: 'todo', review: 'todo', pr: 'todo' })
  })
})

describe('files', () => {
  const kinds = s => vmOf(s).flow.artifacts.map(a => [a.kind, a.label])

  test('the files the skills leave behind become artifacts, newest first, on both path styles', () => {
    const s = fresh()
    for (const path of [
      'C:\\repo\\CONTEXT.md', '/repo/GLOSSARY.md', '/repo/CONTEXT-MAP.md', 'docs/adr/0003-use-queues.md', '.scratch/device/issues/02-api.md',
      'C:\\repo\\.scratch\\device\\PRD.md', '.out-of-scope/dark-mode.md', 'C:\\Users\\me\\AppData\\Local\\Temp\\handoff-2026-10-07.md',
      '/tmp/architecture-review-123.html',
    ]) onFileWrite(s, path, NOW)
    expect(kinds(s).reverse()).toEqual([
      ['context', 'CONTEXT.md'], ['glossary', 'GLOSSARY.md'], ['map', 'CONTEXT-MAP.md'], ['adr', '0003-use-queues.md'], ['issue', '02-api.md'],
      ['prd', 'PRD.md'], ['outOfScope', 'dark-mode.md'], ['handoff', 'handoff-2026-10-07.md'], ['review', 'architecture-review-123.html'],
    ])
    expect(vmOf(s).flow.artifacts[0]).toEqual({ kind: 'review', label: 'architecture-review-123.html', path: '/tmp/architecture-review-123.html', url: null })
  })

  test('other files, odd names and repeats', () => {
    const s = fresh()
    for (const path of ['src/app.ts', 'README.md', 'docs/adr/notes.md', 'handoff.md', '/repo/.scratch/x/issues/readme.txt', '', undefined, null]) onFileWrite(s, path, NOW)
    expect(kinds(s)).toEqual([])
    onFileWrite(s, 'CONTEXT.md', NOW)
    onFileWrite(s, 'CONTEXT.md', NOW + MIN)
    expect(kinds(s)).toEqual([['context', 'CONTEXT.md']])
  })

  test('the list is capped', () => {
    const s = fresh()
    for (let i = 0; i < 50; i++) onFileWrite(s, 'docs/adr/' + String(1000 + i) + '-x.md', NOW + i)
    expect(vmOf(s).flow.artifacts).toHaveLength(30)
  })
})

describe('decisions, night and wakeups', () => {
  test('a question waits until it is answered; the text is the first question', () => {
    const s = fresh()
    onQuestion(s, { toolUseId: 'q1', input: { questions: [{ question: 'Merge #42 now?', header: 'Merge' }, { question: 'Second?' }] }, now: NOW })
    let d = vmOf(s).decisions[0]
    expect(d).toMatchObject({ kind: 'question', text: 'Merge #42 now? (+1)', pending: true })
    onQuestionAnswered(s, { toolUseId: 'q1', now: NOW + MIN })
    d = vmOf(s).decisions[0]
    expect(d.pending).toBe(false)
    onQuestion(s, { toolUseId: 'q2', input: {}, now: NOW })
    expect(vmOf(s).decisions[0].text).toBe('question')
  })

  test('a pending question that nobody answered stops waiting after half a day', () => {
    const s = fresh()
    onQuestion(s, { toolUseId: 'q1', input: { questions: [{ question: 'Hello?' }] }, now: NOW })
    tick(s, NOW + 13 * HOUR, 10)
    expect(vmOf(s, NOW + 13 * HOUR).decisions[0].pending).toBe(false)
  })

  test('decision texts follow the language', () => {
    const s = fresh()
    onShellCommand(s, { command: 'gh pr merge 42 --merge --match-head-commit a', output: 'ok', isError: false, now: NOW })
    onColorChange(s, { from: 'green', to: 'yellow', now: NOW + MIN })
    onShellCommand(s, { command: 'gh issue create --title x', output: '', isError: false, now: NOW + 2 * MIN })
    const en = vmOf(s, NOW + 3 * MIN, 'en').decisions.map(d => d.text)
    const it = vmOf(s, NOW + 3 * MIN, 'it').decisions.map(d => d.text)
    expect(en).toEqual(['Issue created without a milestone', 'Budget is now yellow', 'Merged #42'])
    expect(it[0]).toBe('Issue creata senza milestone')
    expect(it[1]).toContain('giallo')
    expect(it[2]).toContain('#42')
  })

  test('the list is capped and keeps what is still waiting', () => {
    const s = fresh()
    onQuestion(s, { toolUseId: 'keep', input: { questions: [{ question: 'keep me' }] }, now: NOW })
    for (let i = 0; i < 80; i++) onColorChange(s, { from: 'green', to: 'yellow', now: NOW + i })
    const all = s.decisions
    expect(all.length).toBeLessThanOrEqual(40)
    expect(all.some(d => d.id === 'q:keep' && d.pending)).toBe(true)
  })

  test('night mode counts the weekly points spent since it was turned on', () => {
    const s = fresh(20)
    setNight(s, true, NOW)
    expect(vmOf(s).night).toEqual({ on: true, since: NOW, nextWakeAt: null, pointsSince: 0 })
    onWake(s, { delaySeconds: 1200, now: NOW + MIN })
    onMeasure(s, { rateLimits: limits(23.5), now: NOW + 2 * MIN })
    let vm = vmOf(s, NOW + 2 * MIN)
    expect(vm.night.nextWakeAt).toBe(NOW + MIN + 1200000)
    expect(vm.night.pointsSince).toBe(3.5)
    onMeasure(s, { rateLimits: limits(2, 0, NOW + 2 * HOUR, 150), now: NOW + 2 * HOUR })
    vm = vmOf(s, NOW + 2 * HOUR)
    expect(vm.night.pointsSince).toBe(5.5)
    onWake(s, { stop: true, now: NOW + 2 * HOUR })
    expect(vmOf(s, NOW + 2 * HOUR).night.nextWakeAt).toBe(null)
    setNight(s, false, NOW + 3 * HOUR)
    expect(vmOf(s, NOW + 3 * HOUR).night).toEqual({ on: false, since: null, nextWakeAt: null, pointsSince: null })
  })

  test('night turned on before any reading starts counting at the first one; a past wakeup is dropped', () => {
    const s = createState()
    setNight(s, true, NOW)
    expect(vmOf(s).night.pointsSince).toBe(null)
    applyUsage(s, { rateLimits: limits(10), now: NOW + MIN, fresh: true })
    applyUsage(s, { rateLimits: limits(12), now: NOW + 2 * MIN, fresh: true })
    expect(vmOf(s, NOW + 2 * MIN).night.pointsSince).toBe(2)
    onWake(s, { delaySeconds: 60, now: NOW })
    onWake(s, { delaySeconds: 'soon', now: NOW })
    onWake(s, { delaySeconds: -5, now: NOW })
    tick(s, NOW + 10 * MIN, 10)
    expect(vmOf(s, NOW + 10 * MIN).night.nextWakeAt).toBe(null)
  })
})

describe('notifications', () => {
  test('nothing happens between two equal view models', () => {
    const s = fresh()
    const vm = vmOf(s)
    expect(notifications(vm, vm)).toEqual([])
    expect(notifications(null, vm)).toEqual([])
    expect(notifications(vm, null)).toEqual([])
  })

  test('a question toasts once when it starts waiting', () => {
    const s = fresh()
    const before = vmOf(s)
    onQuestion(s, { toolUseId: 'q1', input: { questions: [{ question: 'Merge #42 now?' }] }, now: NOW })
    const after = vmOf(s)
    const list = notifications(before, after)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'decision', key: 'decision:q:q1', text: 'Waiting for you: Merge #42 now?' })
    expect(notifications(after, after)).toEqual([])
    onQuestionAnswered(s, { toolUseId: 'q1', now: NOW + MIN })
    expect(notifications(after, vmOf(s))).toEqual([])
    expect(notifications(before, viewModel(s, null, 'it', NOW))[0]).toBeUndefined()
  })

  test('a merge toasts, in the language of the session', () => {
    const s = fresh()
    const before = vmOf(s, NOW, 'it')
    onShellCommand(s, { command: 'gh pr merge 42 --merge --match-head-commit a', output: 'ok', isError: false, now: NOW + MIN })
    const list = notifications(before, vmOf(s, NOW + MIN, 'it'))
    expect(list).toHaveLength(1)
    expect(list[0].kind).toBe('merge')
    expect(list[0].text).toContain('#42')
    expect(list[0].key).toMatch(/^merge:/)
  })

  test('a color change toasts; the first reading, a loss of it and no change do not', () => {
    const none = vmOf(createState())
    const green = vmOf(fresh(10))
    const red = vmOf(fresh(60))
    expect(notifications(none, green)).toEqual([])
    expect(notifications(green, none)).toEqual([])
    const list = notifications(green, red)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ kind: 'color', from: 'green', to: 'red', text: 'Budget is now red' })
    expect(notifications(green, green)).toEqual([])
    expect(notifications(green, red)[0].key).toBe(notifications(green, red)[0].key)
  })

  test('a stalled worker toasts once', () => {
    const s = fresh()
    onAgentSpawned(s, { toolUseId: 'a', input: { tool_use_id: 'a', description: 'slow worker' }, result: { model: 'sonnet', agentId: 'ag1' }, now: NOW })
    const before = vmOf(s, NOW + 5 * MIN)
    tick(s, NOW + 11 * MIN, 10)
    const after = vmOf(s, NOW + 11 * MIN)
    const list = notifications(before, after)
    expect(list).toEqual([{ kind: 'stalled', key: 'stalled:ag1', text: 'No news from slow worker' }])
    expect(notifications(after, vmOf(s, NOW + 12 * MIN))).toEqual([])
  })

  test('warnings and budget notes never toast', () => {
    const s = fresh()
    const before = vmOf(s)
    onShellCommand(s, { command: 'git push --force origin x', output: '', isError: false, now: NOW })
    onColorChange(s, { from: 'green', to: 'yellow', now: NOW })
    expect(notifications(before, vmOf(s))).toEqual([])
  })
})

describe('estimate', () => {
  test('no points until a run was measured, and the note says so', () => {
    const s = fresh(20)
    const r = estimateRun(s, budgetOf(s, NOW), { sonnet: 8, opus: 2 })
    expect(r.points).toBe(null)
    expect(r.fits).toBe(null)
    expect(r.samples).toBe(0)
    expect(r.unitPoints).toBe(null)
    expect(r.color).toBe('green')
    expect(r.note).toMatch(/no run-cost sample/)
  })

  test('with a sample the points follow the weights and fit means staying under the reserve', () => {
    const s = fresh(20)
    s.runCost.samples.push({ label: 'x', points: 4, weight: 8, agents: 8, at: NOW, plan: 'Max 20x' })
    const r = estimateRun(s, budgetOf(s, NOW), { sonnet: 8, opus: 2, fable: 1 })
    expect(r.unitPoints).toBe(0.5)
    expect(r.points).toBe(8.5)
    expect(r.fits).toBe(true)
    expect(near(r.margin, budgetOf(s, NOW).margin, 0.1)).toBe(true)
    const big = estimateRun(s, budgetOf(s, NOW), { sonnet: 200 })
    expect(big.points).toBe(100)
    expect(big.fits).toBe(false)
  })

  test('fit is false while the 5-hour window is paused or the color is red, unknown while the reading is stale', () => {
    const sample = { label: 'x', points: 4, weight: 8, agents: 8, at: NOW, plan: 'Max 20x' }
    const ok = fresh(20)
    ok.runCost.samples.push(sample)
    expect(estimateRun(ok, budgetOf(ok, NOW), { sonnet: 2 })).toMatchObject({ fits: true, paused: false, color: 'green' })

    const paused = fresh(20)
    paused.runCost.samples.push(sample)
    applyUsage(paused, { rateLimits: limits(20, 95), now: NOW + MIN, fresh: true })
    const p = estimateRun(paused, budgetOf(paused, NOW + MIN), { sonnet: 2 })
    expect(p).toMatchObject({ points: 1, fits: false, paused: true, color: 'green' })
    expect(p.note).toContain('5-hour window at 90% or more: paused until 16:00 UTC')

    const red = fresh(20)
    red.runCost.samples.push(sample)
    applyUsage(red, { rateLimits: limits(80), now: NOW + MIN, fresh: true })
    const r = estimateRun(red, budgetOf(red, NOW + MIN), { sonnet: 2 })
    expect(r).toMatchObject({ points: 1, fits: false, color: 'red' })
    expect(r.note).toContain('budget red: no new launches')

    const stale = fresh(20)
    stale.runCost.samples.push(sample)
    const st = estimateRun(stale, budgetOf(stale, NOW + 30 * MIN), { sonnet: 2 })
    expect(st).toMatchObject({ points: 1, fits: null, color: 'unknown' })
    expect(st.note).toContain('reading stale or missing: fit unknown')
  })

  test('samples that all measured 0 points are told apart from no sample at all', () => {
    const s = fresh(20)
    s.runCost.samples.push({ label: 'x', points: 0, weight: 8, agents: 8, at: NOW, plan: 'Max 20x' })
    const r = estimateRun(s, budgetOf(s, NOW), { sonnet: 2 })
    expect(r).toMatchObject({ points: null, fits: null, samples: 1 })
    expect(r.note).toContain('measured runs so far cost 0 weekly points')
    expect(r.note).not.toContain('no run-cost sample yet')
  })

  test('samples from another plan are left out of the unit, the in-flight points and the estimate', () => {
    const s = fresh(20)
    s.runCost.samples.push({ label: 'old', points: 4, weight: 8, agents: 8, at: NOW, plan: 'Max 5x' })
    s.runCost.samples.push({ label: 'legacy', points: 9, weight: 1, agents: 1, at: NOW })
    expect(vmOf(s).runCost).toMatchObject({ unitPoints: null, samples: 0 })
    expect(estimateRun(s, budgetOf(s, NOW), { sonnet: 8 })).toMatchObject({ points: null, samples: 0 })
    s.runCost.samples.push({ label: 'mine', points: 2, weight: 8, agents: 8, at: NOW, plan: 'Max 20x' })
    expect(vmOf(s).runCost).toMatchObject({ unitPoints: 0.25, samples: 1 })
    expect(estimateRun(s, budgetOf(s, NOW), { sonnet: 8 })).toMatchObject({ points: 2, samples: 1 })
    setPlan(s, parsePlanLine('Claude plan: Max 5x'))
    expect(vmOf(s).runCost.unitPoints).toBe(0.5)
  })

  test('a measured run is stamped with the plan it ran on', () => {
    const s = fresh(20)
    onWorkflowLaunch(s, { toolUseId: 'a', input: {}, result: { status: 'async_launched', taskId: 't', runId: 'wf_1' }, now: NOW })
    spawnWf(s, 'wf_1', 0, 'sonnet', NOW + MIN)
    onTaskNotification(s, '<task-id>t</task-id><status>completed</status>', NOW + 5 * MIN)
    onMeasure(s, { rateLimits: limits(22), now: NOW + 6 * MIN })
    expect(s.runCost.samples[0]).toMatchObject({ points: 2, plan: 'Max 20x' })
  })

  test('junk input counts as zero and a missing reading leaves fit open', () => {
    const s = createState()
    s.runCost.samples.push({ label: 'x', points: 4, weight: 8, agents: 8, at: NOW })
    const r = estimateRun(s, budgetOf(s, NOW), { sonnet: 'many', opus: -3, fable: NaN })
    expect(r.points).toBe(0)
    expect(estimateRun(s, budgetOf(s, NOW), { sonnet: 2 })).toMatchObject({ points: 1, fits: null, color: 'unknown' })
    expect(estimateRun(s, budgetOf(s, NOW), undefined).points).toBe(0)
  })
})

describe('persistence', () => {
  test('run cost and night survive a dump and a restore, through json', () => {
    const s = fresh(20)
    s.runCost.samples.push({ label: 'deep-review', points: 4, weight: 9, agents: 7, at: NOW, plan: 'Max 20x' })
    s.runCost.last = { label: 'deep-review', points: 4, agents: 7 }
    setNight(s, true, NOW)
    onWake(s, { delaySeconds: 600, now: NOW })
    const saved = JSON.parse(JSON.stringify(dump(s)))
    expect(Object.keys(saved).sort()).toEqual(['night', 'runCost'])
    const t2 = createState()
    restore(t2, saved, NOW + HOUR)
    setPlan(t2, parsePlanLine(PLAN))
    const vm = vmOf(t2, NOW + HOUR)
    expect(vm.runCost).toEqual({ unitPoints: 4 / 9, samples: 1, last: { label: 'deep-review', points: 4, agents: 7 } })
    expect(vm.night.on).toBe(true)
    expect(vm.night.since).toBe(NOW)
  })

  test('junk in the store is ignored, an old night is not resumed', () => {
    const s = createState()
    restore(s, undefined, NOW)
    restore(s, 'x', NOW)
    restore(s, { runCost: { samples: 'no' }, night: 3 }, NOW)
    restore(s, { runCost: { samples: [null, { points: 'a' }, { label: 'ok', points: 1, weight: 2, agents: 'x', at: NOW }, { label: 'zero', points: 1, weight: 0 }], last: { points: 'x' } }, night: { on: true, since: NOW - 20 * HOUR } }, NOW)
    const vm = vmOf(s)
    expect(vm.runCost.samples).toBe(1)
    expect(vm.runCost.last).toBe(null)
    expect(vm.night.on).toBe(false)
  })

  test('mergeRunCost folds in what another session stored: unique by time and label, the newest 20, sorted', () => {
    const s = createState()
    s.runCost.samples = [{ label: 'mine', points: 2, weight: 4, agents: 4, at: NOW + 2 * MIN, plan: null }]
    s.runCost.last = { label: 'mine', points: 2, agents: 4 }
    const stored = {
      samples: [
        { label: 'other', points: 3, weight: 6, agents: 6, at: NOW + MIN, plan: 'Max 20x' },
        { label: 'mine', points: 2, weight: 4, agents: 4, at: NOW + 2 * MIN },
        { label: 'junk', points: 'x', weight: 1 },
      ],
      last: { label: 'other', points: 3, agents: 6 },
    }
    const out = mergeRunCost(s, stored)
    expect(out.samples.map(x => x.label)).toEqual(['other', 'mine'])
    expect(s.runCost.samples).toEqual(out.samples)
    expect(out.last).toEqual({ label: 'mine', points: 2, agents: 4 })
    expect(mergeRunCost(createState(), undefined).samples).toEqual([])
    const many = createState()
    many.runCost.samples = Array.from({ length: 15 }, (_, i) => ({ label: 'm' + i, points: 1, weight: 1, agents: 1, at: NOW + i, plan: null }))
    const merged = mergeRunCost(many, { samples: Array.from({ length: 15 }, (_, i) => ({ label: 'o' + i, points: 1, weight: 1, agents: 1, at: NOW + 100 + i })), last: null })
    expect(merged.samples).toHaveLength(20)
    expect(merged.samples[19].label).toBe('o14')
  })

  test('only the last 20 samples count', () => {
    const s = createState()
    restore(s, { runCost: { samples: Array.from({ length: 30 }, (_, i) => ({ label: 's' + i, points: i < 10 ? 100 : 1, weight: 1, agents: 1, at: NOW })), last: null } }, NOW)
    expect(vmOf(s).runCost.samples).toBe(20)
    expect(vmOf(s).runCost.unitPoints).toBe(1)
    expect(dump(s).runCost.samples).toHaveLength(20)
  })
})

describe('limits', () => {
  test('at most 40 workers are kept and the running ones stay', () => {
    const s = fresh()
    onAgentToolCall(s, { toolUseId: 'first', input: { description: 'first, still running' }, now: NOW })
    for (let i = 0; i < 60; i++) {
      onAgentToolCall(s, { toolUseId: 'u' + i, input: { description: 'w' + i }, now: NOW + i })
      onAgentToolResult(s, { toolUseId: 'u' + i, result: { status: 'completed' }, now: NOW + i })
    }
    const vm = vmOf(s)
    expect(vm.workers.length).toBeLessThanOrEqual(40)
    expect(vm.workers.some(w => w.label === 'first, still running' && w.status === 'running')).toBe(true)
  })

  test('the index maps of a worker that was trimmed go with it', () => {
    const s = fresh()
    for (let i = 0; i < 120; i++) {
      onAgentToolCall(s, { toolUseId: 'u' + i, input: { description: 'w' + i }, now: NOW + i })
      onAgentToolResult(s, { toolUseId: 'u' + i, result: { status: 'async_launched', agentId: 'ag' + i }, now: NOW + i })
      onTurnComplete(s, { agentId: 'ag' + i, now: NOW + i, reason: 'answer' })
    }
    expect(s.workers.length).toBe(40)
    expect(Object.keys(s.toolUses).length).toBe(40)
    expect(Object.keys(s.agentIds).length).toBe(40)
    expect(Object.keys(s.tasks).length).toBe(40)
    const ids = new Set(s.workers.map(w => w.id))
    for (const m of [s.toolUses, s.agentIds, s.tasks]) for (const id of Object.values(m)) expect(ids.has(id)).toBe(true)
    const wf = fresh()
    for (let i = 0; i < 50; i++) {
      onWorkflowLaunch(wf, { toolUseId: 'w' + i, input: {}, result: { status: 'async_launched', taskId: 't' + i, runId: 'wf_' + i }, now: NOW + i })
      onTaskNotification(wf, '<task-id>t' + i + '</task-id><status>completed</status>', NOW + i)
      onMeasure(wf, { rateLimits: limits(20), now: NOW + i + 1 })
    }
    expect(Object.keys(wf.runs).length).toBe(40)
  })

  test('labels and control characters are cleaned', () => {
    const s = fresh()
    onAgentToolCall(s, { toolUseId: 'x', input: { description: 'a\nb\tc ' + 'z'.repeat(200) }, now: NOW })
    const label = vmOf(s).workers[0].label
    expect(label.startsWith('a b c z')).toBe(true)
    expect(Array.from(label).length).toBeLessThanOrEqual(80)
    expect(/[\u0000-\u001f]/.test(label)).toBe(false)
  })
})

// mods/model-guard/hooks/budget.js and mods/coordinator-lens/hooks/budget.js are one file kept in two mods:
// a mod cannot import outside its own folder, so neither test can read the other copy. Both mods' tests pin
// the same fingerprint instead: the source of every export, plus what the module computes for a fixed set of
// readings (which covers its private helpers and constants). After changing budget.js, copy it to the other
// mod and put the new fingerprint in both tests (the failure prints it).
describe('budget.js is the same file in model-guard and coordinator-lens', () => {
  const BUDGET_FINGERPRINT = '8183a090:15979'
  test('the fingerprint of budget.js matches the one pinned in both mods', () => {
    const at = Date.UTC(2026, 9, 7, 12, 0, 0)
    const h = 60 * 60 * 1000
    const limits = (weekly: number, five: number, weeklyHours = 100) => [
      { kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(at + weeklyHours * h).toISOString() },
      { kind: 'five_hour', percentUsed: five, resetsAt: new Date(at + 2 * h).toISOString() },
    ]
    const plan = budgetModule.parsePlanLine('Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22; 5-hour reset')
    const probes = [
      ...[[17, 10], [45, 10], [60, 10], [95, 10], [17, 92], [40, 10, 6], [40, 10, -1]].map(([w, f, wh]) =>
        [0, 10, 11].map(ageMin => budgetModule.computeBudget({ rateLimits: limits(w, f, wh), now: at, plan, inFlight: 3, readingAt: at - ageMin * 60 * 1000 }))),
      budgetModule.computeBudget({ rateLimits: [], now: at, plan: null, inFlight: 0 }),
      ['Max 20x', 'Max 5x', 'Pro', 'Solo', 'x'].map(n => budgetModule.stepDown(n)),
      budgetModule.estimatePoints({ haiku: 20, sonnet: 1, opus: 1, fable: 1, other: 1 }, 2),
      ['claude-haiku-5-5', 'sonnet', 'opus', 'claude-fable-5-1', 'x'].map(m => budgetModule.modelFamily(m)),
    ]
    const mod = budgetModule as Record<string, unknown>
    const text = Object.keys(mod).sort()
      .map(k => k + '=' + (typeof mod[k] === 'function' ? String(mod[k]) : JSON.stringify(mod[k])))
      .join('\n') + '\n' + JSON.stringify(probes)
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
    expect(hash.toString(16).padStart(8, '0') + ':' + text.length).toBe(BUDGET_FINGERPRINT)
  })
})
