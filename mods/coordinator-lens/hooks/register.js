// coordinator-lens: makes the coordinator's work visible. It observes and never blocks, rewrites or
// answers anything of the model's, except the one tool it registers (budget_estimate) and one hidden
// context line on a prompt. Nothing here calls a model.
//
// All `$` wiring lives in this file. The host reads `on(...)` and `$.noun.method(...)` from the source,
// so event names are literals, `$` is called in full and only handed to top-level functions of this file;
// state and view models come from tracker.js and views.js, which are pure.

import { bandView, cardView, paneView, summaryText, budgetLine, workflowSuffix } from './views.js'
import {
  createState, setPlan, planFromContext, planFromOption, applyUsage, budgetOf, onAgentToolCall, onAgentToolResult,
  onAgentSpawned, onTurnComplete, touch, onWorkflowLaunch, onTaskNotification, onMeasure, onShellCommand, onPrList,
  onSkill, onFileWrite, onQuestion, onQuestionAnswered, onWake, onColorChange, setNight, tick, viewModel,
  notifications, estimateRun, dump, restore, mergeRunCost,
} from './tracker.js'
import { t, colorWord } from './i18n.js'

const PANE_ID = 'coord'
const TOOL_NAME = 'mcp__coordinator-lens__budget_estimate'
const REGISTER_TRIES = 3

// Module variables die on every reload; session.start restores what matters from $.store.
let S = createState()
let OPT = { lang: 'it', planLine: '', prPolling: true, stalledMinutes: 10, contextLine: true }
let tab = 'overview'
let paneOpen = false
let lastVm = null
let lastSig = null
let lastSaved = ''
let shown = new Set()
let timers = []
let prFails = 0
let prOff = false
let registered = { command: false, tool: false, tries: 0 }
let questionSeq = 0
let started = false
let nightDirty = false
let announcedColor = null
let pendingColor = null
// Card snapshots by the text the command returned: the newest run with a text wins it. A card is found by
// text only the first time a transcript row draws; after that the row keeps its own snapshot, pinned by
// the row's requestId, so two rows with the same text (the text carries no times) never share one.
const cards = new Map()
const pinned = new Map()

// The transcript may show a plugin command's text with the plugin's name in front
// ('coordinator-lens: budget: ...'), so a snapshot is found with or without that prefix.
function cardFor(text) {
  const s = String(text || '').trim()
  if (cards.has(s)) return cards.get(s)
  const bare = s.replace(/^[A-Za-z0-9_-]+:\s*/, '')
  if (cards.has(bare)) return cards.get(bare)
  for (const [k, v] of [...cards].reverse()) if (k && s.endsWith(k)) return v
  return null
}

// A color change is toasted only when it holds this long.
const COLOR_HOLD_MS = 5 * 60 * 1000
const MAX_CARDS = 20

function optionsFrom(options) {
  const o = options || {}
  const minutes = Number(o.stalledMinutes)
  return {
    lang: o.language === 'en' ? 'en' : 'it',
    planLine: typeof o.planLine === 'string' ? o.planLine : '',
    prPolling: o.prPolling !== 'off',
    stalledMinutes: [5, 10, 20, 30].includes(minutes) ? minutes : 10,
    contextLine: o.contextLine !== 'off',
  }
}

// ---------- helpers that touch `$` ----------

