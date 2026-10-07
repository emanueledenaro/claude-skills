// State and view model of coordinator-lens. Pure: no `$`. register.js feeds events in and draws what
// comes out. Every reducer changes the state it is given in place and returns it (or the thing it
// found); nothing here reads a clock, a file or the engine: `now` always comes in as an argument.
//
// What is real and what is a guess:
//   - workers: agents come from the Agent tool and agent.spawn; a workflow is counted by its agent.spawn
//     events (unique agentIndex per runId) and ends with a task notification; a cloud session is read
//     from the shell command that launched it. There is no event for a cloud session ending.
//   - merge steps and round items are read from shell commands the model ran: weak signals, so round
//     items need two distinct signals to count as done and one shows as 'probable'.
//   - run cost is a before/after difference of the account-wide weekly percent: other sessions are inside it.

import { computeBudget, estimatePoints, modelFamily, parsePlanLine } from './budget.js'
import { t, colorWord, has, normalizeLang } from './i18n.js'

const SECOND = 1000
const MIN = 60 * SECOND
const HOUR = 60 * MIN
const MAX_WORKERS = 40
const MAX_DECISIONS = 40
const MAX_ARTIFACTS = 30
const MAX_SAMPLES = 20
const NIGHT_MAX_AGE = 18 * HOUR
const CLOUD_MAX_AGE = 24 * HOUR
const QUESTION_MAX_AGE = 12 * HOUR
// budget.md's 10-minute rule, as budget.js applies it.
const READING_MAX_AGE = 10 * MIN

export const MERGE_STEPS = ['realign', 'checks', 'headPinned', 'merged', 'ticketsClosed', 'roadmap', 'unblocked']
export const ROUND_ITEMS = ['mainCi', 'prsAndIssues', 'idleWorkers', 'duplicates', 'diffReviewed']
export const STAGES = ['grill', 'spec', 'tickets', 'build', 'review', 'pr']

const STAGE_SKILLS = {
  grill: ['grill-me', 'grill-with-docs', 'grilling', 'domain-modeling'],
  spec: ['to-prd', 'to-spec'],
  tickets: ['to-issues', 'to-tickets'],
  build: ['implement', 'implement-spec', 'tdd'],
  review: ['code-review'],
  pr: ['pr'],
}
const SIDE_SKILLS = [
  'triage', 'diagnose', 'diagnosing-bugs', 'prototype', 'handoff', 'wayfinder', 'improve-codebase-architecture',
  'zoom-out', 'research', 'retro', 'setup-matt-pocock-skills', 'ask-matt', 'codebase-design',
]

// Signals that make a round item done; one signal shows it as 'probable'.
const ROUND_SIGNALS = {
  mainCi: ['run-list', 'run-view'],
  prsAndIssues: ['pr-list', 'issue-list'],
  idleWorkers: ['branches', 'comments'],
  duplicates: ['diff-main', 'log-main'],
  diffReviewed: ['pr-diff', 'pr-view'],
}

// ---------- small helpers ----------

function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x)
}

function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fit(s, n) {
  const g = Array.from(clean(s))
  if (g.length <= n) return g.join('')
  return n <= 1 ? '…' : g.slice(0, n - 1).join('') + '…'
}

function round1(x) {
  return Math.round(x * 10) / 10
}

function windowOf(rateLimits, kind) {
  const w = (Array.isArray(rateLimits) ? rateLimits : []).find(r => r && r.kind === kind)
  if (!w || !isNum(w.percentUsed)) return null
  const at = w.resetsAt ? Date.parse(w.resetsAt) : NaN
  return { used: w.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
}

function sameWindow(a, b) {
  return isNum(a) && isNum(b) && Math.abs(a - b) < 5 * MIN
}

function weeklyOf(state) {
  return windowOf(state.reading.rateLimits, 'seven_day')
}

function nextSeq(state) {
  state.seq += 1
  return state.seq
}

function preReading(state) {
  const wk = windowOf(state.reading.rateLimits, 'seven_day')
  const five = windowOf(state.reading.rateLimits, 'five_hour')
  return { weekly: wk ? wk.used : null, resetsAt: wk ? wk.resetsAt : null, five: five ? five.used : null }
}

function isActiveStatus(status) {
  return status === 'running' || status === 'launched'
}

// ---------- state ----------

export function createState() {
  return {
    seq: 0,
    plan: null,
    reading: { rateLimits: [], at: null, sig: '' },
    weeklyMark: null,
    redeemedKeys: [],
    // per redeemed key, how many entries of that key the plan line had when it was last seen
    redeemedHad: {},
    workers: [],
    runs: {},
    tasks: {},
    toolUses: {},
    agentIds: {},
    prs: [],
    prsAt: null,
    pendingShell: {},
    merge: { pr: null, steps: {} },
    round: { since: null, items: {}, signals: {} },
    flow: { stages: {}, side: [], artifacts: [], warnings: [], lastSkill: null },
    decisions: [],
    night: { on: false, since: null, nextWakeAt: null, pointsBase: null, baseResetsAt: null, carry: 0, pointsSince: null },
    runCost: { samples: [], last: null },
    git: { pushed: false, branch: null },
  }
}

export function setPlan(state, plan) {
  state.plan = plan && typeof plan === 'object' ? plan : null
  keepByPlan(state, state.redeemedKeys, state.redeemedHad)
  return state
}

function planCount(plan, key) {
  return plan.banked.filter(b => b && resetKey(b) === key).length
}

// Redeemed keys against the plan line now. A key matches by type and date only, so it remembers how many
// entries of its key the plan line had (`had`). Entries gone since then are taken as redeemed ones, since
// budget.md has the person remove the redeemed entry: that many keys go, and never more keys stay than
// the plan line has entries of that key. A key with no `had` (none stored) keeps the count it finds.
// Sets state.redeemedKeys and state.redeemedHad; with no plan line read, both stay as given.
function keepByPlan(state, keys, had) {
  const plan = state.plan
  const h = had && typeof had === 'object' ? had : {}
  if (!plan || !Array.isArray(plan.banked)) {
    state.redeemedKeys = keys
    state.redeemedHad = hadFor(keys, h)
    return
  }
  const counts = new Map()
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1)
  const left = new Map()
  const nextHad = {}
  for (const [k, r] of counts) {
    const c = planCount(plan, k)
    const before = isNum(h[k]) ? h[k] : c
    const keep = Math.min(c, Math.max(0, r - Math.max(0, before - c)))
    left.set(k, keep)
    if (keep > 0) nextHad[k] = c
  }
  state.redeemedKeys = keys.filter(k => {
    const n = left.get(k) || 0
    left.set(k, n - 1)
    return n > 0
  })
  state.redeemedHad = nextHad
}

function hadFor(keys, had) {
  const out = {}
  for (const k of keys) if (isNum(had[k]) && had[k] >= 0) out[k] = Math.floor(had[k])
  return out
}

// The plan line of the person's own CLAUDE.md (kind 'user'), as model-guard reads it. A project, local or
// memory file never sets the plan, the reserve or the banked resets: a cloned repository would decide them.
// `read` says whether a user file was there to read, so a missing line is told apart from no file at all.
export function userPlan(files) {
  const list = Array.isArray(files) ? files.filter(f => f && f.kind === 'user' && typeof f.content === 'string') : []
  for (const f of list) {
    const plan = parsePlanLine(f.content)
    if (plan) return { read: true, plan }
  }
  return { read: list.length > 0, plan: null }
}

// The plan line from the user CLAUDE.md among the instruction files `prompt.context` gives, else the option.
export function planFromContext(files, fallbackLine) {
  return userPlan(files).plan || planFromOption(fallbackLine)
}

export function planFromOption(line) {
  if (typeof line !== 'string' || !line.trim()) return null
  const text = line.trim()
  return parsePlanLine(/claude plan:/i.test(text) ? text : 'Claude plan: ' + text)
}

// ---------- usage and budget ----------

// `fresh` is true for a reading a response just reported (session.measure); a poll of $.session.usage()
// carries no timestamp, so its time only moves when the numbers do.
export function applyUsage(state, { rateLimits, now, fresh }) {
  if (!Array.isArray(rateLimits)) return state
  const known = rateLimits.filter(
    r => r && (r.kind === 'seven_day' || r.kind === 'five_hour') && isNum(r.percentUsed),
  )
  if (!known.length) return state
  const sig = known
    .map(r => r.kind + ':' + r.percentUsed + ':' + (r.resetsAt || ''))
    .sort()
    .join('|')
  const changed = sig !== state.reading.sig
  const wk = windowOf(known, 'seven_day')
  if (wk && wk.resetsAt && state.weeklyMark && sameWindow(state.weeklyMark.resetsAt, wk.resetsAt) && state.weeklyMark.used - wk.used > 2) {
    // Only a redemption lowers weekly use inside a window (budget.md): stop counting one banked reset
    // and drop every run-cost reading that straddles it.
    const gone = firstCountedWeekly(state, now)
    if (gone) {
      const key = resetKey(gone)
      state.redeemedKeys.push(key)
      if (state.plan && Array.isArray(state.plan.banked)) state.redeemedHad[key] = planCount(state.plan, key)
    }
    for (const w of state.workers) if (w.pre && isActiveOrAwaiting(w)) w.pre = null
  }
  if (wk) state.weeklyMark = { resetsAt: wk.resetsAt, used: wk.used }
  state.reading = {
    rateLimits: known.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    // A poll carries no timestamp: with no measured reading yet its age is unknown, so `at` stays null.
    at: fresh || (changed && state.reading.at != null) ? now : state.reading.at,
    sig,
  }
  updateNight(state)
  return state
}

