// model-guard: enforces model-mix on delegated launches (Agent, Workflow, RemoteTrigger,
// cloud sessions started from Bash or PowerShell, workflow agents).
// The only module that touches `$`. Decisions live in rules.js, the budget maths in budget.js.
// It never calls a model and never reads credentials: the plan comes from the person's
// CLAUDE.md (prompt.context) or the planLine option, the usage from session.measure and
// $.session.usage().

import { computeBudget } from './budget.js'
import {
  decideAgent, decideRemoteTrigger, decideShell, decideWorkflow, decideWorkflowAgent,
  failureReason, planFromFiles, planFromOption, scanShell, statusText, texts,
} from './rules.js'

const config = { lang: 'it', redPolicy: 'deny', planLine: '' }
const memo = {
  plan: null,            // parsePlanLine result from CLAUDE.md
  rateLimits: null,      // last session.measure reading
  readingAt: null,
  unknownLogged: false,
  status: null,          // last status text sent; null = never sent
}
const runs = new Map()   // runId -> { admitted: Set of agentIndex, width, name } (width fixed at the run's first agent)
const loggedRuns = new Set() // runId + ':' + line already in the transcript (later repeats go to debug)

async function nowOf($) {
  try {
    const t = await $.clock.now()
    if (typeof t === 'number' && Number.isFinite(t)) return t
  } catch {}
  return Date.now()
}

// The budget at decision time: a fresh $.session.usage() reading (free), else the last session.measure one.
async function readBudget($) {
  const now = await nowOf($)
  let rateLimits = memo.rateLimits
  let readingAt = memo.readingAt
  try {
    const usage = await $.session.usage()
    if (usage && Array.isArray(usage.rateLimits) && usage.rateLimits.length) {
      rateLimits = usage.rateLimits
      readingAt = now
      memo.rateLimits = rateLimits
      memo.readingAt = now
    }
  } catch {}
  const plan = memo.plan || planFromOption(config.planLine)
  return computeBudget({ rateLimits: Array.isArray(rateLimits) ? rateLimits : [], now, plan, inFlight: 0, readingAt })
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
  const budget = await readBudget($)
  syncStatus($, budget)
  if (budget.color !== 'unknown') memo.unknownLogged = false
  return {
    budget,
    redPolicy: config.redPolicy,
    lang: config.lang,
    unknownLogged: memo.unknownLogged,
  }
}

function report($, decision) {
  if (decision.unknownNoted) memo.unknownLogged = true
  if (!decision.log) return
  try {
    $.ui.log(decision.log, { to: decision.to === 'debug' ? 'debug' : 'transcript' })
  } catch {}
}

function refuse($, e, next) {
  const kind = next.error ? next.error.kind : 'error'
  try {
    $.ui.log(texts(config.lang).failed(kind), { to: 'transcript' })
  } catch {}
  return { deny: failureReason(kind) }
}

// The .catch every guard shares: re-entry passes on, a hook that already called next keeps
// what next settled to, anything else refuses with the event's own deny.
async function guardFailed($, e, next) {
  if (next.error && next.error.kind === 're-entry') return next(e)
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
    if (plan) memo.plan = plan
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

  // Guards: each refuses with a deny when it fails (re-entry passes on).
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideAgent(e, ctx))
  }).catch(guardFailed)

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideWorkflow(e, ctx))
  }).catch(guardFailed)

  on('tool.call', { tool: 'RemoteTrigger' }, async ($, e, next) => {
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideRemoteTrigger(e, ctx))
  }).catch(guardFailed)

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const launches = scanShell(e.command)
    if (!launches.length) return next(e)
    const ctx = await contextOf($)
    return applyToolDecision($, e, next, decideShell(e, ctx, launches))
  }).catch(guardFailed)

  on('agent.spawn', async ($, e, next) => {
    if (!e.workflow) return next(e)
    const ctx = await contextOf($)
    const runId = e.workflow && typeof e.workflow.runId === 'string' ? e.workflow.runId : ''
    // Decide and count with no await in between, so parallel spawns of one run cannot both pass the cap.
    const decision = decideWorkflowAgent(e, ctx, runs.get(runId))
    if (decision.startRun && !runs.has(runId)) runs.set(runId, { admitted: new Set(), ...decision.startRun })
    if (decision.admit && runs.has(runId)) runs.get(runId).admitted.add(e.workflow.agentIndex)
    // One transcript line per run and kind of refusal; a 30-agent run past width 16 repeats it to debug.
    if (decision.log && decision.to !== 'debug') {
      const key = runId + ':' + decision.log
      if (loggedRuns.has(key)) decision.to = 'debug'
      else loggedRuns.add(key)
    }
    report($, decision)
    if (decision.action === 'deny') return { deny: decision.reason }
    return next(e)
  }).catch(guardFailed)
}
