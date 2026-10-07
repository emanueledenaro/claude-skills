// model-guard decisions: pure functions, data in, data out. No `$` here.
// Each decide* returns { action: 'allow'|'rewrite'|'deny', input?, reason, log, to?, ... }.
//   input  the whole rewritten tool input (rewrite only)
//   reason English, short, for the model (deny) or the debug log (rewrite/allow)
//   log    the line the person sees, in their language ('' when nothing to say)
//   to     where the log goes: 'transcript' (default) or 'debug'
// A malformed event (a field of the wrong type) throws: the guard's .catch then refuses it.

import { PROFILES, modelFamily, parsePlanLine } from './budget.js'

// Agent types that inherit the session model when no model is given (Opus by default).
export const INHERITING_TYPES = ['general-purpose', 'Explore', 'Plan']

// RemoteTrigger actions that start or schedule work; the rest only read.
export const LAUNCH_ACTIONS = ['create', 'update', 'run', 'create_webhook_trigger']

const PREFIX_WORDS = ['exec', 'nohup', 'time', 'command', 'env', 'sudo', 'npx', 'bunx', 'call', 'xargs']

// claude's own subcommands: they manage the install or local sessions and never start one.
const MANAGEMENT = [
  'plugin', 'plugins', 'mcp', 'auth', 'update', 'upgrade', 'agents', 'doctor', 'config', 'attach', 'logs',
  'stop', 'kill', 'rm', 'respawn', 'install', 'setup-token', 'auto-mode', 'import', 'purge', 'gateway',
]

// ---------------------------------------------------------------- texts

// Why the haiku alias is not Haiku 5.5 here (haikuAlias's `why`), in the person's language and the model's.
const HAIKU_WHY = {
  it: {
    old: 'prima di Claude Code 2.1.293 haiku è Haiku 4.5',
    unknown: 'versione di Claude Code non letta, haiku può essere Haiku 4.5',
    provider: 'fuori dall\'API Anthropic haiku è Haiku 4.5',
    env: 'variabili d\'ambiente non lette, haiku può essere Haiku 4.5',
    remapped: 'ANTHROPIC_DEFAULT_HAIKU_MODEL fa puntare haiku a un altro modello',
    remote: 'isolation remote: la sessione cloud ha la sua versione',
  },
  en: {
    old: 'before Claude Code 2.1.293 haiku is Haiku 4.5',
    unknown: 'Claude Code version not read, haiku may be Haiku 4.5',
    provider: 'off the Anthropic API haiku is Haiku 4.5',
    env: 'environment not read, haiku may be Haiku 4.5',
    remapped: 'ANTHROPIC_DEFAULT_HAIKU_MODEL points haiku at another model',
    remote: 'isolation remote: the cloud session runs its own version',
  },
  model: {
    old: 'this Claude Code is older than 2.1.293, where the haiku alias is still Haiku 4.5',
    unknown: 'model-guard could not read the Claude Code version, and before 2.1.293 the haiku alias is Haiku 4.5',
    provider: 'this session runs on Bedrock, Google Cloud, Microsoft Foundry, Claude Platform on AWS or a gateway, where the haiku alias is still Haiku 4.5',
    env: 'model-guard could not read the environment that tells the provider, and off the Anthropic API the haiku alias is Haiku 4.5',
    remapped: 'ANTHROPIC_DEFAULT_HAIKU_MODEL points the haiku alias at a model other than Haiku 5.5',
    remote: "isolation 'remote' runs in a cloud session on its own Claude Code version, where the haiku alias may still be Haiku 4.5",
  },
}

const TEXTS = {
  it: {
    red: 'rosso', yellow: 'giallo', green: 'verde', unknown: 'sconosciuto',
    agentNoModel: 'model-guard: Agent senza modello -> sonnet',
    explore: 'model-guard: Explore senza modello -> haiku, effort medium',
    haiku: why => `model-guard: haiku -> sonnet (${HAIKU_WHY.it[why] || HAIKU_WHY.it.unknown})`,
    haikuOld: 'model-guard: Haiku 4.5 -> sonnet (model-mix non fissa mai Haiku 4.5)',
    fable: 'model-guard: fable -> opus sugli agenti (un mod non legge la finestra Fable: niente Fable fuori dalla sessione principale)',
    ownModel: t => `model-guard: tipo ${t} senza modello, lasciato al modello della sua definizione`,
    deniedRed: b => `model-guard: lancio bloccato, budget rosso (${budgetBrief(b, 'it')})`,
    deniedPaused: at => `model-guard: lancio bloccato, finestra 5 ore oltre il 90% fino alle ${at}`,
    warnRed: b => `model-guard: budget rosso (${budgetBrief(b, 'it')}), lancio consentito (redPolicy warn)`,
    resumeRed: (b, what) => `model-guard: budget rosso (${budgetBrief(b, 'it')}), ripresa ${what === 'session' ? 'della sessione' : 'del workflow'} consentita (lavoro aperto)`,
    unknown: 'model-guard: nessuna lettura del budget ancora, lancio consentito',
    cloudModel: 'model-guard: claude --cloud senza --model -> --model sonnet',
    localModel: 'model-guard: claude -p/--bg senza --model -> --model sonnet',
    nested: 'model-guard: lancio di claude senza --model in uno script annidato, bloccato',
    cloudBad: m => `model-guard: sessione cloud con modello ${m} bloccata`,
    localBad: m => `model-guard: sessione headless con modello ${m} bloccata`,
    launchBad: m => `model-guard: launch.exp con modello ${m} bloccato`,
    wfFable: 'model-guard: agente di workflow su Fable bloccato, va fissato opus',
    wfHaiku: why => `model-guard: agente di workflow su haiku bloccato (${HAIKU_WHY.it[why] || HAIKU_WHY.it.unknown}), va fissato sonnet`,
    wfHaikuOld: 'model-guard: agente di workflow su Haiku 4.5 bloccato, va fissato sonnet o claude-haiku-5-5',
    wfWidth: p => `model-guard: workflow oltre la larghezza ${p.width} (${p.name}), altri agenti bloccati`,
    wfWidthWarn: p => `model-guard: workflow oltre la larghezza ${p.width} (${p.name}), altri agenti consentiti (redPolicy warn)`,
    wfSolo: p => `model-guard: workflow bloccato, il profilo di oggi (${p.name}) non ne consente`,
    cloudSolo: p => `model-guard: sessione cloud bloccata, il profilo di oggi (${p.name}) non ne consente`,
    indirect: 'model-guard: lancio di claude tramite Start-Process o start bloccato, va lanciato direttamente',
    failed: k => `model-guard: controllo fallito (${k}), lancio bloccato`,
    status: (b, warn) => `model-guard: budget rosso · ${budgetBrief(b, 'it')} · ${warn ? 'lanci solo segnalati' : 'nuovi lanci bloccati'}`,
  },
  en: {
    red: 'red', yellow: 'yellow', green: 'green', unknown: 'unknown',
    agentNoModel: 'model-guard: Agent without a model -> sonnet',
    explore: 'model-guard: Explore without a model -> haiku, effort medium',
    haiku: why => `model-guard: haiku -> sonnet (${HAIKU_WHY.en[why] || HAIKU_WHY.en.unknown})`,
    haikuOld: 'model-guard: Haiku 4.5 -> sonnet (model-mix never pins Haiku 4.5)',
    fable: 'model-guard: fable -> opus on agents (a mod cannot read the Fable window: no Fable outside the main session)',
    ownModel: t => `model-guard: type ${t} has no model, left to its definition's model`,
    deniedRed: b => `model-guard: launch blocked, budget red (${budgetBrief(b, 'en')})`,
    deniedPaused: at => `model-guard: launch blocked, 5-hour window past 90% until ${at}`,
    warnRed: b => `model-guard: budget red (${budgetBrief(b, 'en')}), launch allowed (redPolicy warn)`,
    resumeRed: (b, what) => `model-guard: budget red (${budgetBrief(b, 'en')}), ${what === 'session' ? 'session' : 'workflow'} resume allowed (open work)`,
    unknown: 'model-guard: no budget reading yet, launch allowed',
    cloudModel: 'model-guard: claude --cloud without --model -> --model sonnet',
    localModel: 'model-guard: claude -p/--bg without --model -> --model sonnet',
    nested: 'model-guard: claude launch without --model inside a nested script, blocked',
    cloudBad: m => `model-guard: cloud session on ${m} blocked`,
    localBad: m => `model-guard: headless session on ${m} blocked`,
    launchBad: m => `model-guard: launch.exp on ${m} blocked`,
    wfFable: 'model-guard: workflow agent on Fable blocked, pin opus',
    wfHaiku: why => `model-guard: workflow agent on haiku blocked (${HAIKU_WHY.en[why] || HAIKU_WHY.en.unknown}), pin sonnet`,
    wfHaikuOld: 'model-guard: workflow agent on Haiku 4.5 blocked, pin sonnet or claude-haiku-5-5',
    wfWidth: p => `model-guard: workflow past width ${p.width} (${p.name}), further agents blocked`,
    wfWidthWarn: p => `model-guard: workflow past width ${p.width} (${p.name}), further agents allowed (redPolicy warn)`,
    wfSolo: p => `model-guard: workflow blocked, today's profile (${p.name}) allows none`,
    cloudSolo: p => `model-guard: cloud session blocked, today's profile (${p.name}) allows none`,
    indirect: 'model-guard: claude launch through Start-Process or start blocked, run it directly',
    failed: k => `model-guard: check failed (${k}), launch blocked`,
    status: (b, warn) => `model-guard: budget red · ${budgetBrief(b, 'en')} · ${warn ? 'launches only flagged' : 'new launches blocked'}`,
  },
}