function isActiveOrAwaiting(w) {
  return isActiveStatus(w.status) || w.awaiting != null
}

// A redeemed reset is recorded by what it is (type and expiry), not by how many: taking the entry out of
// the plan line later must not make a second, still valid reset stop counting.
function resetKey(b) {
  return b.type + ':' + (b.expires || '')
}

function effectivePlan(state) {
  const plan = state.plan
  const keys = state.redeemedKeys
  if (!plan || !keys.length || !Array.isArray(plan.banked)) return plan
  const left = keys.slice()
  const banked = plan.banked.filter(b => {
    const i = left.indexOf(resetKey(b))
    if (i < 0) return true
    left.splice(i, 1)
    return false
  })
  return { ...plan, banked }
}

// The weekly reset that expires first among those still counted: the one a redemption uses (budget.md).
// An expired entry is never redeemed; one with no date, or expiring today, still can be (budget.js bankedWeekly).
function firstCountedWeekly(state, now) {
  const plan = effectivePlan(state)
  if (!plan || !Array.isArray(plan.banked)) return null
  const today = isNum(now) ? new Date(now).toISOString().slice(0, 10) : ''
  const weekly = plan.banked
    .filter(b => b && b.type === 'weekly' && (!b.expires || b.expires >= today))
    .sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'))
  return weekly[0] || null
}

// Sonnet-weighted agents, the same weights as budget.js estimatePoints: Haiku 0.05, Opus 2, Fable 5.
function weight(agents) {
  const a = agents || {}
  return 0.05 * (a.haiku || 0) + (a.sonnet || 0) + 2 * (a.opus || 0) + 5 * (a.fable || 0) + (a.other || 0)
}

function noAgents() {
  return { total: 0, haiku: 0, sonnet: 0, opus: 0, fable: 0, other: 0 }
}

function workerAgents(w) {
  if (w.agents) return w.agents
  const fam = modelFamily(w.model)
  return { ...noAgents(), total: 1, [fam === 'haiku' || fam === 'sonnet' || fam === 'opus' || fam === 'fable' ? fam : 'sonnet']: 1 }
}

function planKey(state) {
  return (state.plan && state.plan.name) || null
}

// Run-cost samples count only on the plan they were taken on: weekly percent means something else on another plan.
function samplesFor(samples, plan) {
  return samples.filter(s => (s.plan || null) === (plan || null))
}

// A sample's points are the account-wide weekly step over the run, whole points at best and with any other
// use in the account in them: a run lighter than one Sonnet agent (a few Haiku agents) would turn that
// noise into its whole cost per agent, so it is no sample. The unit is total points over total weight, so
// a light run moves it by its share of the weight, not by its own ratio.
const MIN_SAMPLE_WEIGHT = 1

function unitSamples(samples, plan) {
  return samplesFor(samples, plan).filter(s => isNum(s.points) && isNum(s.weight) && s.weight >= MIN_SAMPLE_WEIGHT).slice(-MAX_SAMPLES)
}

function unitOf(samples, plan) {
  const xs = unitSamples(samples, plan)
  if (!xs.length) return null
  return xs.reduce((sum, s) => sum + s.points, 0) / xs.reduce((sum, s) => sum + s.weight, 0)
}

// Weekly points still to come from work that runs now: the run-cost unit times what has been seen of
// each workflow or cloud session, less what the weekly reading already shows since it started.
function inFlightPoints(state) {
  const unit = unitOf(state.runCost.samples, planKey(state))
  if (!(unit > 0)) return 0
  const wk = weeklyOf(state)
  let sum = 0
  for (const w of state.workers) {
    if (!isActiveStatus(w.status) || w.kind === 'agent') continue
    const projected = estimatePoints(workerAgents(w), unit) || 0
    const spent = wk && w.pre && isNum(w.pre.weekly) && sameWindow(w.pre.resetsAt, wk.resetsAt) ? Math.max(0, wk.used - w.pre.weekly) : 0
    sum += Math.max(0, projected - spent)
  }
  return sum
}

// budget.md's 10-minute rule is for launch decisions, so the budget itself keeps it: a reading older than
// that never loosens the guard, so a green one turns 'unknown' (reason 'stale-reading') and a red or yellow
// one keeps its color. That is what the model, budget_estimate and the toasts read. What the person sees is
// `shown`: the same budget worked out without the staleness cut, from the last known reading, only for a
// reading of known age that is older than 10 minutes (null otherwise: a fresh reading is the budget itself).
// A poll before any response has an unknown age (`lastReadingAt` null): it counts as old, so a green one is
// 'unknown' and a red or yellow one keeps its color, with no `shown`. The views draw the age from
// `lastReadingAt`, and the texts for the model say the reading is old, or of unknown age.
export function budgetOf(state, now) {
  const input = { rateLimits: state.reading.rateLimits, now, plan: effectivePlan(state), inFlight: inFlightPoints(state) }
  const at = state.reading.at
  // Windows of unknown age (a poll before any response) are stale; no windows at all is just no reading.
  const budget = computeBudget({ ...input, readingAt: at == null ? (input.rateLimits.length ? -Infinity : undefined) : at })
  let shown = null
  if (at != null && now - at > READING_MAX_AGE) {
    const last = computeBudget({ ...input, readingAt: undefined })
    if (last.color !== 'unknown') shown = last
  }
  return { ...budget, lastReadingAt: at, shown }
}

// ---------- workers ----------

// A run-cost sample keeps a name the model and every session can read: the worker's own, else its kind's
// English word.
function sampleLabel(w) {
  return w.label || t('en', 'label.' + w.kind)
}

function newWorker(state, o) {
  const w = {
    id: o.id,
    kind: o.kind,
    // no name of its own: '' here, and the view model puts the kind's word in the person's language
    label: fit(o.label || '', 80),
    model: o.model || null,
    effort: o.effort || null,
    status: o.status || 'running',
    startedAt: o.now,
    endedAt: null,
    agents: o.agents || null,
    url: o.url || null,
    points: null,
    lastSeenAt: o.kind === 'cloud' ? null : o.now,
    stalled: false,
    toolUseId: o.toolUseId || null,
    taskId: o.taskId || null,
    runId: o.runId || null,
    agentId: null,
    seen: null,
    pre: o.pre || null,
    awaiting: null,
    tokens: null,
    countMismatch: false,
  }
  state.workers.push(w)
  if (w.toolUseId) state.toolUses[w.toolUseId] = w.id
  if (w.taskId) state.tasks[w.taskId] = w.id
  if (w.runId) state.runs[w.runId] = w.id
  trimWorkers(state)
  return w
}

function trimWorkers(state) {
  while (state.workers.length > MAX_WORKERS) {
    const i = state.workers.findIndex(w => !isActiveStatus(w.status) && w.awaiting == null)
    if (i < 0) break
    const [gone] = state.workers.splice(i, 1)
    for (const m of [state.toolUses, state.tasks, state.agentIds, state.runs]) {
      for (const k of Object.keys(m)) if (m[k] === gone.id) delete m[k]
    }
  }
}

// A resumed workflow keeps its runId but starts over: measure it from a fresh reading and count its agents anew.
function restartRun(state, w, now, remote) {
  w.status = remote ? 'launched' : 'running'
  w.startedAt = now
  w.endedAt = null
  w.pre = preReading(state)
  w.points = null
  w.awaiting = null
  w.seen = {}
  w.agents = null
  w.tokens = null
  w.countMismatch = false
  w.stalled = false
  w.lastSeenAt = remote ? null : now
}

function workerById(state, id) {
  return id == null ? null : state.workers.find(w => w.id === id) || null
}

function workerByAgentId(state, agentId) {
  return agentId ? workerById(state, state.agentIds[agentId]) : null
}

function finish(w, status, now) {
  w.status = status
  w.endedAt = now
  w.stalled = false
}

function agentLabel(input) {
  return clean(input && (input.description || input.name || input.subagent_type || input.subagentType))
}

export function onAgentToolCall(state, { toolUseId, input, now }) {
  const inp = input || {}
  if (toolUseId && workerById(state, state.toolUses[toolUseId])) return state
  const remote = inp.isolation === 'remote'
  newWorker(state, {
    id: toolUseId ? 'tool:' + toolUseId : 'agent:' + nextSeq(state),
    kind: remote ? 'cloud' : 'agent',
    label: agentLabel(inp),
    model: typeof inp.model === 'string' ? inp.model : null,
    effort: typeof inp.effort === 'string' ? inp.effort : null,
    status: remote ? 'launched' : 'running',
    toolUseId,
    now,
    pre: remote ? preReading(state) : null,
  })
  return state
}

