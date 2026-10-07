// model-guard: enforces model-mix on delegated launches (Agent, Workflow, RemoteTrigger,
// cloud and local headless sessions started from Bash, PowerShell or Monitor, and every spawned agent:
// workflow agents, forks, teammates, other plugins' spawns).
// The only module that touches `$`. Decisions live in rules.js, the budget maths in budget.js.
// It never calls a model and never reads credentials: the plan comes from the person's
// CLAUDE.md (prompt.context) or the planLine option, the usage from session.measure and
// $.session.usage(). Whether the haiku alias is Haiku 5.5 comes from $.session.version() and the
// provider variables ($.env.get), read only for Agent calls and spawned agents.
// The plan and each workflow run's width record live in $.state (types/index.d.ts), so a reload of this
// module keeps them; $.state itself starts over on /clear, /resume and /branch.

import { computeBudget } from './budget.js'
import {
  decideAgent, decideRemoteTrigger, decideShell, decideSpawn, decideWorkflow, decideWorkflowAgent,
  failureReason, fiveHourBanked, haikuAlias, planFromFiles, planFromOption, scanShell, statusText, texts,
} from './rules.js'

const RUNS = { plugin: 'model-guard', key: 'runs' } // one per runId: { admitted: number[], width, name? }
const PLAN = { plugin: 'model-guard', key: 'plan' } // the plan line read from CLAUDE.md

const config = { lang: 'it', redPolicy: 'deny', planLine: '' }
const memo = {
  plan: null,            // parsePlanLine result from CLAUDE.md (kept in PLAN too)
  planRead: false,       // PLAN already read from $.state by this module
  rateLimits: null,      // last reading, from session.measure or $.session.usage()
  readingAt: null,       // when that reading was last known to be fresh (budget.md: 10 minutes)
  unknownLogged: false,
  fableLogged: false,    // the Agent fable -> opus line already reached the transcript
  status: null,          // last status text sent; null = never sent
  version: null,         // $.session.version() answer, kept once read (the engine does not change under a module)
  clockAt: null,         // the last $.clock.now() answer, and the Date.now() it was read at (realAt)
  realAt: null,
}
// runId -> { admitted: Set of agentIndex, width, name }: this module's copy of RUNS (width fixed at the
// run's first agent or its resume), read and changed with no await between decision and count.
const runs = new Map()
const loggedRuns = new Set() // runId + ':' + line already in the transcript (later repeats go to debug)

async function nowOf($) {
  try {
    const t = await $.clock.now()
    if (typeof t === 'number' && Number.isFinite(t)) {
      memo.clockAt = t
      memo.realAt = Date.now()
      return t
    }
  } catch {}
  return Date.now()
}

// The time without a $ call (re-entry): the last $.clock.now() answer moved on by the real time since.
function nowFromMemo() {
  const real = Date.now()
  return typeof memo.clockAt === 'number' ? memo.clockAt + Math.max(0, real - memo.realAt) : real
}