export function texts(lang) {
  return lang === 'en' ? TEXTS.en : TEXTS.it
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// 'HH:MM UTC'
export function clockUtc(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

// 'YYYY-MM-DD HH:MM UTC' (en, model) or 'DD/MM HH:MM UTC' (it)
export function dateUtc(ms, lang) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  const time = clockUtc(ms)
  if (lang === 'it') return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${time}`
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${time}`
}

function signed(n) {
  const r = Math.round(n)
  return (r > 0 ? '+' : '') + r
}

function budgetBrief(b, lang) {
  const it = lang === 'it'
  const parts = []
  if (typeof b.margin === 'number') parts.push((it ? 'margine ' : 'margin ') + signed(b.margin))
  if (b.weekly) parts.push((it ? 'settimanale ' : 'weekly ') + Math.round(b.weekly.used) + '%')
  if (b.weekly && b.weekly.resetsAt) parts.push((it ? 'reset ' : 'resets ') + dateUtc(b.weekly.resetsAt, lang))
  return parts.join(' · ')
}

// ---------------------------------------------------------------- plan

// The plan line from the person's CLAUDE.md files (kind 'user'), else null.
export function planFromFiles(files) {
  if (!Array.isArray(files)) return null
  for (const f of files) {
    if (!f || f.kind !== 'user' || typeof f.content !== 'string') continue
    const plan = parsePlanLine(f.content)
    if (plan) return plan
  }
  return null
}

// The userConfig fallback: a whole `Claude plan: ...` line or just what follows it.
export function planFromOption(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  return parsePlanLine(text) || parsePlanLine('Claude plan: ' + text.trim())
}

// Whether the plan line banks a 5-hour reset still worth redeeming (no expiry, or not expired before today).
export function fiveHourBanked(plan, now) {
  if (!plan || !Array.isArray(plan.banked) || typeof now !== 'number') return false
  const today = new Date(now).toISOString().slice(0, 10)
  return plan.banked.some(r => r && r.type === '5-hour' && (!r.expires || r.expires >= today))
}

// ---------------------------------------------------------------- haiku (model-mix: Haiku 5.5)

// The first Claude Code release whose `haiku` alias is Haiku 5.5 on the Anthropic API.
export const HAIKU_55_SINCE = [2, 1, 293]

// The variables that move Claude Code off the Anthropic API (Bedrock, Google Cloud, Microsoft Foundry,
// Claude Platform on AWS, a gateway). register.js reads each by name; ANTHROPIC_BASE_URL is checked apart.
export const PROVIDER_FLAGS = [
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS',
  'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_GATEWAY',
]

function flagOn(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^(0|false|no|off)$/i.test(value.trim())
}

// [major, minor, patch] from $.session.version()'s answer (its release `base`, else `version`), else null.
export function parseVersion(v) {
  const text = v && typeof v === 'object' ? (typeof v.base === 'string' ? v.base : v.version) : null
  const m = typeof text === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim()) : null
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// Whether the haiku alias is Haiku 5.5 in this session: Claude Code 2.1.293 or later on the Anthropic API.
// version: $.session.version()'s answer, or null when it could not be read.
// env: the provider variables by name (unset ones absent), or null when they could not be read.
// ANTHROPIC_DEFAULT_HAIKU_MODEL, when set, is the model the alias runs: it must be a Haiku 5.5 or later id.
// Returns { ok: true } or { ok: false, why: 'provider' | 'remapped' | 'env' | 'old' | 'unknown' }; anything unread is not ok.
export function haikuAlias(version, env) {
  if (!env || typeof env !== 'object') return { ok: false, why: 'env' }
  if (PROVIDER_FLAGS.some(name => flagOn(env[name]))) return { ok: false, why: 'provider' }
  const base = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL.trim() : ''
  if (base && !/^https:\/\/api\.anthropic\.com(:443)?\/?$/i.test(base)) return { ok: false, why: 'provider' }
  const remap = typeof env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'string' ? env.ANTHROPIC_DEFAULT_HAIKU_MODEL.trim() : ''
  if (remap && haikuKind(remap) !== 'current') return { ok: false, why: 'remapped' }
  const v = parseVersion(version)
  if (!v) return { ok: false, why: 'unknown' }
  for (let i = 0; i < 3; i++) {
    if (v[i] !== HAIKU_55_SINCE[i]) return v[i] > HAIKU_55_SINCE[i] ? { ok: true } : { ok: false, why: 'old' }
  }
  return { ok: true }
}

// A Haiku model name: 'alias' (the bare `haiku`), 'current' (a pinned Haiku 5.5 or later id, any case),
// 'old' (any other Haiku id: Haiku 4.5, 3.5), or null for another family.
export function haikuKind(model) {
  if (typeof model !== 'string' || modelFamily(model) !== 'haiku') return null
  const m = model.trim().toLowerCase()
  if (m === 'haiku') return 'alias'
  const v = /haiku-(\d)(?:-(\d))?(?!\d)/.exec(m)
  return v && (Number(v[1]) > 5 || (Number(v[1]) === 5 && Number(v[2] || 0) >= 5)) ? 'current' : 'old'
}

// ctx.haiku: haikuAlias's answer for this session; a ctx without one (or an unread one) is not ok.
function haikuOf(ctx) {
  return ctx && ctx.haiku && typeof ctx.haiku === 'object' ? ctx.haiku : { ok: false, why: 'unknown' }
}

// ---------------------------------------------------------------- budget gate (rules 4, 5, 8)

// The redeem advice only when it pays (budget.md): a banked weekly reset is counted and weekly use is
// at or above 100 - reserve. A red caused by pace alone gets no such sentence.
function redReason(b) {
  const parts = []
  if (typeof b.margin === 'number') parts.push('margin ' + signed(b.margin))
  if (b.weekly) parts.push('weekly ' + Math.round(b.weekly.used) + '% used')
  if (b.weekly && b.weekly.resetsAt) parts.push('weekly reset ' + dateUtc(b.weekly.resetsAt, 'en'))
  const redeem = !!(b.resets && b.resets.length && b.weekly && b.plan && typeof b.plan.reserve === 'number'
    && b.weekly.used >= 100 - b.plan.reserve)
  return `Budget red (${parts.join(', ')}): model-guard did not run this launch. Start nothing new; finish open work only (a fix on a worker's own open PR, a final review in this session, merging what is green).`
    + (redeem ? ' A banked weekly reset is counted: ask the person to redeem it (Settings > Usage).' : '')
}

function pausedReason(b) {
  const at = b.fiveHour && b.fiveHour.resetsAt ? clockUtc(b.fiveHour.resetsAt) : null
  const used = b.fiveHour ? Math.round(b.fiveHour.used) + '%' : '90% or more'
  return at
    ? `The 5-hour window is at ${used}: model-guard paused new launches. Wait until ${at}, then launch; finish open work meanwhile.`
    : `The 5-hour window is at ${used}: model-guard paused new launches until it resets. Finish open work meanwhile.`
}

// ctx.fiveHourBanked: the plan line banks a 5-hour reset (budget.md: with a green weekly color, ask
// the person whether to redeem it instead of pausing; model-guard cannot redeem, so it still pauses).
function pausedGate(b, t, ctx) {
  const at = b.fiveHour && b.fiveHour.resetsAt ? clockUtc(b.fiveHour.resetsAt) : '?'
  const ask = b.color === 'green' && ctx && ctx.fiveHourBanked
    ? ' A 5-hour reset is banked and the weekly color is green: ask the person whether to redeem it (Settings > Usage) instead of waiting.'
    : ''
  return { deny: pausedReason(b) + ask, log: t.deniedPaused(at) }
}

// The gate on new work. ctx: { budget, redPolicy, lang, unknownLogged, fiveHourBanked?, fableLogged?, haiku? }
// An unknown color (no reading yet) always allows, with one line per stretch without a reading:
// a session that never gets a reading (an API key, say) must not be locked out. budget.md counts it red
// when nobody can be asked, but the mods API has no reliable unattended signal: session.start's
// isInteractive is false for the Desktop app (an SDK host) as for -p, and background sessions are not named.
// Returns { deny, log } | { note, unknownNoted? } | null.
export function launchGate(ctx) {
  const b = ctx.budget
  const t = texts(ctx.lang)
  const red = b.color === 'red'
  if (red && ctx.redPolicy !== 'warn') return { deny: redReason(b), log: t.deniedRed(b) }
  if (b.pausedFiveHour) return pausedGate(b, t, ctx)
  if (red) return { note: t.warnRed(b) }
  if (b.color === 'unknown' && !ctx.unknownLogged) return { note: t.unknown, unknownNoted: true }
  return null
}

function denied(gate) {
  return { action: 'deny', reason: gate.deny, log: gate.log, to: 'transcript' }
}

function joinLogs(...lines) {
  return lines.filter(Boolean).join(' · ')
}

function allowWith(gate, reason) {
  const d = { action: 'allow', reason, log: gate ? gate.note || '' : '', to: 'transcript' }
  if (gate && gate.unknownNoted) d.unknownNoted = true
  return d
}

function optionalString(value, field) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError(field + ' is not text')
  return value
}