// The Agent tool's answer: `deny` when a hook refused the call, `result` the tool record otherwise.
export function onAgentToolResult(state, { toolUseId, result, deny, isError, now }) {
  const w = workerById(state, state.toolUses[toolUseId])
  if (!w) return state
  const res = result && typeof result === 'object' ? result : {}
  // An isolation 'remote' call can fall back to a local run (coordinator-method): its answer is then a
  // local one, so the worker becomes a local agent, running, measured as no cloud session.
  if (typeof deny !== 'string' && !isError && (res.status === 'async_launched' || res.status === 'completed') && w.kind === 'cloud' && w.status === 'launched') {
    w.kind = 'agent'
    w.status = 'running'
    w.pre = null
    w.lastSeenAt = now
    w.stalled = false
  }
  // The merge's "next work launched" step ticks only for a launch that was neither denied nor failed.
  if (typeof deny !== 'string' && !isError) launchedWork(state)
  if (typeof deny === 'string') finish(w, 'denied', now)
  else if (isError) finish(w, 'failed', now)
  else if (res.status === 'remote_launched') {
    w.kind = 'cloud'
    w.status = 'launched'
    w.lastSeenAt = null
    if (typeof res.sessionUrl === 'string') w.url = res.sessionUrl
    if (typeof res.taskId === 'string') {
      w.taskId = res.taskId
      state.tasks[res.taskId] = w.id
    }
  } else if (res.status === 'async_launched') {
    if (res.agentId) {
      w.agentId = res.agentId
      state.agentIds[res.agentId] = w.id
      if (typeof res.agentId === 'string') state.tasks[res.agentId] = w.id
    }
  } else if (res.status === 'completed') {
    if (res.agentId) state.agentIds[res.agentId] = w.id
    if (w.status === 'running') finish(w, 'done', now)
  }
  if (typeof res.resolvedModel === 'string' && res.resolvedModel) w.model = res.resolvedModel
  return state
}

function familyOf(model) {
  const f = modelFamily(model)
  return f === 'haiku' || f === 'sonnet' || f === 'opus' || f === 'fable' ? f : 'other'
}

// AgentSpawnInput + what next(e) answered. A workflow's agents are counted by unique agentIndex per runId.
export function onAgentSpawned(state, { toolUseId, input, result, now }) {
  const inp = input || {}
  const res = result && typeof result === 'object' ? result : {}
  const denied = typeof res.deny === 'string'
  const wf = inp.workflow && typeof inp.workflow === 'object' ? inp.workflow : null
  if (wf && wf.runId) {
    let w = workerById(state, state.runs[wf.runId])
    if (!w) {
      w = newWorker(state, { id: wf.runId, kind: 'workflow', label: '', now, runId: wf.runId, pre: preReading(state) })
      launchedWork(state)
    }
    if (denied) return state
    if (w.endedAt != null) restartRun(state, w, now, false)
    else if (w.status !== 'running') w.status = 'running'
    w.seen = w.seen || {}
    const idx = String(wf.agentIndex)
    if (!w.seen[idx]) {
      const fam = familyOf(res.model || inp.model || inp.parentModel)
      w.seen[idx] = fam
      w.agents = w.agents || noAgents()
      w.agents.total += 1
      w.agents[fam] = (w.agents[fam] || 0) + 1
    }
    if (res.agentId) {
      state.agentIds[res.agentId] = w.id
      w.agentId = w.agentId || res.agentId
    }
    w.lastSeenAt = now
    w.stalled = false
    return state
  }
  const id = toolUseId || inp.tool_use_id
  let w = workerById(state, state.toolUses[id])
  if (!w) {
    w = newWorker(state, {
      id: res.agentId || (id ? 'tool:' + id : 'agent:' + nextSeq(state)),
      kind: 'agent',
      label: agentLabel(inp),
      toolUseId: id,
      now,
    })
  }
  if (denied) {
    finish(w, 'denied', now)
    return state
  }
  w.model = res.model || inp.model || w.model
  if (res.agentId) {
    w.agentId = res.agentId
    state.agentIds[res.agentId] = w.id
    state.tasks[res.agentId] = w.id
  }
  w.lastSeenAt = now
  w.stalled = false
  return state
}

export function onTurnComplete(state, { agentId, now, reason }) {
  const w = workerByAgentId(state, agentId)
  if (!w) return state
  if (w.kind === 'workflow') return touch(state, agentId, now)
  if (w.status !== 'running') return state
  finish(w, reason === 'aborted' || reason === 'error' || reason === 'refusal' ? 'failed' : 'done', now)
  return state
}

// Something was seen from this agent (or worker id) at `now`: it is not stalled.
export function touch(state, agentId, now) {
  const w = workerByAgentId(state, agentId) || workerById(state, agentId)
  if (w && isActiveStatus(w.status)) {
    w.lastSeenAt = now
    w.stalled = false
  }
  return state
}