async function nowOf($) {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

function viewModelAt(now) {
  return viewModel(S, budgetOf(S, now), OPT.lang, now)
}

async function notify($, n) {
  if (shown.has(n.key)) return
  shown.add(n.key)
  if (shown.size > 300) shown = new Set([n.key])
  try {
    await $.ui.toast(n.text, { timeoutMs: 6000 })
  } catch {}
  if (n.kind === 'color') {
    try {
      const now = await nowOf($)
      onColorChange(S, { from: n.from, to: n.to, now })
      await $.ui.log(t(OPT.lang, 'log.color', { from: colorWord(OPT.lang, n.from), to: colorWord(OPT.lang, n.to) }), { to: 'transcript' })
    } catch {}
  }
}

// Budget color without flicker: the color last announced stays until a different one has held for
// COLOR_HOLD_MS. Returns the notification to raise, or null. Unknown colors never count.
function settleColor(vm, now, announce) {
  const c = vm && vm.budget ? vm.budget.color : null
  if (c !== 'green' && c !== 'yellow' && c !== 'red') return null
  if (announcedColor == null || !announce) {
    if (announcedColor == null) announcedColor = c
    return null
  }
  if (c === announcedColor) {
    pendingColor = null
    return null
  }
  if (!pendingColor || pendingColor.color !== c) {
    pendingColor = { color: c, since: now }
    return null
  }
  if (now - pendingColor.since < COLOR_HOLD_MS) return null
  const from = announcedColor
  announcedColor = c
  pendingColor = null
  return {
    kind: 'color',
    key: 'color:' + from + '>' + c + ':' + Math.floor(now / 60000),
    text: t(OPT.lang, 'toast.color', { color: colorWord(OPT.lang, c) }),
    from,
    to: c,
  }
}

// Rebuild the view model, toast what deserves it, redraw. Never throws.
async function refresh($, announce) {
  try {
    const now = await nowOf($)
    const vm = viewModelAt(now)
    const prev = lastVm
    lastVm = vm
    if (announce !== false && prev) for (const n of notifications(prev, vm)) if (n.kind !== 'color') await notify($, n)
    const colorToast = settleColor(vm, now, announce !== false)
    if (colorToast) await notify($, colorToast)
    await $.ui.invalidate('ui.render')
  } catch {}
}

// $.store is one file shared by every session on the machine: read before writing, and write night
// only when this session changed it (or keeps the same night going).
async function persist($) {
  try {
    const d = dump(S)
    const sig = JSON.stringify(d)
    if (sig === lastSaved) return
    const merged = mergeRunCost(S, await $.store.get('runCost'))
    await $.store.set('runCost', { samples: merged.samples, last: merged.last })
    const night = S.night.on || nightDirty ? await storedNight($) : null
    if (nightDirty || (night && night.on === true && night.since === S.night.since)) await $.store.set('night', d.night)
    nightDirty = false
    lastSaved = JSON.stringify(dump(S))
  } catch {}
}

async function storedNight($) {
  try {
    return await $.store.get('night')
  } catch {
    return null
  }
}

async function readUsage($, fresh) {
  try {
    const u = await $.session.usage()
    const now = await nowOf($)
    applyUsage(S, { rateLimits: u && u.rateLimits, now, fresh: !!fresh })
  } catch {}
}

async function pulse($) {
  await readUsage($, false)
  try {
    tick(S, await nowOf($), OPT.stalledMinutes)
  } catch {}
  await refresh($)
}

async function pollPrs($) {
  if (prOff || !OPT.prPolling) return
  try {
    const cwd = await $.session.cwd()
    const r = await $.process.run(
      ['gh', 'pr', 'list', '--json', 'number,title,state,url,isDraft,mergeable,statusCheckRollup', '--limit', '20'],
      { cwd, timeoutMs: 15000 },
    )
    if (!r || r.exitCode !== 0) throw new Error('gh pr list failed')
    onPrList(S, r.stdout, await nowOf($))
    prFails = 0
    await refresh($)
  } catch {
    prFails += 1
    if (prFails >= 3) prOff = true
  }
}

function stopTimers() {
  for (const timer of timers) {
    try {
      timer.cancel()
    } catch {}
  }
  timers = []
}

function startTimers($) {
  stopTimers()
  try {
    timers.push($.clock.every(60000, () => {
      pulse($).catch(() => undefined)
    }))
  } catch {}
  if (!OPT.prPolling) return
  try {
    timers.push($.clock.every(300000, () => {
      pollPrs($).catch(() => undefined)
    }))
  } catch {}
  pollPrs($).catch(() => undefined)
}

async function ensureRegistered($) {
  if ((registered.command && registered.tool) || registered.tries >= REGISTER_TRIES) return
  registered.tries += 1
  if (!registered.command) {
    try {
      await $.command.register({ name: 'coord', description: t(OPT.lang, 'cmd.description'), argumentHint: '[pane|night on|night off]' })
      registered.command = true
    } catch {}
  }
  if (!registered.tool) {
    try {
      await $.tool.register({
        name: 'budget_estimate',
        description: 'Weekly points a planned run would cost and whether it fits the budget',
        inputSchema: {
          type: 'object',
          properties: { sonnet: { type: 'number' }, opus: { type: 'number' }, fable: { type: 'number' } },
        },
      })
      registered.tool = true
    } catch {}
  }
}

async function init($, e) {
  started = true
  try {
    const runCost = await $.store.get('runCost')
    const night = await $.store.get('night')
    restore(S, { runCost, night }, await nowOf($))
    // The plan read from CLAUDE.md survives a reload (prompt.context does not fire again).
    if (!S.plan) {
      const raw = await $.store.get('planLine')
      if (typeof raw === 'string') setPlan(S, planFromOption(raw))
    }
  } catch {}
  await readUsage($, false)
  await refresh($, false)
  if (!(e && e.isInteractive === false)) startTimers($)
  await ensureRegistered($)
}

// session.start runs again on a reload, but a lens that missed it (a failed init) starts on the first prompt, measure or command.
async function ensureStarted($) {
  if (started) return
  try {
    await init($, null)
  } catch {}
}

async function openPane($) {
  try {
    const r = await $.ui.open({ id: PANE_ID, title: t(OPT.lang, 'pane.title'), focus: true, closeOnEscape: true })
    paneOpen = !(r && r.isPlaced === false)
    return paneOpen
  } catch {
    return false
  }
}

async function selectTab($, key) {
  tab = key
  try {
    await $.ui.invalidate('ui.render')
  } catch {}
}

async function changeNight($, on) {
  const now = await nowOf($)
  await readUsage($, false)
  setNight(S, on, now)
  nightDirty = true
  await persist($)
  await refresh($)
}

async function toggleNight($) {
  await changeNight($, !S.night.on)
}

function actionsFor($) {
  return {
    setTab: key => {
      selectTab($, key).catch(() => undefined)
    },
    toggleNight: () => {
      toggleNight($).catch(() => undefined)
    },
  }
}

function outputOf(r) {
  if (!r) return ''
  if (typeof r.deny === 'string') return r.deny
  const res = r.result
  if (res && typeof res === 'object' && (typeof res.stdout === 'string' || typeof res.stderr === 'string')) {
    return (res.stdout || '') + '\n' + (res.stderr || '')
  }
  return typeof r.text === 'string' ? r.text : ''
}

// What decides whether the model gets a new budget line: color, profile, 5-hour pause, weekly 5-point bucket.
function contextSig(budget) {
  const weekly = budget.weekly ? Math.floor(budget.weekly.used / 5) : 'x'
  return [budget.color, budget.profile ? budget.profile.name : '', budget.pausedFiveHour ? 'paused' : 'open', weekly].join('|')
}

// ---------- hooks ----------

export function register(on, options) {
  OPT = optionsFrom(options)
  S = createState()
  setPlan(S, planFromOption(OPT.planLine))
  tab = 'overview'
  paneOpen = false
  lastVm = null
  lastSig = null
  lastSaved = ''
  shown = new Set()
  timers = []
  prFails = 0
  prOff = false
  registered = { command: false, tool: false, tries: 0 }
  started = false
  nightDirty = false
  announcedColor = null
  pendingColor = null
  cards.clear()
  pinned.clear()

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      await init($, e)
    } catch {}
    return result
  }).catch(async ($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    stopTimers()
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    try {
      if (e.source === 'clear' || e.source === 'resume') {
        registered = { command: false, tool: false, tries: 0 }
        await ensureRegistered($)
        await refresh($, false)
      }
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // The plan line from the user CLAUDE.md. Observe only.
  on('prompt.context', async ($, e, next) => {
    try {
      const fromFiles = planFromContext(e.instructionFiles, '')
      const plan = fromFiles || planFromOption(OPT.planLine)
      if (plan) setPlan(S, plan)
      if (fromFiles && fromFiles.raw) await $.store.set('planLine', fromFiles.raw)
      else await $.store.delete('planLine')
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    try {
      await ensureStarted($)
      const now = await nowOf($)
      onMeasure(S, { rateLimits: e.rateLimits, now })
      // session.measure follows a main-thread turn: an API response just came back, so the session's
      // windows are fresh now even when this event carries no rateLimits (it lists them only when a
      // window moved a whole point). Read them and stamp them as fresh.
      if (!Array.isArray(e.rateLimits) || !e.rateLimits.length) {
        try {
          const u = await $.session.usage()
          if (u && Array.isArray(u.rateLimits) && u.rateLimits.length) applyUsage(S, { rateLimits: u.rateLimits, now, fresh: true })
        } catch {}
      }
      await persist($)
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    try {
      onAgentToolCall(S, { toolUseId: e.tool_use_id, input: e, now: await nowOf($) })
      await refresh($)
    } catch {}
    const r = await next(e)
    try {
      onAgentToolResult(S, {
        toolUseId: e.tool_use_id,
        result: r && r.result,
        deny: r && r.deny,
        isError: !!(r && r.isError),
        now: await nowOf($),
      })
      await refresh($)
    } catch {}
    return r
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const r = await next(e)
    try {
      const result = r && typeof r.deny === 'string' ? { deny: r.deny } : r && r.isError ? { error: String(r.text || 'error') } : r && r.result
      onWorkflowLaunch(S, { toolUseId: e.tool_use_id, input: e, result, now: await nowOf($) })
      await refresh($)
    } catch {}
    return r
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const r = await next(e)
    try {
      onShellCommand(S, {
        command: e.command,
        output: outputOf(r),
        isError: !!(r && r.isError),
        denied: !!(r && typeof r.deny === 'string'),
        now: await nowOf($),
      })
      await refresh($)
    } catch {}
    return r
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    try {
      onSkill(S, { name: e.skill, via: 'tool', now: await nowOf($) })
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const id = e.tool_use_id || 'ask' + ++questionSeq
    try {
      onQuestion(S, { toolUseId: id, input: e, now: await nowOf($) })
      await refresh($)
    } catch {}
    const r = await next(e)
    try {
      onQuestionAnswered(S, { toolUseId: id, now: await nowOf($) })
      await refresh($)
    } catch {}
    return r
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    try {
      onFileWrite(S, e.file_path, await nowOf($))
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('tool.call', { tool: 'ScheduleWakeup' }, async ($, e, next) => {
    try {
      onWake(S, { delaySeconds: e.delaySeconds, stop: e.stop, now: await nowOf($) })
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // The tool the model can call: what a planned run would cost and whether it fits.
  on('tool.call', { tool: TOOL_NAME }, async ($, e, next) => {
    await readUsage($, false)
    const now = await nowOf($)
    return { result: estimateRun(S, budgetOf(S, now), { sonnet: e.sonnet, opus: e.opus, fable: e.fable }) }
  }).catch(async ($, e, next) => {
    if (next.error && next.error.kind === 're-entry') return next(e)
    return { deny: 'budget_estimate failed: ' + (next.error ? next.error.kind : 'unknown') }
  })

  // Anything a subagent or workflow agent does means it is alive.
  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      try {
        touch(S, e.agentId, await nowOf($))
      } catch {}
    }
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      onAgentSpawned(S, { toolUseId: e.tool_use_id, input: e, result: r, now: await nowOf($) })
      await refresh($)
    } catch {}
    return r
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      try {
        onTurnComplete(S, { agentId: e.agentId, now: await nowOf($), reason: e.reason })
        await refresh($)
      } catch {}
    }
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('skill.prompt', async ($, e, next) => {
    try {
      onSkill(S, { name: e.skill, via: 'prompt', now: await nowOf($) })
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('classic.UserPromptExpansion', async ($, e, next) => {
    try {
      onSkill(S, { name: e.command_name, via: 'command', now: await nowOf($) })
      await refresh($)
    } catch {}
    return next(e)
  }).catch(async ($, e, next) => next(e))

  // Task notifications end workers. The budget line rides on the prompt as hidden context, only when
  // color, profile, 5-hour pause or the weekly 5-point bucket changed since the last one sent.
  on('prompt.submit', async ($, e, next) => {
    let extra = null
    try {
      await ensureStarted($)
      const now = await nowOf($)
      if (e.origin && e.origin.kind === 'task-notification') {
        onTaskNotification(S, e.text, now)
        await persist($)
        await refresh($)
      }
      if (!registered.command || !registered.tool) await ensureRegistered($)
      if (OPT.contextLine) {
        const budget = budgetOf(S, now)
        const sig = contextSig(budget)
        if (sig !== lastSig && !(lastSig === null && budget.color === 'unknown')) extra = { line: budgetLine({ budget }), sig }
      }
    } catch {}
    if (!extra) return next(e)
    const r = await next({ ...e, context: [...(e.context || []), extra.line] })
    if (r && !r.drop) lastSig = extra.sig
    return r
  }).catch(async ($, e, next) => next(e))

  on('command.run', { command: 'coord' }, async ($, e, next) => {
    await ensureStarted($)
    const args = String(e.args || '').trim().toLowerCase().replace(/\s+/g, ' ')
    let lead = ''
    if (args === 'night on' || args === 'night off') await changeNight($, args === 'night on')
    else if (args === 'pane') {
      if (await openPane($)) return {}
    } else if (args) lead = '/coord: unknown argument "' + args.slice(0, 40) + '" (use pane, night on, night off)\n'
    const now = await nowOf($)
    // The card is drawn from this snapshot, not from the live state at render time. The newest snapshot
    // takes the text (delete first, so it is also the last to be pruned).
    const vm = viewModelAt(now)
    const text = lead + summaryText(vm)
    cards.delete(text)
    cards.set(text, vm)
    if (cards.size > MAX_CARDS) cards.delete(cards.keys().next().value)
    return { text }
  }).catch(async ($, e, next) => {
    if (next.error && next.error.kind === 're-entry') return next(e)
    return { text: '/coord failed: ' + (next.error ? next.error.kind : 'unknown'), exitCode: 1 }
  })

  // The pane has no close button of its own: the person closes it with the pane's close mark or Esc
  // (opened with closeOnEscape). Either way it ends here, and the open flag follows.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) paneOpen = false
    return next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const vm = viewModelAt(await nowOf($))
    const tree = bandView(vm, $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface })
    return tree || next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    paneOpen = true
    const vm = viewModelAt(await nowOf($))
    const tree = paneView(vm, $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface, tab, actions: actionsFor($) })
    return tree || next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!/(^|:)coord$/.test(String(e.props.command)) || e.props.isErrored) return next(e)
    // An unknown argument keeps its plain text, with the line that says what is accepted.
    const a = String(e.props.args || '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (a && a !== 'night on' && a !== 'night off' && a !== 'pane') return next(e)
    // A row keeps the snapshot it was first drawn with: a redraw (a resize draws every hooked site again)
    // never swaps it for a newer one.
    const id = typeof e.requestId === 'string' && e.requestId ? e.requestId : null
    let vm = id ? pinned.get(id) : null
    if (!vm) {
      vm = cardFor(e.props.text)
      if (!vm) return next(e)
      if (id) {
        pinned.set(id, vm)
        if (pinned.size > MAX_CARDS) pinned.delete(pinned.keys().next().value)
      }
    }
    const cols = e.viewport && e.viewport.columns ? e.viewport.columns : 100
    const tree = cardView(vm, $.ui.resolve(e), { cols, surface: e.surface })
    return tree || next(e)
  }).catch(async ($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const suffix = workflowSuffix(lastVm || viewModelAt(await nowOf($)))
    if (!suffix) return next(e)
    return next({ ...e, props: { ...e.props, suffix: (e.props.suffix || '') + suffix } })
  }).catch(async ($, e, next) => next(e))
}