// ---------------------------------------------------------------- Agent tool (rules 1, 2, 3 + gate)

// Fable never runs on an Agent call: a mod cannot read the Fable window, and budget.md runs no Fable
// stages when it is not readable. Any Fable name (`fable`, `claude-fable-5-1`, any case) becomes opus.
// The rewrite is logged to the transcript once (ctx.fableLogged after).
// The haiku alias is kept where it is Haiku 5.5 (ctx.haiku ok: Claude Code 2.1.293 or later on the
// Anthropic API) and the agent runs here; otherwise, or with isolation 'remote' (a cloud session on its
// own version), it becomes sonnet. A pinned Haiku 4.5 id becomes sonnet too (model-mix never pins it).
// An Explore agent without a model is broad reading: haiku at effort medium (unless an effort is given)
// where the alias is Haiku 5.5, else sonnet like the other inheriting types.
// isolation 'remote' starts a cloud session: it also needs a cloud slot in today's profile.
// ctx: launchGate's, plus haiku (haikuAlias's answer).
export function decideAgent(input, ctx) {
  const model = optionalString(input.model, 'model')
  const type = optionalString(input.subagent_type, 'subagent_type')
  const isolation = optionalString(input.isolation, 'isolation')
  const effort = optionalString(input.effort, 'effort')
  const t = texts(ctx.lang)
  const gate = launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  const p = ctx.budget.profile
  if (isolation === 'remote' && ctx.budget.color !== 'red' && p && p.cloud === 0) {
    return {
      action: 'deny',
      reason: `Today's profile is ${p.name} (budget ${ctx.budget.color}): no new cloud sessions, and isolation 'remote' starts one. Run the agent locally (leave out isolation: 'remote') or do the work in this session.`,
      log: t.cloudSolo(p),
      to: 'transcript',
    }
  }
  const h = haikuOf(ctx)
  const haikuHere = h.ok && isolation !== 'remote'
  const haikuWhy = isolation === 'remote' ? 'remote' : h.why || 'unknown'
  const family = modelFamily(model)
  const kind = haikuKind(model)
  let changes = null
  let line = ''
  let why = ''
  let fableNoted = false
  if (!model) {
    if (type === 'Explore' && haikuHere) {
      changes = effort ? { model: 'haiku' } : { model: 'haiku', effort: 'medium' }
      line = t.explore
      why = `Agent model set to haiku${effort ? '' : ', effort medium'}: Explore is broad reading, model-mix's Haiku row, and haiku is Haiku 5.5 here.`
    } else if (!type || INHERITING_TYPES.includes(type)) {
      changes = { model: 'sonnet' }
      line = t.agentNoModel
      why = `Agent model set to sonnet: ${type || 'the default type'} would inherit the session model.`
        + (type === 'Explore' ? ` Not haiku: ${HAIKU_WHY.model[haikuWhy]}.` : '')
    } else {
      const d = allowWith(gate, `Agent type ${type} has no model: its definition decides.`)
      d.log = joinLogs(d.log, t.ownModel(type))
      if (!gate) d.to = 'debug'
      return d
    }
  } else if (kind === 'alias' && !haikuHere) {
    changes = { model: 'sonnet' }
    line = t.haiku(haikuWhy)
    why = `Agent model haiku set to sonnet: ${HAIKU_WHY.model[haikuWhy]}.`
  } else if ((kind === 'alias' || kind === 'current') && !effort && (kind === 'current' || haikuHere)) {
    changes = { effort: 'medium' }
    why = `Agent effort set to medium: model-mix pairs Haiku with medium effort.`
  } else if (kind === 'old') {
    changes = { model: 'sonnet' }
    line = t.haikuOld
    why = `Agent model ${model} set to sonnet: model-mix never pins Haiku 4.5.`
  } else if (family === 'fable') {
    changes = { model: 'opus' }
    fableNoted = !ctx.fableLogged
    line = fableNoted ? t.fable : ''
    why = `Agent model ${model} set to opus: model-guard cannot read the Fable window, and budget.md runs no Fable stages when it is not readable.`
  }
  if (!changes) return allowWith(gate, 'Agent model kept: ' + model + '.')
  const d = { action: 'rewrite', input: { ...input, ...changes }, reason: why, log: joinLogs(gate && gate.note, line), to: 'transcript' }
  if (!d.log && family === 'fable') {
    d.log = t.fable
    d.to = 'debug'
  } else if (!d.log) {
    d.to = 'debug'
  }
  if (fableNoted) d.fableNoted = true
  if (gate && gate.unknownNoted) d.unknownNoted = true
  return d
}