function scriptName(script) {
  if (typeof script !== 'string') return null
  const m = /\bmeta\b[^{]*\{[\s\S]*?\bname\s*:\s*(['"`])((?:(?!\1)[^\n])+)\1/.exec(script)
  return m ? clean(m[2]) : null
}

// `result` is the Workflow tool record, or { deny } when a hook refused the launch.
export function onWorkflowLaunch(state, { toolUseId, input, result, now }) {
  const inp = input || {}
  const res = result && typeof result === 'object' ? result : {}
  const denied = typeof res.deny === 'string'
  const path = typeof inp.scriptPath === 'string' ? inp.scriptPath.split(/[\\/]/).pop().replace(/\.\w+$/, '') : null
  const label = clean(res.workflowName || scriptName(inp.script) || inp.name || path)
  const remote = res.status === 'remote_launched' || res.taskType === 'remote_agent'
  let w = workerById(state, res.runId ? state.runs[res.runId] : null)
  let fresh = false
  if (!w) {
    w = newWorker(state, {
      id: res.runId || 'wf:' + (toolUseId || nextSeq(state)),
      kind: remote ? 'cloud' : 'workflow',
      label,
      toolUseId,
      taskId: res.taskId,
      runId: res.runId,
      status: remote ? 'launched' : 'running',
      url: remote && typeof res.sessionUrl === 'string' ? res.sessionUrl : null,
      now,
      pre: preReading(state),
    })
    fresh = true
  } else {
    if (!isActiveStatus(w.status) && !denied && !res.error) restartRun(state, w, now, remote)
    if (label) w.label = fit(label, 80)
    if (toolUseId) {
      w.toolUseId = toolUseId
      state.toolUses[toolUseId] = w.id
    }
    if (res.taskId) {
      w.taskId = res.taskId
      state.tasks[res.taskId] = w.id
    }
    if (remote) {
      w.kind = 'cloud'
      w.status = 'launched'
      w.lastSeenAt = null
      if (typeof res.sessionUrl === 'string') w.url = res.sessionUrl
    }
  }
  if (denied) finish(w, 'denied', now)
  else if (res.error) finish(w, 'failed', now)
  // A launch the hooks denied or the syntax check failed is no "next work launched".
  else if (fresh) launchedWork(state)
  return state
}

// <task-notification> text: <task-id>, <status>, <summary>, <agent_count>, <subagent_tokens>.
export function onTaskNotification(state, text, now) {
  const body = String(text == null ? '' : text)
  const get = tag => {
    const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i').exec(body)
    return m ? m[1].trim() : null
  }
  const taskId = get('task-id')
  const status = (get('status') || '').toLowerCase()
  const toolUseId = get('tool-use-id')
  const ok = status ? status === 'completed' || status === 'complete' || status === 'success' || status === 'done' : true
  if (taskId && settleShell(state, taskId, ok, now)) return null
  let w =
    (taskId && (workerById(state, state.tasks[taskId]) || workerById(state, state.agentIds[taskId]) || workerById(state, state.runs[taskId]) || workerById(state, taskId))) ||
    (toolUseId && workerById(state, state.toolUses[toolUseId])) ||
    null
  if (!w) w = state.workers.find(x => x.kind === 'cloud' && isActiveStatus(x.status) && x.url && body.includes(x.url)) || null
  if (!w) return null
  finish(w, ok ? 'done' : 'failed', now)
  const count = Number(get('agent_count'))
  if (Number.isFinite(count) && count > 0) {
    w.agents = w.agents || noAgents()
    if (count !== w.agents.total) w.countMismatch = true
    w.agents.total = Math.max(w.agents.total, count)
  }
  const tokens = Number(String(get('subagent_tokens') || '').replace(/[^\d.]/g, ''))
  if (Number.isFinite(tokens) && tokens > 0) w.tokens = tokens
  if (w.kind !== 'agent' && w.pre && isNum(w.pre.weekly)) w.awaiting = now
  return w
}

// After a response: runs that ended get their points from the weekly percent now minus the one at launch.
export function onMeasure(state, { rateLimits, now }) {
  applyUsage(state, { rateLimits, now, fresh: true })
  const wk = weeklyOf(state)
  for (const w of state.workers) {
    if (w.awaiting == null || now < w.awaiting) continue
    if (!w.pre || !isNum(w.pre.weekly)) {
      w.awaiting = null
      continue
    }
    if (!wk) continue
    w.awaiting = null
    if (!sameWindow(w.pre.resetsAt, wk.resetsAt)) continue
    w.points = round1(Math.max(0, wk.used - w.pre.weekly))
    const wt = weight(workerAgents(w))
    if (!w.countMismatch && wt >= MIN_SAMPLE_WEIGHT) {
      state.runCost.samples.push({ label: sampleLabel(w), points: w.points, weight: wt, agents: w.agents ? w.agents.total : 1, at: now, plan: planKey(state) })
      state.runCost.samples = state.runCost.samples.slice(-MAX_SAMPLES)
    }
    state.runCost.last = { label: sampleLabel(w), points: w.points, agents: w.agents ? w.agents.total : null }
  }
  return state
}

// Stalled: a running agent or workflow with nothing seen for `stalledMinutes`. A cloud session is only
// judged when something was seen from it. Returns the ids that became stalled now.
export function tick(state, now, stalledMinutes) {
  const limit = (isNum(Number(stalledMinutes)) && Number(stalledMinutes) > 0 ? Number(stalledMinutes) : 10) * MIN
  const fresh = []
  for (const w of state.workers) {
    if (!isActiveStatus(w.status)) continue
    if (w.kind === 'cloud' && now - w.startedAt > CLOUD_MAX_AGE) {
      finish(w, 'done', now)
      continue
    }
    if (isNum(w.lastSeenAt) && !w.stalled && now - w.lastSeenAt > limit) {
      w.stalled = true
      fresh.push(w.id)
    }
  }
  for (const d of state.decisions) if (d.pending && d.kind === 'question' && now - d.at > QUESTION_MAX_AGE) d.pending = false
  if (isNum(state.night.nextWakeAt) && now > state.night.nextWakeAt + 2 * MIN) state.night.nextWakeAt = null
  return fresh
}

// A new launch after a merge is the "next work launched" step.
function launchedWork(state) {
  if (state.merge.steps.merged === true && state.merge.steps.unblocked !== true) state.merge.steps.unblocked = true
}

// ---------- decisions ----------

export function addDecision(state, { kind, text, pending, ref, color, key, now, id }) {
  const d = {
    id: id || 'd' + nextSeq(state),
    at: now,
    kind,
    text: clean(text),
    pending: !!pending,
    ref: ref == null ? null : ref,
    color: color || null,
    key: key || null,
  }
  state.decisions.push(d)
  if (state.decisions.length > MAX_DECISIONS) {
    const i = state.decisions.findIndex(x => !x.pending)
    state.decisions.splice(i < 0 ? 0 : i, 1)
  }
  return d
}

export function onQuestion(state, { toolUseId, input, now }) {
  const qs = input && Array.isArray(input.questions) ? input.questions.filter(Boolean) : []
  const first = qs[0] ? clean(qs[0].question || qs[0].header) : ''
  const text = (first || 'question') + (qs.length > 1 ? ' (+' + (qs.length - 1) + ')' : '')
  return addDecision(state, { kind: 'question', text: fit(text, 200), pending: true, now, id: toolUseId ? 'q:' + toolUseId : undefined })
}

export function onQuestionAnswered(state, { toolUseId, now }) {
  const d = state.decisions.find(x => x.id === 'q:' + toolUseId)
  if (d) d.pending = false
  return state
}

// A budget color change, logged for the Decisions list (not pending: nobody has to answer).
export function onColorChange(state, { from, to, now }) {
  return addDecision(state, { kind: 'budget', text: from + ' -> ' + to, pending: false, color: to, now })
}

function addWarning(state, key, text, now) {
  const w = state.flow.warnings.find(x => x.key === key)
  if (w) {
    if (now - w.at < 5 * SECOND) return
    w.at = now
    w.count += 1
    w.text = text
  } else state.flow.warnings.push({ key, text, at: now, count: 1 })
  if (state.flow.warnings.length > 10) state.flow.warnings.shift()
  addDecision(state, { kind: 'warning', text, pending: false, key, now })
}

// ---------- night ----------

function updateNight(state) {
  const n = state.night
  if (!n.on) return
  const wk = weeklyOf(state)
  if (!wk) return
  if (n.pointsBase == null) {
    n.pointsBase = wk.used
    n.baseResetsAt = wk.resetsAt
    n.pointsSince = n.carry
    return
  }
  if (!sameWindow(n.baseResetsAt, wk.resetsAt)) {
    n.carry = isNum(n.pointsSince) ? n.pointsSince : n.carry
    n.pointsBase = 0
    n.baseResetsAt = wk.resetsAt
  }
  n.pointsSince = round1(n.carry + Math.max(0, wk.used - n.pointsBase))
}

export function setNight(state, on, now) {
  const n = state.night
  if (on) {
    const wk = weeklyOf(state)
    state.night = {
      on: true,
      since: now,
      nextWakeAt: n.nextWakeAt,
      pointsBase: wk ? wk.used : null,
      baseResetsAt: wk ? wk.resetsAt : null,
      carry: 0,
      pointsSince: wk ? 0 : null,
    }
  } else {
    state.night = { on: false, since: null, nextWakeAt: null, pointsBase: null, baseResetsAt: null, carry: 0, pointsSince: null }
  }
  return state
}

// The runtime clamps delaySeconds to [60, 3600], so the next wake is shown when it will happen.
export function onWake(state, { delaySeconds, stop, now }) {
  if (stop) state.night.nextWakeAt = null
  else if (isNum(delaySeconds) && delaySeconds > 0) state.night.nextWakeAt = now + Math.min(3600, Math.max(60, delaySeconds)) * SECOND
  return state
}

// ---------- shell commands ----------

const SHELLS = new Set(['bash', 'sh', 'zsh', 'wsl', 'powershell', 'pwsh', 'cmd'])

// Quote-aware split into commands (on && || ; | & and new lines) and words. A backslash is a path
// character except for \" inside double quotes. Outside quotes, a line continuation (bash `\` or
// PowerShell's backtick at the end of a line) joins the next line to the same command.
function splitCommand(command) {
  const s = String(command == null ? '' : command)
  const segs = []
  let cur = []
  let tok = ''
  let has = false
  let q = null
  const pushTok = () => {
    if (has) cur.push(tok)
    tok = ''
    has = false
  }
  const pushSeg = () => {
    pushTok()
    if (cur.length) segs.push(cur)
    cur = []
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (q === '"' && c === '\\' && s[i + 1] === '"') {
        tok += '"'
        i += 1
      } else tok += c
      continue
    }
    if ((c === '\\' || c === '`') && (s[i + 1] === '\n' || (s[i + 1] === '\r' && s[i + 2] === '\n'))) {
      pushTok()
      i += s[i + 1] === '\r' ? 2 : 1
    } else if (c === '"' || c === "'") {
      q = c
      has = true
    } else if (c === '&' || c === '|' || c === ';' || c === '\n' || c === '\r') pushSeg()
    else if (c === ' ' || c === '\t') pushTok()
    else {
      tok += c
      has = true
    }
  }
  pushSeg()
  return segs
}

function exeName(tok) {
  return String(tok || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.(exe|cmd|bat|ps1)$/i, '')
    .toLowerCase()
}

function stripPrefix(tokens) {
  let i = 0
  while (i < tokens.length && /^[A-Za-z_]\w*=/.test(tokens[i])) i += 1
  return tokens.slice(i)
}

function hasFlag(tokens, ...names) {
  return tokens.some(tok => names.some(n => tok === n || tok.startsWith(n + '=')))
}

function flagValue(tokens, ...names) {
  for (let i = 0; i < tokens.length; i++) {
    for (const n of names) {
      if (tokens[i] === n && i + 1 < tokens.length) return tokens[i + 1]
      if (tokens[i].startsWith(n + '=')) return tokens[i].slice(n.length + 1)
    }
  }
  return null
}

function prNumber(tokens) {
  for (const tok of tokens) {
    const url = /\/pull\/(\d+)/.exec(tok)
    if (url) return Number(url[1])
    if (/^#?\d+$/.test(tok)) return Number(tok.replace('#', ''))
  }
  return null
}

function prUrl(output) {
  const m = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/.exec(output)
  return m ? { url: m[0], number: Number(m[1]) } : null
}

function sessionUrl(output) {
  const m = /https:\/\/claude\.ai\/code\/[A-Za-z0-9_\-/.]*[A-Za-z0-9_\-/]/.exec(output)
  return m ? m[0] : null
}

// `background` is set when the command went on running in the background (run in the background, or
// moved there on its timeout): its id (backgroundTaskId), or true when it has none. Its outcome is not
// known yet, so a merge or a close in it waits for the task notification that settles it.
export function onShellCommand(state, { command, output, isError, now, denied, background }) {
  const out = typeof output === 'string' ? output.slice(0, 20000) : ''
  const bg = typeof background === 'string' && background ? background : background ? true : null
  const ctx = { out, isError: !!isError, denied: !!denied, now, background: bg }
  handleCommand(state, String(command == null ? '' : command), ctx, 0)
  return state
}

const MAX_PENDING_SHELL = 20

// A merge or close that runs in the background: kept by task id until its notification says how it ended.
// With no task id nothing can settle it, so it is left out.
function deferShell(state, ctx, tokens) {
  if (typeof ctx.background !== 'string') return
  const list = state.pendingShell[ctx.background] || (state.pendingShell[ctx.background] = [])
  list.push({ tokens: tokens.slice(0, 40), at: ctx.now })
  const ids = Object.keys(state.pendingShell)
  if (ids.length > MAX_PENDING_SHELL) delete state.pendingShell[ids[0]]
}

// The notification of a background command: a merge or close it held is recorded now, as it ended.
function settleShell(state, taskId, ok, now) {
  const list = state.pendingShell[taskId]
  if (!list) return false
  delete state.pendingShell[taskId]
  for (const p of list) ghCommand(state, p.tokens, { out: '', isError: !ok, denied: false, now, background: null })
  return true
}

function handleCommand(state, command, ctx, depth) {
  for (const raw of splitCommand(command)) handleTokens(state, stripPrefix(raw), ctx, depth)
}

function handleTokens(state, tokens, ctx, depth) {
  if (!tokens.length) return
  const exe = exeName(tokens[0])
  const script = launchScript(tokens, exe)
  if (script) {
    if (script.form !== 'ps1' || !isDryRunOrRefused(tokens, ctx)) cloudLaunch(state, tokens, script.form, script.at, ctx)
  } else if (exe === 'claude' && hasFlag(tokens, '--cloud')) {
    if (!isSteer(tokens)) cloudLaunch(state, tokens, 'claude', 0, ctx)
  } else if (exe === 'gh') ghCommand(state, tokens.slice(1), ctx)
  else if (exe === 'git') gitCommand(state, tokens.slice(1), ctx)
  else if (exe === 'wsl' && depth < 2 && !tokens.some(tok => /^(-c|-lc|-command|\/c)$/i.test(tok))) handleTokens(state, wslInner(tokens), ctx, depth + 1)
  else if (SHELLS.has(exe) && depth < 2) {
    const i = tokens.findIndex((tok, k) => k > 0 && /^(-c|-lc|-command|\/c)$/i.test(tok))
    if (i > 0 && tokens[i + 1]) handleCommand(state, innerCommand(exe, tokens, i), ctx, depth + 1)
  }
}

// The command a shell runs. `bash -c` takes one word (the rest are its $0, $1 ...); `cmd /c` and
// `powershell -Command` run everything after the flag, so an unquoted `cmd /c gh pr merge 12` is the
// whole `gh pr merge 12`. Words are joined back with the quotes a word with a space needs.
function innerCommand(exe, tokens, i) {
  if (exe !== 'cmd' && exe !== 'powershell' && exe !== 'pwsh') return tokens[i + 1]
  return tokens
    .slice(i + 1)
    .map(tok => (/[\s&|;]/.test(tok) && tokens.length > i + 2 ? '"' + tok.replace(/"/g, '\\"') + '"' : tok))
    .join(' ')
}

const EXP_RE = /launch\.exp$/i
const PS1_RE = /launch\.ps1$/i

// A launch script that runs, never one a command only names (sed, head, chmod, vim, grep ... on it):
// `expect launch.exp ...` (the script is expect's first word that is not a flag), `./launch.exp ...`,
// `powershell -File launch.ps1 ...`, `& launch.ps1 ...` or `.\launch.ps1 ...`. Returns { form, at } or null.
function launchScript(tokens, exe) {
  const first = tokens[0] === '.' ? 1 : 0
  if (EXP_RE.test(tokens[first] || '')) return { form: 'exp', at: first }
  if (PS1_RE.test(tokens[first] || '')) return { form: 'ps1', at: first }
  if (exe === 'expect') {
    const i = tokens.findIndex((tok, k) => k > 0 && !tok.startsWith('-'))
    return i > 0 && EXP_RE.test(tokens[i]) ? { form: 'exp', at: i } : null
  }
  if (exe === 'powershell' || exe === 'pwsh') {
    const i = tokens.findIndex((tok, k) => k > 0 && /^-f(ile)?$/i.test(tok))
    return i > 0 && PS1_RE.test(tokens[i + 1] || '') ? { form: 'ps1', at: i + 1 } : null
  }
  return null
}

// launch.ps1 -DryRun builds the prompt and launches nothing; with no terminal it stops before claude.
function isDryRunOrRefused(tokens, ctx) {
  return tokens.some(tok => /^-dryrun(:\$true)?$/i.test(tok)) || /needs a real terminal/i.test(ctx.out)
}

// `claude -p "<msg>" --cloud <session_id|url>` sends a message to a session that exists (cloud-worker):
// it starts nothing, and the session it names is left as it is.
function isSteer(tokens) {
  if (hasFlag(tokens, '-p', '--print')) return true
  const target = flagValue(tokens, '--cloud') || ''
  return /^session_[A-Za-z0-9]/.test(target) || /^https:\/\/claude\.ai\/code\//i.test(target)
}

// `wsl [-d distro] [-u user] [--cd dir] [-e|--exec|--] command ...`: the command after wsl's own flags.
function wslInner(tokens) {
  let i = 1
  while (i < tokens.length && tokens[i].startsWith('-')) {
    const flag = tokens[i].toLowerCase()
    if (flag === '-e' || flag === '--exec' || flag === '--') return tokens.slice(i + 1)
    i += /^(-d|--distribution|-u|--user|--cd)$/.test(flag) ? 2 : 1
  }
  return tokens.slice(i)
}

const CLOUD_VALUE_FLAGS = new Set(['--model', '--effort', '--permission-mode', '--name', '-n', '--settings', '--add-dir', '--max-turns', '--output-format'])

function cloudLaunch(state, tokens, form, at, ctx) {
  let model = null
  let effort = null
  let label = ''
  if (form === 'exp' || form === 'ps1') {
    const args = form === 'ps1' ? ps1Args(tokens.slice(at + 1)) : tokens.slice(at + 1)
    label = clean(String(args[0] || '').split(/[\\/]/).pop().replace(/\.\w+$/, ''))
    model = args[3] || 'sonnet'
    effort = args[4] || 'high'
  } else {
    model = flagValue(tokens, '--model')
    effort = flagValue(tokens, '--effort')
    for (let i = at + 1; i < tokens.length; i++) {
      const tok = tokens[i]
      if (CLOUD_VALUE_FLAGS.has(tok)) i += 1
      else if (!tok.startsWith('-')) {
        label = clean(tok)
        break
      }
    }
  }
  const url = sessionUrl(ctx.out)
  const status = ctx.denied ? 'denied' : ctx.isError && !url ? 'failed' : 'launched'
  const existing = url ? state.workers.find(w => w.url === url) : null
  if (existing) {
    existing.status = existing.status === 'running' ? 'launched' : existing.status
    return
  }
  const w = newWorker(state, {
    id: url || 'cloud:' + nextSeq(state),
    kind: 'cloud',
    label,
    model,
    effort,
    status,
    url,
    now: ctx.now,
    pre: preReading(state),
  })
  if (status !== 'launched') w.endedAt = ctx.now
  else launchedWork(state)
}

// launch.ps1's arguments in launch.exp's order: task, rules, log, model, effort, by position or by name.
const PS1_NAMED = { '-taskfile': 0, '-rulesfile': 1, '-logfile': 2, '-model': 3, '-effort': 4 }

function ps1Args(tokens) {
  const named = []
  const pos = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const low = tok.toLowerCase()
    if (low in PS1_NAMED) named[PS1_NAMED[low]] = tokens[++i]
    else if (/^-(ref|exe|exeargs)$/i.test(tok)) i += 1
    else if (!tok.startsWith('-')) pos.push(tok)
  }
  const out = []
  for (let k = 0; k < 5; k++) out[k] = named[k] != null ? named[k] : pos.shift()
  return out
}

function roundSignal(state, item, signal, now) {
  const signals = state.round.signals
  const set = signals[item] || (signals[item] = [])
  if (!set.includes(signal)) set.push(signal)
  state.round.items[item] = set.length >= 2 ? true : 'probable'
  if (state.round.since == null) state.round.since = now
}

// A step of the merge that follows a finished merge starts a new one.
function mergeCycle(state, pr, fresh) {
  const m = state.merge
  if (m.steps.merged === true && (fresh || (pr != null && pr !== m.pr))) state.merge = { pr: null, steps: {} }
  if (pr != null) state.merge.pr = pr
}

function upsertPr(state, p) {
  const i = state.prs.findIndex(x => x.number === p.number)
  if (i >= 0) state.prs[i] = { ...state.prs[i], ...p }
  else state.prs.unshift(p)
  if (state.prs.length > 30) state.prs.length = 30
}

function ghCommand(state, tokens, ctx) {
  const noun = (tokens[0] || '').toLowerCase()
  const verb = (tokens[1] || '').toLowerCase()
  const rest = tokens.slice(2)
  const { out, isError, denied, now } = ctx
  if (denied) return
  if (noun === 'pr' && verb === 'create') {
    if (isError) return
    const found = prUrl(out)
    mergeCycle(state, found ? found.number : null, true)
    if (found) {
      upsertPr(state, {
        number: found.number,
        title: clean(flagValue(rest, '--title', '-t') || '') || 'PR #' + found.number,
        state: 'open',
        checks: 'none',
        mergeable: null,
        url: found.url,
        draft: hasFlag(rest, '--draft', '-d'),
      })
    }
    state.flow.stages = completeStage(state.flow.stages, 'pr')
    return
  }
  if (noun === 'pr' && verb === 'checks') {
    const n = prNumber(rest)
    mergeCycle(state, n, false)
    // `gh pr checks` ends with "0 cancelled, 0 failing, 2 successful, 0 skipped, and 0 pending checks".
    const text = out.replace(/\b0\s+(cancelled|failing|failed|pending|skipped|queued)\b/gi, '')
    const failing = /\bfail(ed|ing|ure)?\b|\berror\b|✗/i.test(text)
    const waiting = /\bpending\b|\bin[_ ]progress\b|\bqueued\b|\bwaiting\b/i.test(text)
    const passing = /\bpass(ed|ing)?\b|successful|\bsuccess\b|✓/i.test(text)
    if (!failing && !waiting && passing) state.merge.steps.checks = true
    else if (failing || waiting) state.merge.steps.checks = false
    return
  }
  if (ctx.background && !isError && ((noun === 'pr' && verb === 'merge') || (noun === 'issue' && verb === 'close'))) {
    deferShell(state, ctx, tokens)
    return
  }
  if (noun === 'pr' && verb === 'merge') {
    const n = prNumber(rest)
    mergeCycle(state, n, false)
    if (hasFlag(rest, '--match-head-commit')) state.merge.steps.headPinned = true
    if (!isError && !hasFlag(rest, '--auto', '--disable-auto')) {
      const pr = n != null ? n : state.merge.pr
      state.merge.steps.merged = true
      if (pr != null) {
        state.merge.pr = pr
        upsertPr(state, { number: pr, title: (state.prs.find(p => p.number === pr) || {}).title || 'PR #' + pr, state: 'merged', checks: 'none', mergeable: null, url: (state.prs.find(p => p.number === pr) || {}).url || null, draft: false })
      }
      addDecision(state, { kind: 'merge', text: pr != null ? 'Merged #' + pr : 'Merged', pending: false, ref: pr, now })
      state.round = { since: now, items: {}, signals: {} }
    }
    return
  }
  if (noun === 'issue' && verb === 'close') {
    if (!isError) state.merge.steps.ticketsClosed = true
    return
  }
  if (noun === 'issue' && verb === 'edit') {
    if (!isError && state.merge.steps.roadmap !== true) state.merge.steps.roadmap = 'probable'
    return
  }
  if (noun === 'issue' && verb === 'create') {
    if (!isError && !hasFlag(rest, '--milestone', '-m')) {
      addWarning(state, 'milestone', 'gh issue create without --milestone (coordinator-method wants a milestone)', now)
    }
    return
  }
  if (noun === 'run') {
    if (verb === 'list') roundSignal(state, 'mainCi', 'run-list', now)
    else if (verb === 'view' || verb === 'watch') roundSignal(state, 'mainCi', 'run-view', now)
    return
  }
  if (noun === 'pr' && verb === 'list') {
    roundSignal(state, 'prsAndIssues', 'pr-list', now)
    if (hasFlag(rest, '--head')) roundSignal(state, 'idleWorkers', 'branches', now)
    return
  }
  if (noun === 'issue' && verb === 'list') {
    roundSignal(state, 'prsAndIssues', 'issue-list', now)
    return
  }
  if (noun === 'pr' && verb === 'diff') {
    roundSignal(state, 'diffReviewed', 'pr-diff', now)
    return
  }
  if (noun === 'pr' && verb === 'view') {
    roundSignal(state, 'diffReviewed', 'pr-view', now)
    if (hasFlag(rest, '--comments', '-c')) roundSignal(state, 'idleWorkers', 'comments', now)
    return
  }
  if (noun === 'issue' && verb === 'view' && hasFlag(rest, '--comments', '-c')) {
    roundSignal(state, 'idleWorkers', 'comments', now)
  }
}

function gitCommand(state, tokens, ctx) {
  let i = 0
  while (i < tokens.length && tokens[i].startsWith('-')) i += tokens[i] === '-C' || tokens[i] === '-c' ? 2 : 1
  const sub = (tokens[i] || '').toLowerCase()
  const rest = tokens.slice(i + 1)
  const { out, isError, denied, now } = ctx
  if (denied) return
  if (sub === 'merge' && rest.some(r => /(^|\/)origin\/(main|master)$/.test(r))) {
    if (!isError) {
      mergeCycle(state, null, true)
      state.merge.steps.realign = true
    }
    return
  }
  if (sub === 'push') {
    if (hasFlag(rest, '--force-with-lease')) addWarning(state, 'forceLease', 'git push --force-with-lease', now)
    else if (hasFlag(rest, '--force') || rest.some(r => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(r))) addWarning(state, 'force', 'git push --force', now)
    if (!isError) state.git.pushed = true
    return
  }
  if (sub === 'commit') {
    if (hasFlag(rest, '--amend')) {
      if (state.git.pushed) addWarning(state, 'amend', 'git commit --amend after a push', now)
      return
    }
    if (isError) return
    state.git.pushed = false
    const m = /^\[([^\s\]]+)(?: \(root-commit\))? [0-9a-f]{6,}\]/m.exec(out)
    const branch = m ? m[1] : state.git.branch
    if (m) state.git.branch = m[1]
    if (branch === 'main' || branch === 'master') addWarning(state, 'mainCommit', 'git commit on ' + branch, now)
    return
  }
  if (sub === 'checkout' || sub === 'switch') {
    const target = rest.filter(r => !r.startsWith('-')).pop()
    if (target && !isError) state.git.branch = target
    return
  }
  if (sub === 'branch') {
    if (hasFlag(rest, '--show-current') && /^[^\s]+$/.test(out.trim())) state.git.branch = out.trim()
    else if (hasFlag(rest, '-r', '--remotes', '-a', '--all')) roundSignal(state, 'idleWorkers', 'branches', now)
    return
  }
  if (sub === 'ls-remote') {
    roundSignal(state, 'idleWorkers', 'branches', now)
    return
  }
  if (sub === 'status') {
    const m = /^On branch (\S+)/m.exec(out)
    if (m) state.git.branch = m[1]
    return
  }
  if (sub === 'diff' && rest.some(r => /origin\/(main|master)/.test(r))) roundSignal(state, 'duplicates', 'diff-main', now)
  else if (sub === 'log' && rest.some(r => /origin\/(main|master)/.test(r))) roundSignal(state, 'duplicates', 'log-main', now)
}

// ---------- pull requests ----------

function checksOf(rollup) {
  if (!Array.isArray(rollup) || !rollup.length) return 'none'
  let pending = false
  for (const c of rollup) {
    if (!c) continue
    const state = String(c.conclusion || c.state || '').toUpperCase()
    const status = String(c.status || '').toUpperCase()
    if (['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(state)) return 'red'
    if ((status && status !== 'COMPLETED') || ['PENDING', 'EXPECTED', 'IN_PROGRESS', 'QUEUED'].includes(state)) pending = true
    else if (!['SUCCESS', 'NEUTRAL', 'SKIPPED', ''].includes(state)) pending = true
  }
  return pending ? 'pending' : 'green'
}

// `gh pr list --json number,title,state,url,isDraft,mergeable,statusCheckRollup` (text or parsed).
export function onPrList(state, json, now) {
  let list = json
  if (typeof json === 'string') {
    try {
      list = JSON.parse(json)
    } catch {
      return state
    }
  }
  if (!Array.isArray(list)) return state
  const polled = list
    .filter(p => p && isNum(p.number))
    .slice(0, 20)
    .map(p => ({
      number: p.number,
      title: fit(p.title, 120),
      state: String(p.state || 'OPEN').toLowerCase() === 'merged' ? 'merged' : String(p.state || 'OPEN').toLowerCase() === 'closed' ? 'closed' : 'open',
      checks: checksOf(p.statusCheckRollup),
      mergeable: typeof p.mergeable === 'string' ? p.mergeable : null,
      url: typeof p.url === 'string' ? p.url : null,
      draft: !!p.isDraft,
    }))
  const numbers = new Set(polled.map(p => p.number))
  const kept = state.prs.filter(p => !numbers.has(p.number) && p.state !== 'open').slice(0, 5)
  state.prs = [...polled, ...kept]
  // When the list was fetched: the views show old check colors as old.
  if (isNum(now)) state.prsAt = now
  const mp = state.merge.pr != null ? polled.find(p => p.number === state.merge.pr) : null
  if (mp && state.merge.steps.checks !== true && mp.checks === 'green') state.merge.steps.checks = true
  else if (mp && mp.checks === 'red') state.merge.steps.checks = false
  return state
}

// ---------- skills and files ----------

function tailName(name) {
  return String(name == null ? '' : name)
    .trim()
    .replace(/^\//, '')
    .split(':')
    .pop()
    .toLowerCase()
}

function stageOfSkill(tail) {
  for (const key of STAGES) if (STAGE_SKILLS[key].includes(tail)) return key
  return null
}

function completeStage(stages, key) {
  const next = { ...stages }
  for (const k of STAGES) if (next[k] === 'active') next[k] = 'done'
  next[key] = 'done'
  return next
}

function currentStage(stages) {
  return STAGES.find(k => stages[k] === 'active') || null
}

export function onSkill(state, { name, via, now }) {
  const tail = tailName(name)
  if (!tail) return false
  const stage = stageOfSkill(tail)
  const side = SIDE_SKILLS.includes(tail)
  if (!stage && !side) return false
  const last = state.flow.lastSkill
  if (last && last.tail === tail && now - last.at < 5 * SECOND) return false
  state.flow.lastSkill = { tail, at: now, via: via || null }
  if (side) {
    state.flow.side = [{ key: tail, at: now }, ...state.flow.side.filter(s => s.key !== tail)].slice(0, 10)
    return true
  }
  let stages = state.flow.stages
  const flowDone = stages.pr === 'done'
  if (flowDone && stage !== 'pr') stages = {}
  const active = currentStage(stages)
  // A skill that calls an earlier stage's skill (implement calls tdd) does not move the flow back.
  if (active && STAGES.indexOf(stage) < STAGES.indexOf(active)) return true
  const next = { ...stages }
  for (const k of STAGES) if (next[k] === 'active' && k !== stage) next[k] = 'done'
  next[stage] = 'active'
  state.flow.stages = next
  return true
}

function artifactOf(rawPath) {
  const path = String(rawPath || '').replace(/\\/g, '/')
  const base = path.split('/').pop()
  if (/(^|\/)CONTEXT\.md$/i.test(path) && !/-MAP\.md$/i.test(base)) return 'context'
  if (/(^|\/)GLOSSARY\.md$/i.test(path)) return 'glossary'
  if (/-MAP\.md$/i.test(base)) return 'map'
  if (/(^|\/)docs\/adr\/\d{4}-[^/]*\.md$/i.test(path)) return 'adr'
  if (/(^|\/)\.scratch\/.*\/issues\/[^/]*\.md$/i.test(path)) return 'issue'
  if (/(^|\/)\.scratch\/.*\/PRD\.md$/i.test(path)) return 'prd'
  if (/(^|\/)\.out-of-scope\/[^/]*\.md$/i.test(path)) return 'outOfScope'
  if (/(^|\/)architecture-review-[^/]*\.html$/i.test(path)) return 'review'
  if (/(^|\/)(temp|tmp)(\/|$)/i.test(path) && /handoff/i.test(base)) return 'handoff'
  return null
}

export function onFileWrite(state, path, now) {
  const p = String(path == null ? '' : path)
  if (!p) return state
  if (/roadmap/i.test(p) && state.merge.steps.roadmap !== true) state.merge.steps.roadmap = 'probable'
  const kind = artifactOf(p)
  if (!kind) return state
  const norm = p.replace(/\\/g, '/')
  const entry = { kind, label: norm.split('/').pop(), path: p, url: null, at: now }
  state.flow.artifacts = [entry, ...state.flow.artifacts.filter(a => a.path !== p)].slice(0, MAX_ARTIFACTS)
  return state
}

// ---------- view model ----------

function decisionText(d, lang) {
  if (d.kind === 'merge') return t(lang, 'toast.merge', { pr: d.ref != null ? '#' + d.ref : '' }).trim()
  if (d.kind === 'budget') return t(lang, 'toast.color', { color: colorWord(lang, d.color) })
  if (d.kind === 'warning' && d.key && has(lang, 'warning.' + d.key)) return t(lang, 'warning.' + d.key)
  return d.text
}

function doneOf(v) {
  return v === true ? true : v === 'probable' ? 'probable' : false
}

export function viewModel(state, budget, lang, now) {
  const l = normalizeLang(lang)
  const b = budget || budgetOf(state, now)
  const workers = state.workers.map(w => ({
    id: w.id,
    kind: w.kind,
    label: w.label || t(l, 'label.' + w.kind),
    // false when the label is the kind's word: the texts for the model then say it in English
    named: !!w.label,
    model: w.model,
    effort: w.effort,
    status: w.status,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    agents: w.agents ? { total: w.agents.total, haiku: w.agents.haiku || 0, sonnet: w.agents.sonnet, opus: w.agents.opus, fable: w.agents.fable, other: w.agents.other } : null,
    url: w.url,
    points: w.points,
    lastSeenAt: w.lastSeenAt,
    stalled: !!w.stalled && isActiveStatus(w.status),
  }))
  const stages = state.flow.stages
  return {
    lang: l,
    now,
    budget: b,
    workers,
    prs: state.prs.map(p => ({ ...p })),
    prsAt: state.prsAt,
    merge: {
      pr: state.merge.pr,
      steps: MERGE_STEPS.map(key => ({ key, done: doneOf(state.merge.steps[key]) })),
    },
    round: {
      since: state.round.since,
      items: ROUND_ITEMS.map(key => ({ key, done: doneOf(state.round.items[key]) })),
    },
    flow: {
      stages: STAGES.map(key => ({ key, state: stages[key] || 'todo' })),
      side: state.flow.side.map(s => ({ key: s.key, at: s.at })),
      current: currentStage(stages),
      artifacts: state.flow.artifacts.map(a => ({ kind: a.kind, label: a.label, path: a.path, url: a.url })),
      warnings: state.flow.warnings.map(w => ({ key: w.key, text: w.text })),
    },
    decisions: state.decisions
      .slice()
      .reverse()
      .slice(0, 20)
      .map(d => ({ id: d.id, at: d.at, kind: d.kind, text: decisionText(d, l), pending: d.pending, ref: d.ref })),
    night: {
      on: state.night.on,
      since: state.night.since,
      nextWakeAt: state.night.nextWakeAt,
      pointsSince: state.night.on ? state.night.pointsSince : null,
    },
    runCost: {
      unitPoints: unitOf(state.runCost.samples, planKey(state)),
      samples: unitSamples(state.runCost.samples, planKey(state)).length,
      last: state.runCost.last ? { label: state.runCost.last.label, points: state.runCost.last.points, agents: state.runCost.last.agents } : null,
    },
  }
}

// What deserves a toast between two view models: a decision waiting, a merge, a budget color change, a stalled worker.
export function notifications(prevVm, vm) {
  const out = []
  if (!vm) return out
  const lang = normalizeLang(vm.lang)
  const prevDecisions = prevVm && Array.isArray(prevVm.decisions) ? prevVm.decisions : []
  const prevPending = new Set(prevDecisions.filter(d => d.pending).map(d => d.id))
  const prevIds = new Set(prevDecisions.map(d => d.id))
  for (const d of vm.decisions || []) {
    if (d.pending && !prevPending.has(d.id)) {
      out.push({ kind: 'decision', key: 'decision:' + d.id, text: t(lang, 'toast.decision', { text: fit(d.text, 140) }) })
    }
    if (d.kind === 'merge' && !prevIds.has(d.id) && prevVm) {
      out.push({ kind: 'merge', key: 'merge:' + d.id, text: t(lang, 'toast.merge', { pr: d.ref != null ? '#' + d.ref : '' }).trim() })
    }
  }
  const known = c => c === 'green' || c === 'yellow' || c === 'red'
  const from = prevVm && prevVm.budget ? prevVm.budget.color : null
  const to = vm.budget ? vm.budget.color : null
  if (known(from) && known(to) && from !== to) {
    out.push({
      kind: 'color',
      key: 'color:' + from + '>' + to + ':' + Math.floor((vm.now || 0) / MIN),
      text: t(lang, 'toast.color', { color: colorWord(lang, to) }),
      from,
      to,
    })
  }
  const prevStalled = new Set(((prevVm && prevVm.workers) || []).filter(w => w.stalled).map(w => w.id))
  for (const w of vm.workers || []) {
    if (w.stalled && !prevStalled.has(w.id)) out.push({ kind: 'stalled', key: 'stalled:' + w.id, text: t(lang, 'toast.stalled', { label: fit(w.label, 60) }) })
  }
  return out
}

// ---------- the budget_estimate tool ----------

export function estimateRun(state, budget, input) {
  const inp = input && typeof input === 'object' ? input : {}
  const num = x => (isNum(x) && x >= 0 ? x : 0)
  const agents = { haiku: num(inp.haiku), sonnet: num(inp.sonnet), opus: num(inp.opus), fable: num(inp.fable), other: 0 }
  const plan = planKey(state)
  const unit = unitOf(state.runCost.samples, plan)
  const count = unitSamples(state.runCost.samples, plan).length
  const points = estimatePoints(agents, unit)
  const wk = budget && budget.weekly
  const reserve = budget && budget.plan && isNum(budget.plan.reserve) ? budget.plan.reserve : 0
  const color = budget ? budget.color : 'unknown'
  const paused = !!(budget && budget.pausedFiveHour)
  // budget.md: no launch while the 5-hour window is at 90% or more or while the color is red; the fit stays open on an
  // unknown color (no reading, or a green one older than 10 minutes; an old red or yellow one keeps its color).
  let fits = null
  if (points != null && wk && color !== 'unknown') {
    fits = !paused && color !== 'red' && wk.used + (budget.inFlight || 0) + points <= 100 - reserve
  }
  let note
  if (points == null) {
    note = count === 0
      ? 'no run-cost sample yet: run the first workflow at half the profile width and read the weekly percent before and after'
      : 'measured runs so far cost 0 weekly points (' + count + ' samples); estimate unavailable until a run moves the weekly percent'
  } else if (!wk) {
    note = 'points come from ' + count + ' measured runs (account-wide readings); the weekly reading is not available, so fit is unknown'
  } else if (color === 'unknown') {
    note = 'points come from ' + count + ' measured runs (account-wide readings); reading stale or missing: fit unknown'
  } else {
    note = 'points come from ' + count + ' measured runs (account-wide readings); fits means weekly use stays under ' + (100 - reserve) + '%'
  }
  if (paused) {
    const at = budget.fiveHour && isNum(budget.fiveHour.resetsAt) ? new Date(budget.fiveHour.resetsAt).toISOString().slice(11, 16) + ' UTC' : 'its reset'
    note += '; 5-hour window at 90% or more: paused until ' + at + ', no new launches'
  }
  if (color === 'red') note += '; budget red: no new launches'
  // budget.md also says never to push the 5-hour window past 100. Run-cost samples are weekly points only,
  // so `fits` does not project the 5-hour window: the note says so, with the window's reading.
  const five = budget && budget.fiveHour && isNum(budget.fiveHour.used) ? budget.fiveHour.used : null
  note += five == null
    ? '; the 5-hour window is not readable and not projected'
    : '; fits does not project the 5-hour window (now ' + Math.round(five) + '%): keep the run inside what is left of it'
  if (budget && budget.plan && budget.plan.known === false) note += '; plan assumed (no Claude plan line; Pro accounts use Pro)'
  return {
    points: points == null ? null : Math.round(points * 100) / 100,
    fits,
    color,
    paused,
    fiveHourUsed: five,
    margin: budget && isNum(budget.margin) ? Math.round(budget.margin * 10) / 10 : null,
    unitPoints: unit == null ? null : Math.round(unit * 1000) / 1000,
    samples: count,
    note,
  }
}

// ---------- persistence ($.store keeps runCost, night and redeemed, one key each) ----------

export function dump(state) {
  const n = state.night
  return {
    runCost: { samples: state.runCost.samples.slice(-MAX_SAMPLES), last: state.runCost.last },
    redeemed: dumpRedeemed(state),
    night: {
      on: n.on,
      since: n.since,
      nextWakeAt: n.nextWakeAt,
      pointsBase: n.pointsBase,
      baseResetsAt: n.baseResetsAt,
      carry: n.carry,
      pointsSince: n.pointsSince,
    },
  }
}

const numOrNull = x => (isNum(x) ? x : null)

function cleanSamples(list) {
  return (Array.isArray(list) ? list : [])
    .filter(x => x && isNum(x.points) && isNum(x.weight) && x.weight > 0)
    .map(x => ({ label: fit(x.label, 80), points: x.points, weight: x.weight, agents: numOrNull(x.agents), at: numOrNull(x.at), plan: typeof x.plan === 'string' && x.plan ? x.plan : null }))
}

// $.store is one file shared by every session: before writing the run cost, fold in what other sessions
// stored. Samples are unique by time and label; the newest 20 stay. Returns what to write.
export function mergeRunCost(state, stored) {
  const rc = stored && typeof stored === 'object' ? stored : {}
  const seen = new Set()
  const samples = [...cleanSamples(rc.samples), ...state.runCost.samples]
    .filter(s => {
      const k = s.at + '|' + s.label
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-MAX_SAMPLES)
  state.runCost.samples = samples
  return { samples, last: state.runCost.last || (rc.last && typeof rc.last === 'object' && isNum(rc.last.points) ? { label: fit(rc.last.label, 80), points: rc.last.points, agents: numOrNull(rc.last.agents) } : null) }
}

// Redeemed resets and the last weekly reading outlive a reload: a redeemed reset never counts again, and a
// redemption between a reading before the reload and one after it is still seen.
function dumpRedeemed(state) {
  const m = state.weeklyMark
  return { keys: state.redeemedKeys.slice(), had: hadFor(state.redeemedKeys, state.redeemedHad), mark: m && isNum(m.used) ? { resetsAt: numOrNull(m.resetsAt), used: m.used } : null }
}

const MAX_REDEEMED = 20

// A key is kept until its own expiry date has passed (an undated one until the plan line drops it).
function liveKeys(list, now) {
  const today = isNum(now) ? new Date(now).toISOString().slice(0, 10) : ''
  return (Array.isArray(list) ? list : [])
    .filter(k => typeof k === 'string' && /^(weekly|5-hour):(\d{4}-\d{2}-\d{2})?$/.test(k))
    .filter(k => {
      const date = k.slice(k.indexOf(':') + 1)
      return !date || !today || date >= today
    })
    .slice(-MAX_REDEEMED)
}

// Two lists of redeemed keys as one: each key as many times as the list that has it most (every session
// sees the same account-wide redemption, so two sessions that saw it count it once).
function unionKeys(a, b) {
  const count = list => list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map())
  const ca = count(a)
  const out = a.slice()
  for (const [k, n] of count(b)) for (let i = ca.get(k) || 0; i < n; i++) out.push(k)
  return out
}

// Two `had` maps as one: the larger count of each key, the plan line as it was before any entry went.
function maxHad(a, b) {
  const out = { ...(a && typeof a === 'object' ? a : {}) }
  for (const [k, n] of Object.entries(b && typeof b === 'object' ? b : {})) if (isNum(n) && !(isNum(out[k]) && out[k] >= n)) out[k] = n
  return out
}

function markOf(x) {
  return x && typeof x === 'object' && isNum(x.used) ? { resetsAt: numOrNull(x.resetsAt), used: x.used } : null
}

// $.store is one file shared by every session: fold in the keys other sessions stored before writing.
// Returns what to write; this session's own weekly reading stays its mark.
export function mergeRedeemed(state, stored, now) {
  const st = stored && typeof stored === 'object' ? stored : {}
  keepByPlan(state, liveKeys(unionKeys(liveKeys(state.redeemedKeys, now), liveKeys(st.keys, now)), now), maxHad(state.redeemedHad, st.had))
  const own = dumpRedeemed(state)
  return { keys: own.keys, had: own.had, mark: own.mark || markOf(st.mark) }
}

export function restore(state, saved, now) {
  const s = saved && typeof saved === 'object' ? saved : {}
  const red = s.redeemed && typeof s.redeemed === 'object' ? s.redeemed : null
  if (red) {
    keepByPlan(state, liveKeys(unionKeys(state.redeemedKeys, liveKeys(red.keys, now)), now), maxHad(state.redeemedHad, red.had))
    if (!state.weeklyMark) state.weeklyMark = markOf(red.mark)
  }
  const rc = s.runCost && typeof s.runCost === 'object' ? s.runCost : null
  if (rc && Array.isArray(rc.samples)) {
    state.runCost.samples = cleanSamples(rc.samples).slice(-MAX_SAMPLES)
    const last = rc.last
    state.runCost.last = last && typeof last === 'object' && isNum(last.points) ? { label: fit(last.label, 80), points: last.points, agents: numOrNull(last.agents) } : null
  }
  const n = s.night && typeof s.night === 'object' ? s.night : null
  if (n && n.on === true && isNum(n.since) && (!isNum(now) || now - n.since < NIGHT_MAX_AGE)) {
    state.night = {
      on: true,
      since: n.since,
      nextWakeAt: numOrNull(n.nextWakeAt),
      pointsBase: numOrNull(n.pointsBase),
      baseResetsAt: numOrNull(n.baseResetsAt),
      carry: isNum(n.carry) ? n.carry : 0,
      pointsSince: numOrNull(n.pointsSince),
    }
  }
  return state
}