function sameReading(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

// The plan line a previous load of this module read (prompt.context may not run again after a reload).
async function loadPlan($) {
  if (memo.plan || memo.planRead) return
  memo.planRead = true
  try {
    const { value } = await $.state.get(PLAN)
    if (!memo.plan && value && typeof value === 'object' && Array.isArray(value.banked)) memo.plan = value
  } catch {}
}

// The budget at decision time, from the last reading: $.session.usage() (free) or session.measure.
// usage() answers what the last API response reported and carries no time, so only a reading that
// changed counts as new; an unchanged one keeps the time a session.measure or a change last vouched for
// it. After 10 minutes (budget.md) computeBudget keeps a red or yellow color and turns only green into
// unknown: an old reading never loosens the guard.
// Returns { budget, fiveHourBanked }.
async function readBudget($) {
  const now = await nowOf($)
  try {
    const usage = await $.session.usage()
    if (usage && Array.isArray(usage.rateLimits) && usage.rateLimits.length) {
      if (memo.readingAt === null || !sameReading(usage.rateLimits, memo.rateLimits)) memo.readingAt = now
      memo.rateLimits = usage.rateLimits
    }
  } catch {}
  await loadPlan($)
  const plan = memo.plan || planFromOption(config.planLine)
  const budget = computeBudget({ rateLimits: Array.isArray(memo.rateLimits) ? memo.rateLimits : [], now, plan, inFlight: 0, readingAt: memo.readingAt })
  return { budget, fiveHourBanked: fiveHourBanked(plan, now) }
}

// Whether the haiku alias is Haiku 5.5 here (rules.haikuAlias): the engine's version, the variables that
// move Claude Code off the Anthropic API, and the one that remaps the alias. A read that fails counts as unknown: haiku is then not kept.
async function readHaiku($) {
  if (!memo.version) {
    try {
      const v = await $.session.version()
      if (v && typeof v === 'object') memo.version = v
    } catch {}
  }
  let env = null
  try {
    env = {
      CLAUDE_CODE_USE_BEDROCK: await $.env.get('CLAUDE_CODE_USE_BEDROCK'),
      CLAUDE_CODE_USE_VERTEX: await $.env.get('CLAUDE_CODE_USE_VERTEX'),
      CLAUDE_CODE_USE_FOUNDRY: await $.env.get('CLAUDE_CODE_USE_FOUNDRY'),
      CLAUDE_CODE_USE_ANTHROPIC_AWS: await $.env.get('CLAUDE_CODE_USE_ANTHROPIC_AWS'),
      CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD: await $.env.get('CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD'),
      CLAUDE_CODE_USE_MANTLE: await $.env.get('CLAUDE_CODE_USE_MANTLE'),
      CLAUDE_CODE_USE_GATEWAY: await $.env.get('CLAUDE_CODE_USE_GATEWAY'),
      ANTHROPIC_BASE_URL: await $.env.get('ANTHROPIC_BASE_URL'),
      ANTHROPIC_DEFAULT_HAIKU_MODEL: await $.env.get('ANTHROPIC_DEFAULT_HAIKU_MODEL'),
    }
  } catch {}
  return haikuAlias(memo.version, env)
}

function syncStatus($, budget) {
  const text = statusText(budget, config.redPolicy, config.lang)
  if (text === memo.status) return
  try {
    $.ui.status(text)
    memo.status = text
  } catch {}
}

async function contextOf($) {
  const { budget, fiveHourBanked: banked } = await readBudget($)
  syncStatus($, budget)
  if (budget.color !== 'unknown') memo.unknownLogged = false
  return {
    budget,
    redPolicy: config.redPolicy,
    lang: config.lang,
    unknownLogged: memo.unknownLogged,
    fableLogged: memo.fableLogged,
    fiveHourBanked: banked,
  }
}

function report($, decision) {
  if (decision.unknownNoted) memo.unknownLogged = true
  if (decision.fableNoted) memo.fableLogged = true
  if (!decision.log) return
  try {
    $.ui.log(decision.log, { to: decision.to === 'debug' ? 'debug' : 'transcript' })
  } catch {}
}

function refuse($, e, next) {
  const kind = next.error ? next.error.kind : 'error'
  try {
    $.ui.log(texts(config.lang).failed, { to: 'transcript' })
    $.ui.log('model-guard: check failed: ' + kind + (next.error && next.error.message ? ' (' + next.error.message + ')' : ''), { to: 'debug' })
  } catch {}
  return { deny: failureReason(kind) }
}

// ---------------------------------------------------------------- workflow runs ($.state RUNS)

// Reads a run's record from $.state into `runs` when this module does not hold it (after a reload).
async function loadRun($, runId) {
  if (!runId || runs.has(runId)) return
  let value
  try {
    value = (await $.state.get({ ...RUNS, id: runId })).value
  } catch {}
  if (runs.has(runId)) return // a parallel spawn of the run loaded or started it meanwhile
  if (value && Array.isArray(value.admitted) && typeof value.width === 'number' && Number.isFinite(value.width)) {
    runs.set(runId, {
      admitted: new Set(value.admitted.filter(i => typeof i === 'number')),
      width: value.width,
      name: typeof value.name === 'string' ? value.name : undefined,
    })
  }
}

async function saveRun($, runId) {
  const run = runs.get(runId)
  if (!runId || !run) return
  const value = { admitted: [...run.admitted], width: run.width }
  if (typeof run.name === 'string') value.name = run.name
  try {
    await $.state.set({ ...RUNS, id: runId }, value)
  } catch {}
}

// Applies a decideWorkflowAgent decision to `runs`, synchronously. Returns whether the record changed.
function applyRun(runId, e, decision) {
  let changed = false
  if (decision.startRun && !runs.has(runId)) {
    runs.set(runId, { admitted: new Set(), ...decision.startRun })
    changed = true
  }
  if (decision.admit && runs.has(runId) && !runs.get(runId).admitted.has(e.workflow.agentIndex)) {
    runs.get(runId).admitted.add(e.workflow.agentIndex)
    changed = true
  }
  return changed
}

// ---------------------------------------------------------------- failure and re-entry

// The check when an event rises beneath one of model-guard's own $ calls (another plugin's hook raising
// it there): the host does not run the hook, and its $ calls reject. The same rules run here from memo
// alone: the last reading, the plan, the engine version and the runs held in memory, with nowFromMemo()
// for the time, no $ call and no line logged. What is unread counts against the launch: the
// environment is not read, so the haiku alias is not Haiku 5.5; a launch with no valid reading
// (unknownNoted) is refused, not passed with a note; and anything that throws refuses.
function reentryDecision(e) {
  const now = nowFromMemo()
  const plan = memo.plan || planFromOption(config.planLine)
  const budget = computeBudget({ rateLimits: Array.isArray(memo.rateLimits) ? memo.rateLimits : [], now, plan, inFlight: 0, readingAt: memo.readingAt })
  const ctx = {
    budget, redPolicy: config.redPolicy, lang: config.lang, unknownLogged: false, fableLogged: true,
    fiveHourBanked: fiveHourBanked(plan, now), haiku: haikuAlias(memo.version, null),
  }
  if (typeof e.tool !== 'string') {
    if (!e.workflow) return decideSpawn(e, ctx)
    const runId = typeof e.workflow.runId === 'string' ? e.workflow.runId : ''
    const d = decideWorkflowAgent(e, ctx, runs.get(runId))
    applyRun(runId, e, d) // in memory; the run's next spawn saves it
    return d
  }
  if (e.tool === 'Agent') return decideAgent(e, ctx)
  if (e.tool === 'Workflow') return decideWorkflow(e, ctx)
  if (e.tool === 'RemoteTrigger') return decideRemoteTrigger(e, ctx)
  if (e.tool === 'Monitor' && (e.command === undefined || e.command === null)) return { action: 'allow' }
  if (e.tool === 'Bash' || e.tool === 'PowerShell' || e.tool === 'Monitor') return decideShell(e, ctx, scanShell(e.command))
  return { action: 'deny', reason: failureReason('re-entry') }
}

function reentryRewriteReason(d) {
  return `model-guard checked this call where it cannot change it (it was raised inside model-guard's own check), so it was not run. Run it again with this change: ${d.reason}`
}

// The .catch every guard shares: re-entry runs the check from memo (reentryDecision), a hook that
// already called next keeps what next settled to, anything else refuses with the event's own deny.
async function guardFailed($, e, next) {
  if (next.error && next.error.kind === 're-entry') {
    let d
    try {
      d = reentryDecision(e)
    } catch {
      return { deny: failureReason('re-entry') }
    }
    if (d.action === 'deny') return { deny: d.reason }
    if (d.unknownNoted) {
      return { deny: 'model-guard checked this launch where it cannot read the budget (it was raised inside model-guard\'s own check) and has no current reading, so it was not run. Run it again.' }
    }
    // Beneath its own frame next runs on the call as raised, so a rewrite cannot be applied: refuse.
    if (d.action === 'rewrite') return { deny: reentryRewriteReason(d) }
    return next(e)
  }
  if (next.called) return next(e)
  return refuse($, e, next)
}

async function passOn($, e, next) {
  return next(e)
}

async function applyToolDecision($, e, next, decision) {
  report($, decision)
  if (decision.action === 'deny') return { deny: decision.reason }
  if (decision.action === 'rewrite') return next(decision.input)
  return next(e)
}

export function register(on, options) {
  const opts = options || {}
  config.lang = opts.language === 'en' ? 'en' : 'it'
  config.redPolicy = opts.redPolicy === 'warn' ? 'warn' : 'deny'
  config.planLine = typeof opts.planLine === 'string' ? opts.planLine : ''

  // Observers: they record and pass the event on unchanged.
  on('prompt.context', async ($, e, next) => {
    const plan = planFromFiles(e.instructionFiles)
    if (plan && !sameReading(plan, memo.plan)) {
      memo.plan = plan
      try {
        await $.state.set(PLAN, plan)
      } catch {}
    }
    return next(e)
  }).catch(passOn)

  on('session.measure', async ($, e, next) => {
    try {
      if (Array.isArray(e.rateLimits) && e.rateLimits.length) {
        memo.rateLimits = e.rateLimits
        memo.readingAt = await nowOf($)
        const plan = memo.plan || planFromOption(config.planLine)
        syncStatus($, computeBudget({ rateLimits: memo.rateLimits, now: memo.readingAt, plan, inFlight: 0, readingAt: memo.readingAt }))
      }
    } catch {}
    return next(e)
  }).catch(passOn)

  // Guards: each refuses with a deny when it fails; on re-entry the .catch runs the check from memo.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ctx = await contextOf($)
    ctx.haiku = await readHaiku($)
    return applyToolDecision($, e, next, decideAgent(e, ctx))
  }).catch(guardFailed)

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const ctx = await contextOf($)
    const decision = decideWorkflow(e, ctx)
    // A resume of a run this module does not know (lost on a reload): record it with the width the
    // decision gives, so its agents are not refused as a new run while red.
    if (decision.action !== 'deny' && decision.startRun) {
      const runId = e.resumeFromRunId
      await loadRun($, runId)
      if (!runs.has(runId)) {
        runs.set(runId, { admitted: new Set(), ...decision.startRun })
        await saveRun($, runId)
      }
    }
    return applyToolDecision($, e, next, decision)
  }).catch(guardFailed)

  on('tool.call', { tool: 'RemoteTrigger' }, async ($, e, next) => {
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideRemoteTrigger(e, ctx))
  }).catch(guardFailed)

  // Every tool that runs a shell command; a Monitor watch without a command (a WebSocket) passes.
  on('tool.call', { tool: ['Bash', 'PowerShell', 'Monitor'] }, async ($, e, next) => {
    if (e.tool === 'Monitor' && (e.command === undefined || e.command === null)) return next(e)
    const launches = scanShell(e.command)
    if (!launches.length) return next(e)
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideShell(e, ctx, launches))
  }).catch(guardFailed)

  // Every spawn: the model it will run on (a fork or an agent that inherits runs on the session's, so
  // Fable there is refused); a workflow agent also goes through its run's width.
  on('agent.spawn', async ($, e, next) => {
    if (!e.workflow) {
      const decision = decideSpawn(e, { lang: config.lang, haiku: await readHaiku($) })
      report($, decision)
      if (decision.action === 'deny') return { deny: decision.reason }
      return next(e)
    }
    const ctx = await contextOf($)
    ctx.haiku = await readHaiku($)
    const runId = typeof e.workflow.runId === 'string' ? e.workflow.runId : ''
    await loadRun($, runId)
    // Decide and count with no await in between, so parallel spawns of one run cannot both pass the cap.
    const decision = decideWorkflowAgent(e, ctx, runs.get(runId))
    const changed = applyRun(runId, e, decision)
    // One transcript line per run and kind of refusal; a 30-agent run past width 16 repeats it to debug.
    if (decision.log && decision.to !== 'debug') {
      const key = runId + ':' + decision.log
      if (loggedRuns.has(key)) decision.to = 'debug'
      else loggedRuns.add(key)
    }
    report($, decision)
    if (changed) await saveRun($, runId)
    if (decision.action === 'deny') return { deny: decision.reason }
    return next(e)
  }).catch(guardFailed)
}