// ---------------------------------------------------------------- Workflow tool (gate; Solo width 0)

// A resume (resumeFromRunId) finishes open work: allowed while red (redPolicy deny too) and on Solo,
// denied only while the 5-hour window is paused. A fresh run is new work and goes through the gate.
export function decideWorkflow(input, ctx) {
  optionalString(input.script, 'script')
  optionalString(input.name, 'name')
  optionalString(input.scriptPath, 'scriptPath')
  const resume = optionalString(input.resumeFromRunId, 'resumeFromRunId')
  const b = ctx.budget
  const t = texts(ctx.lang)
  if (resume) {
    if (b.pausedFiveHour) return denied(pausedGate(b, t, ctx))
    const gate = b.color === 'red' ? { note: t.resumeRed(b) } : launchGate(ctx)
    return allowWith(gate, 'Workflow resume allowed: it finishes open work.')
  }
  const gate = launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  if (b.color !== 'red' && b.profile && b.profile.width === 0) {
    return {
      action: 'deny',
      reason: `Today's profile is ${b.profile.name} (budget ${b.color}): no workflows. Do the work in this session, or one Agent call at most.`,
      log: t.wfSolo(b.profile),
      to: 'transcript',
    }
  }
  return allowWith(gate, 'Workflow allowed.')
}

// ---------------------------------------------------------------- RemoteTrigger (gate on launching actions)

// An update whose body sets enabled: false only stops a routine (what budget.md asks for at the limit),
// so it passes in any color. Any other update (enabling, rescheduling, a new prompt) is gated.
function disablesOnly(input) {
  const body = input.body
  return !!(body && typeof body === 'object' && !Array.isArray(body) && body.enabled === false)
}

export function decideRemoteTrigger(input, ctx) {
  const action = optionalString(input.action, 'action')
  if (!action || !LAUNCH_ACTIONS.includes(action)) return { action: 'allow', reason: 'RemoteTrigger read.', log: '' }
  if (action === 'update' && disablesOnly(input)) return { action: 'allow', reason: 'RemoteTrigger disable.', log: '' }
  const gate = launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  return allowWith(gate, 'RemoteTrigger allowed.')
}

// ---------------------------------------------------------------- shell commands (rules 4, 5, 7)

const SEPARATORS = new Set([';', '|', '&', '(', ')', '\n', '\r'])

// Reads a heredoc delimiter word at i (quotes and backslashes stripped). Returns { word, next }.
function heredocWord(command, i) {
  let word = ''
  while (i < command.length) {
    const c = command[i]
    if (c === ' ' || c === '\t' || SEPARATORS.has(c) || c === '<' || c === '>') break
    if (c === "'" || c === '"') {
      const close = command.indexOf(c, i + 1)
      if (close < 0) { word += command.slice(i + 1); i = command.length; break }
      word += command.slice(i + 1, close)
      i = close + 1
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[i + 1]
      i += 2
    } else {
      word += c
      i++
    }
  }
  return { word, next: i }
}

// From `from` (the start of a line), the index just past the line that ends a heredoc body, or -1
// when no line ends it. Unterminated bodies are scanned as commands: missing a real launch costs
// more than a false alarm (`$((1<<2))` also looks like a heredoc).
function heredocEnd(command, from, h) {
  let p = from
  while (p <= command.length) {
    const nl = command.indexOf('\n', p)
    const stop = nl < 0 ? command.length : nl
    let line = command.slice(p, stop)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (h.stripTabs) line = line.replace(/^\t+/, '')
    if (line === h.word) return nl < 0 ? command.length : nl + 1
    if (nl < 0) return -1
    p = nl + 1
  }
  return -1
}

// A PowerShell here-string opening at i (`@'` or `@"` closing its line): { end, body } with end just
// past its closing `'@` / `"@` at the start of a line, else null.
function hereString(command, i) {
  const q = command[i + 1]
  if (command[i] !== '@' || (q !== "'" && q !== '"')) return null
  const nl = command.indexOf('\n', i + 2)
  if (nl < 0 || command.slice(i + 2, nl).trim() !== '') return null
  const close = command.indexOf('\n' + q + '@', nl)
  if (close < 0) return null
  return { end: close + 3, body: command.slice(nl + 1, close).replace(/\r$/, '') }
}

// Splits a shell line (Bash or PowerShell) into segments of tokens { value, start, end }.
// Never throws on odd input: an unclosed quote runs to the end of the line.
// Heredoc bodies (`<<EOF`, `<<-'EOF'`, several on one line) are data and add no tokens; a PowerShell
// here-string (`@'` ... `'@`) is one token holding its body, never split into commands (only a
// nested `pwsh -Command @'...'@` reads it as a script). Even an unquoted `<<EOF` or `@"` body, which
// the shell expands, is skipped: a launch hidden in a `$(...)` there is far rarer than commit, PR and
// brief texts that only mention `claude --cloud`. A heredoc inside a `$(...)` inside double quotes
// (Claude Code's commit and PR idiom `"$(cat <<'EOF' ... EOF\n)"`) is data too: its body stays in the
// quoted token, and its quotes never close the string.
// skill-router's routes.js holds a copy of this tokenizer: keep the two identical.
export function tokenize(command) {
  const segments = [[]]
  let tok = null
  let heredocs = []
  const push = () => {
    if (tok) { segments[segments.length - 1].push(tok); tok = null }
  }
  const startTok = i => { if (!tok) tok = { value: '', start: i, end: i } }
  let i = 0
  while (i < command.length) {
    const c = command[i]
    if (c === ' ' || c === '\t') { push(); i++; continue }
    if (c === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
      push()
      let j = i + 2
      const stripTabs = command[j] === '-'
      if (stripTabs) j++
      while (command[j] === ' ' || command[j] === '\t') j++
      const { word, next } = heredocWord(command, j)
      if (word) heredocs.push({ word, stripTabs })
      i = next
      continue
    }
    if (SEPARATORS.has(c)) {
      push()
      if (segments[segments.length - 1].length) segments.push([])
      i += (c === '&' || c === '|') && command[i + 1] === c ? 2 : 1
      if (c === '\n' && heredocs.length) {
        for (const h of heredocs) {
          const end = heredocEnd(command, i, h)
          if (end < 0) break
          i = end
        }
        heredocs = []
      }
      continue
    }
    const here = c === '@' ? hereString(command, i) : null
    if (here) {
      startTok(i)
      tok.value += here.body
      i = here.end
      tok.end = i
      continue
    }
    startTok(i)
    if (c === "'") {
      const close = command.indexOf("'", i + 1)
      const stop = close < 0 ? command.length : close
      tok.value += command.slice(i + 1, stop)
      i = close < 0 ? command.length : close + 1
    } else if (c === '"') {
      let subs = 0 // open `$(` inside this string
      let inner = [] // heredocs opened inside them, waiting for the end of their line
      i++
      while (i < command.length && command[i] !== '"') {
        const d = command[i]
        if (d === '$' && command[i + 1] === '(') {
          subs++
          tok.value += '$('
          i += 2
          continue
        }
        if (d === ')' && subs > 0) subs--
        if (subs > 0 && d === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
          let j = i + 2
          const stripTabs = command[j] === '-'
          if (stripTabs) j++
          while (command[j] === ' ' || command[j] === '\t') j++
          const { word, next } = heredocWord(command, j)
          if (word) inner.push({ word, stripTabs })
          tok.value += command.slice(i, next)
          i = next
          continue
        }
        if (d === '\n' && inner.length) {
          let p = i + 1
          for (const h of inner) {
            const end = heredocEnd(command, p, h)
            if (end < 0) { p = -1; break }
            p = end
          }
          inner = []
          if (p > 0) {
            tok.value += command.slice(i, p)
            i = p
            continue
          }
        }
        if ((d === '\\' || d === '`') && (command[i + 1] === '"' || command[i + 1] === '\\' || command[i + 1] === '`')) {
          tok.value += command[i + 1]
          i += 2
        } else {
          tok.value += d
          i++
        }
      }
      i++
    } else {
      tok.value += c
      i++
    }
    tok.end = Math.min(i, command.length)
  }
  push()
  return segments.filter(s => s.length)
}

function baseName(value) {
  const parts = value.split(/[\\/]/)
  return parts[parts.length - 1].toLowerCase()
}

function isClaude(value) {
  return /^claude(\.exe|\.cmd|\.ps1)?$/.test(baseName(value))
}

// Index of the segment's command word, past `VAR=value` and prefix words.
function commandIndex(seg) {
  let i = 0
  while (i < seg.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i].value) || PREFIX_WORDS.includes(seg[i].value))) i++
  return i < seg.length ? i : -1
}

function flagValue(args, name) {
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value
    if (v === name) return { present: true, value: args[i + 1] ? args[i + 1].value : null }
    if (v.startsWith(name + '=')) return { present: true, value: v.slice(name.length + 1) }
  }
  return { present: false, value: null }
}

const SHELLS = /^(bash|sh|zsh|dash|pwsh|powershell|cmd)(\.exe)?$/
const SCRIPT_FLAG = /^(-[a-z]*c|-command|\/c|\/k)$/i
// Shells whose script flag takes the rest of the line (bash -c takes one word; the rest are $0, $1...).
const REST_SHELLS = /^(pwsh|powershell|cmd)(\.exe)?$/
const STARTERS = ['start-process', 'start', 'saps']

// The scripts a nested shell may run (`bash -lc "..."`, `pwsh -Command "..."`, `cmd /c "..."`), in the
// order to try, else null. For cmd and PowerShell the script flag takes the rest of the segment: an
// unquoted script (`cmd /c claude --cloud x`) is that raw text, a synthetic token. A quoted script with
// more words after it is tried as the quoted text first (`cmd /c "claude --cloud x" 2>&1`, where the
// rest is the outer shell's redirection), then as the rest of the segment (`cmd /c "claude" --cloud x`).
function nestedScripts(command, seg, ci) {
  const shell = baseName(seg[ci].value)
  if (!SHELLS.test(shell)) return null
  for (let j = ci + 1; j < seg.length - 1; j++) {
    if (!SCRIPT_FLAG.test(seg[j].value)) continue
    if (!REST_SHELLS.test(shell) || j + 2 >= seg.length) return [seg[j + 1]]
    const start = seg[j + 1].start
    const end = seg[seg.length - 1].end
    const rest = { value: command.slice(start, end), start, end, synthetic: true }
    const q = command[start]
    return q === '"' || q === "'" || q === '@' ? [seg[j + 1], rest] : [rest]
  }
  return null
}

function hasFlag(values, ...names) {
  return values.some(v => names.includes(v) || names.some(n => v.startsWith(n + '=')))
}

// What a claude command line starts, from its argument values: 'cloud', 'local', 'resume' or null.
//   `--cloud` with `-p`/`--print` (and no `--environment`) only queues a message to an existing cloud
//   session (`claude -p "<msg>" --cloud <session_id|cse_id|url>`): steering open work, null. Without a
//   terminal --cloud cannot create a session; `-p --environment <id> --cloud` does, so it stays a launch.
//   `--cloud` otherwise: a new cloud session.
//   `-p`/`--print` or `--bg`/`--background` without --cloud: a local headless session. With
//   `-r`/`--resume`, `-c`/`--continue` or `--from-pr` (and no `--fork-session`) it carries on an existing
//   local session: 'resume', open work. Otherwise (--fork-session included) a new one: 'local'.
//   A management subcommand (`claude plugin ...`), --version or --help: null. An interactive session
//   (`claude`, `claude --resume abc`) is no delegated launch: null.
export function claudeLaunch(values) {
  if (hasFlag(values, '--cloud')) return hasFlag(values, '-p', '--print') && !hasFlag(values, '--environment') ? null : 'cloud'
  if (MANAGEMENT.includes(values[0]) || hasFlag(values, '--version', '-v', '--help', '-h')) return null
  if (!hasFlag(values, '-p', '--print', '--bg', '--background')) return null
  if (hasFlag(values, '-r', '--resume', '-c', '--continue', '--from-pr') && !hasFlag(values, '--fork-session')) return 'resume'
  return 'local'
}

// ---------------------------------------------------------------- indirect launches (Start-Process, start)
// What a starter hands claude is a Windows command line, and re-reading its quoting kept letting launches
// through. So the argument list is never read: only which program the starter runs, from the starter's
// own parameters, and claude there is refused whatever its arguments say.
// skill-router's routes.js holds a copy of this block: keep the two identical.

// Start-Process's switches and the parameters that take a value. PowerShell accepts any prefix of a name
// (`-NoNew`, `-File`) and `-Name:value` as one word; an unknown name is taken to have a value.
const START_SWITCHES = ['wait', 'nonewwindow', 'nnw', 'passthru', 'loaduserprofile', 'lup', 'usenewenvironment', 'verbose', 'debug', 'whatif', 'confirm']
const START_VALUED = ['argumentlist', 'args', 'workingdirectory', 'windowstyle', 'verb', 'credential', 'environment', 'redirectstandardinput', 'redirectstandardoutput', 'redirectstandarderror', 'rsi', 'rso', 'rse']
const START_FILE = ['filepath', 'path', 'pspath']
// cmd's start switches that take the next word (`/D C:\dir`); the others (`/MIN`, `/WAIT`, `/B`) take none.
const CMD_VALUED = ['d', 'node', 'affinity']

function startSwitch(name) {
  return START_SWITCHES.some(s => s.startsWith(name)) && ![...START_VALUED, ...START_FILE].some(v => v.startsWith(name))
}

// The words after a starter, as units: a word, or a `( ... )` group with what touches it (`@('a','b')`,
// `(Get-Command claude).Source`). The statement runs on past breaks made only of parentheses (and of
// newlines inside them, or after a ` or \ line continuation) and ends at any other separator.
function starterUnits(command, segments, k, ci) {
  const units = []
  let prev = segments[k][ci]
  let depth = 0
  let carry = false
  for (let s = k; s < segments.length; s++) {
    for (let j = s === k ? ci + 1 : 0; j < segments[s].length; j++) {
      const tok = segments[s][j]
      let apart = !units.length
      for (const ch of command.slice(prev.end, tok.start)) {
        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)
        else if (ch === ' ' || ch === '\t' || ((ch === '\n' || ch === '\r') && (depth > 0 || carry))) apart = apart || depth === 0
        else return units
      }
      prev = tok
      carry = /^[`\\]$/.test(command.slice(tok.start, tok.end))
      if (carry) continue
      if (apart) units.push([tok])
      else units[units.length - 1].push(tok)
    }
  }
  return units
}

// Whether a starter (Start-Process, start, saps, cmd's start) runs claude: the -FilePath value when one
// is given, else the first positional word; cmd's start takes a double-quoted first word as the window
// title (`start "" claude`). A path counts (`C:\x\claude.exe`), and so does a group naming claude
// (`(Get-Command claude).Source`).
function startsClaude(command, segments, k, ci) {
  const units = starterUnits(command, segments, k, ci)
  const names = u => u.some(t => isClaude(t.value))
  // The last unit of a value: PowerShell's array commas (`'a', 'b'`) carry it on.
  const valueEnd = j => {
    while (j + 1 < units.length && (command[units[j][units[j].length - 1].end - 1] === ',' || command[units[j + 1][0].start] === ',')) j++
    return j
  }
  let file = null // null: no -FilePath; else whether one names claude
  const positional = []
  for (let i = 0; i < units.length; i++) {
    const word = units[i].length === 1 ? units[i][0].value : ''
    const param = /^-([a-z][a-z0-9]*)(?::([\s\S]*))?$/i.exec(word)
    if (param) {
      const name = param[1].toLowerCase()
      if (START_FILE.some(f => f.startsWith(name))) {
        file = !!file || names(param[2] !== undefined ? [{ value: param[2] }] : units[i + 1] || [])
        if (param[2] === undefined) i = valueEnd(i + 1)
      } else if (param[2] === undefined && !startSwitch(name)) i = valueEnd(i + 1)
      continue
    }
    const sw = /^\/\/?([a-z][^/]*)$/i.exec(word)
    if (sw && !isClaude(word)) {
      if (CMD_VALUED.includes(sw[1].toLowerCase())) i = valueEnd(i + 1)
      continue
    }
    positional.push(units[i])
  }
  if (file !== null) return file
  if (!positional.length) return false
  if (names(positional[0])) return true
  const title = baseName(segments[k][ci].value) === 'start' && command[positional[0][0].start] === '"'
  return title && positional.length > 1 && names(positional[1])
}

// The launches a command line holds:
//   { kind: 'cloud', hasModel, model, insertAt }  for `claude ... --cloud ...` (not a -p follow-up)
//   { kind: 'local', hasModel, model, insertAt }  for `claude -p ...`, `claude --bg ...` (headless, local)
//   { kind: 'resume', hasModel, model, insertAt } for `claude --resume <id> -p ...`, `claude -c --bg ...`
//     (insertAt null when the launch sits inside a nested shell's script that cannot be edited in place)
//   { kind: 'launchExp', model }                  for `expect .../launch.exp <task> <rules> <log> <model> <effort>`
//   { kind: 'indirect' }                          for claude run by Start-Process (start, saps) or cmd's start,
//     whatever its arguments: they are never read
// Nested shells (`bash -c "claude --cloud ..."`) are read too, up to 3 levels deep.
export function scanShell(command, depth = 0) {
  if (typeof command !== 'string') throw new TypeError('command is not text')
  if (!/claude|launch\.exp/i.test(command)) return []
  const launches = []
  const segments = tokenize(command)
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k]
    const ci = commandIndex(seg)
    if (ci < 0) continue
    const word = seg[ci]
    const scripts = depth < 3 ? nestedScripts(command, seg, ci) : null
    if (scripts) {
      for (const script of scripts) {
        const found = scanShell(script.value, depth + 1)
        if (!found.length) continue
        const raw = command.slice(script.start, script.end)
        const quote = !script.synthetic && (raw[0] === '"' || raw[0] === "'") ? raw[0] : ''
        // Offsets map back only when the script token is the plain text in one pair of quotes (or none).
        const exact = raw === quote + script.value + quote
        for (const inner of found) {
          if (inner.kind === 'launchExp' || inner.kind === 'indirect') launches.push(inner)
          else launches.push({ ...inner, insertAt: exact && inner.insertAt !== null ? script.start + quote.length + inner.insertAt : null })
        }
        break
      }
      continue
    }
    if (STARTERS.includes(baseName(word.value))) {
      if (startsClaude(command, segments, k, ci)) launches.push({ kind: 'indirect' })
      continue
    }
    if (isClaude(word.value)) {
      const args = seg.slice(ci + 1)
      const kind = claudeLaunch(args.map(a => a.value))
      if (!kind) continue
      const m = flagValue(args, '--model')
      launches.push({ kind, hasModel: m.present, model: m.value, insertAt: word.end })
      continue
    }
    let li = -1
    if (baseName(word.value) === 'launch.exp') li = ci
    else if (/^expect(\.exe)?$/.test(baseName(word.value))) {
      let j = ci + 1
      while (j < seg.length && seg[j].value.startsWith('-')) j++
      if (j < seg.length && baseName(seg[j].value) === 'launch.exp') li = j
    }
    if (li < 0) continue
    const arg = seg[li + 4]
    launches.push({ kind: 'launchExp', model: arg ? arg.value : null })
  }
  return launches
}

// Models no session started from a shell may run: any Fable ('fable'); the bare haiku alias ('haiku'),
// because a cloud session runs its own Claude Code version and a headless one may run on another provider,
// where the alias is still Haiku 4.5; and a pinned Haiku 4.5 id ('haiku-4-5'; model-mix never pins it).
// A pinned Haiku 5.5 id (claude-haiku-5-5) is allowed.
export function forbiddenModel(model) {
  if (typeof model !== 'string' || !model) return null
  if (modelFamily(model) === 'fable') return 'fable'
  const kind = haikuKind(model)
  if (kind === 'alias') return 'haiku'
  if (kind === 'old') return 'haiku-4-5'
  return null
}

// The deny reason's opening and advice for a forbidden shell model, by forbiddenModel's answer.
function shellModelText(bad) {
  if (bad === 'fable') return { name: 'Fable', log: 'fable', fix: 'use --model sonnet, or --model opus for security-critical work.' }
  if (bad === 'haiku-4-5') return { name: 'Haiku 4.5', log: 'Haiku 4.5', fix: 'model-mix never pins Haiku 4.5. Pin --model claude-haiku-5-5 for a small mechanical ticket, --model sonnet for implementation, or --model opus for security-critical work.' }
  return { name: 'the bare haiku alias', log: 'haiku', fix: 'the alias follows the Claude Code version and provider that session runs on, and is still Haiku 4.5 before 2.1.293 or off the Anthropic API. Pin the full id --model claude-haiku-5-5 for a small mechanical ticket, --model sonnet for implementation, or --model opus for security-critical work.' }
}

// A claude launch that takes --model on its own command line (cloud or local headless). A local resume
// carries on a session that already has its model: model-guard adds none there.
function namesModel(l) {
  return l.kind === 'cloud' || l.kind === 'local'
}

export function insertModelFlags(command, launches) {
  let out = command
  const points = launches.filter(l => namesModel(l) && !l.hasModel && typeof l.insertAt === 'number').map(l => l.insertAt).sort((a, b) => b - a)
  for (const at of points) out = out.slice(0, at) + ' --model sonnet' + out.slice(at)
  return out
}

// launches: scanShell(input.command), computed by the caller before it reads the budget.
// Cloud, local headless (-p, --bg) and launch.exp launches all pass the gate (red, paused) and the
// model check; only cloud ones (and launch.exp) need a cloud slot in today's profile.
// A command whose launches are all local resumes (--resume, --continue or --from-pr with -p or --bg)
// finishes open work, as a Workflow resume does: allowed while red (redPolicy deny too) and on Solo,
// denied only while the 5-hour window is paused. It gets no --model, but an explicit Fable, bare
// haiku or Haiku 4.5 id is still denied. Next to a new launch, the command goes through the gate as a whole.
// claude run by Start-Process or cmd's start is denied in every color, before the gate: model-guard does
// not read what it hands claude, so the model runs the same launch directly.
export function decideShell(input, ctx, launches) {
  const found = launches || scanShell(input.command)
  if (!found.length) return { action: 'allow', reason: 'No launch in this command.', log: '' }
  const b = ctx.budget
  const t = texts(ctx.lang)
  if (found.some(l => l.kind === 'indirect')) {
    return {
      action: 'deny',
      reason: 'model-guard does not read claude launches started through Start-Process (start, saps) or cmd\'s start, so this command was not run. Run the same launch directly as a claude command, for example claude --cloud "<task>" or claude -p "<msg>" --cloud <session>.',
      log: t.indirect,
      to: 'transcript',
    }
  }
  const resumesOnly = found.every(l => l.kind === 'resume')
  if (resumesOnly && b.pausedFiveHour) return denied(pausedGate(b, t, ctx))
  const gate = resumesOnly && b.color === 'red' ? { note: t.resumeRed(b, 'session') } : launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  for (const l of found) {
    const bad = forbiddenModel(l.model)
    if (!bad) continue
    const m = shellModelText(bad)
    if (l.kind === 'cloud') {
      return {
        action: 'deny',
        reason: `Cloud sessions never run ${m.name} (model-mix): ${m.fix}`,
        log: t.cloudBad(m.log),
        to: 'transcript',
      }
    }
    if (l.kind === 'local' || l.kind === 'resume') {
      return {
        action: 'deny',
        reason: `Headless and background sessions (claude -p, --bg) never run ${m.name} (model-mix): ${m.fix}`,
        log: t.localBad(m.log),
        to: 'transcript',
      }
    }
    return {
      action: 'deny',
      reason: `launch.exp's model argument (the 4th) is ${l.model}: cloud sessions never run ${m.name} (model-mix): ${m.fix.replace(/--model /g, '')}`,
      log: t.launchBad(m.log),
      to: 'transcript',
    }
  }
  // Yellow steps the profile down with its cloud-session column: Solo (Pro yellow) allows no new ones.
  // Red is the gate's (with redPolicy warn it only flags); model-guard cannot count running sessions.
  const p = ctx.budget.profile
  if (ctx.budget.color !== 'red' && p && p.cloud === 0 && found.some(l => l.kind === 'cloud' || l.kind === 'launchExp')) {
    return {
      action: 'deny',
      reason: `Today's profile is ${p.name} (budget ${ctx.budget.color}): no new cloud sessions. Do the work in this session; finishing open work (a fix message to a worker on its own open PR, claude -p "<msg>" --cloud <session>) continues.`,
      log: t.cloudSolo(p),
      to: 'transcript',
    }
  }
  if (found.some(l => namesModel(l) && !l.hasModel && l.insertAt === null)) {
    return {
      action: 'deny',
      reason: 'This command starts claude (--cloud, -p or --bg) inside a nested shell script without --model, and model-guard cannot add it there. Run it again with --model sonnet (or --model opus for security-critical work) on that claude command.',
      log: t.nested,
      to: 'transcript',
    }
  }
  const unnamed = found.filter(l => namesModel(l) && !l.hasModel)
  if (unnamed.length) {
    const d = {
      action: 'rewrite',
      input: { ...input, command: insertModelFlags(input.command, found) },
      reason: 'Added --model sonnet to each claude launch without one (--cloud, -p or --bg): model-mix names the model on every delegated session.',
      log: joinLogs(gate && gate.note, unnamed.some(l => l.kind === 'cloud') && t.cloudModel, unnamed.some(l => l.kind === 'local') && t.localModel),
      to: 'transcript',
    }
    if (gate && gate.unknownNoted) d.unknownNoted = true
    return d
  }
  return allowWith(gate, resumesOnly ? 'Session resume allowed: it finishes open work.' : 'Launch allowed.')
}

// ---------------------------------------------------------------- workflow agents at agent.spawn (rules 3, 6)

// run: what the caller knows of this runId, { admitted: Set of agentIndex, width, name }, or undefined
// for a run never seen. A known run keeps the width that applied at its first agent, so a run that
// started before red (or before a step down) finishes at its own width: red blocks only new work,
// and the first agent of an unseen run while red is new work (today's width 0).
// Any Fable (pinned or inherited) is denied; the haiku alias passes where it is Haiku 5.5 (ctx.haiku ok)
// and is denied otherwise; a pinned Haiku 4.5 id is denied; a pinned Haiku 5.5 id passes.
// A decision may carry, for the caller to apply synchronously after this call:
//   startRun { width, name }  record this run (only when it was not known)
//   admit: true               add this agentIndex to the run's admitted set
export function decideWorkflowAgent(input, ctx, run) {
  const wf = input.workflow
  if (!wf || typeof wf !== 'object') throw new TypeError('workflow is missing')
  if (typeof wf.runId !== 'string') throw new TypeError('workflow.runId is not text')
  if (typeof wf.agentIndex !== 'number' || !Number.isFinite(wf.agentIndex)) throw new TypeError('workflow.agentIndex is not a number')
  const model = optionalString(input.model, 'model')
  const type = optionalString(input.subagentType, 'subagentType')
  const parent = optionalString(input.parentModel, 'parentModel')
  const t = texts(ctx.lang)
  const inherits = !model && (!type || INHERITING_TYPES.includes(type))
  const effective = model || (inherits ? parent : undefined)
  const b = ctx.budget
  const today = b.profile || { name: 'Solo', width: 0 }
  const known = !!(run && run.admitted instanceof Set && typeof run.width === 'number')
  // A run first seen while its width is above 0 has started: record it even when this agent is refused
  // for its model, so its other agents keep that width if the budget turns red meanwhile.
  // A run admitted while red under redPolicy warn (today's width 0) records the plan's own width, so it
  // is not cut off at 0 once the budget leaves red.
  const warnAdmits = b.color === 'red' && ctx.redPolicy === 'warn' && today.width === 0
  const base = warnAdmits && b.plan && PROFILES[b.plan.name] ? PROFILES[b.plan.name] : today
  const startRun = known ? undefined : { width: base.width, name: base.name }
  const withRun = d => (startRun && (d.admit || today.width > 0) ? { ...d, startRun } : d)
  if (modelFamily(effective) === 'fable') {
    return withRun({
      action: 'deny',
      reason: model
        ? "Workflow agents never run on Fable (model-mix). Pin { model: 'opus', effort: 'high' } on this agent() call and run the stage again."
        : "This agent() has no model and would inherit the session's Fable. Pin { model: 'opus', effort: 'high' } (or 'sonnet' for fan-out stages) and run the stage again.",
      log: t.wfFable,
      to: 'transcript',
    })
  }
  // The model this agent runs: its own, or the session's when it inherits (as the Fable check above).
  const kind = haikuKind(effective)
  const h = haikuOf(ctx)
  if (kind === 'alias' && !h.ok) {
    const why = h.why || 'unknown'
    return withRun({
      action: 'deny',
      reason: `${model ? 'The haiku alias' : "This agent() has no model and would inherit the session's haiku alias, which"} is not Haiku 5.5 here: ${HAIKU_WHY.model[why]}. Pin { model: 'sonnet', effort: 'high' } on this agent() call and run the stage again.`,
      log: t.wfHaiku(why),
      to: 'transcript',
    })
  }
  if (kind === 'old') {
    return withRun({
      action: 'deny',
      reason: `model-mix never pins Haiku 4.5 (${effective}${model ? '' : ", inherited from the session"}). Pin ${h.ok ? "{ model: 'haiku', effort: 'medium' } for a reading stage or " : ''}{ model: 'sonnet', effort: 'high' } on this agent() call and run the stage again.`,
      log: t.wfHaikuOld,
      to: 'transcript',
    })
  }
  const seen = known ? run.admitted : new Set()
  if (seen.has(wf.agentIndex)) return { action: 'allow', reason: 'Agent already counted for this run.', log: '' }
  const limit = known ? { name: typeof run.name === 'string' ? run.name : today.name, width: run.width } : today
  if (seen.size >= limit.width) {
    if (b.color === 'red' && ctx.redPolicy === 'warn') {
      return withRun({ action: 'allow', admit: true, reason: 'Past the width, allowed by redPolicy warn.', log: t.wfWidthWarn(limit), to: 'transcript' })
    }
    return {
      action: 'deny',
      reason: limit.width === 0
        ? `Budget ${b.color}: today's profile ${limit.name} allows no new workflow runs, so this agent was not started. Let the run end with what it has and finish open work in this session.`
        : `This workflow run already started ${seen.size} agents; profile ${limit.name}, which applied when the run started, allows ${limit.width} per run (budget now ${b.color}). This agent was not started: let the run finish with what it has, or narrow the next run.`,
      log: t.wfWidth(limit),
      to: 'transcript',
    }
  }
  return withRun({ action: 'allow', admit: true, reason: 'Workflow agent within width.', log: '' })
}

// ---------------------------------------------------------------- status line and catch

// The pinned status text while red, undefined otherwise.
export function statusText(budget, redPolicy, lang) {
  if (!budget || budget.color !== 'red') return undefined
  return texts(lang).status(budget, redPolicy === 'warn')
}

export function failureReason(kind) {
  return `model-guard could not check this launch (${kind || 'error'}), so it was not run. Try once more; if it fails again, tell the person.`
}
