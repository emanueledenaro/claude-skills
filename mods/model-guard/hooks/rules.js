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
    remote: 'agente in cloud: la sessione cloud ha la sua versione',
  },
  en: {
    old: 'before Claude Code 2.1.293 haiku is Haiku 4.5',
    unknown: 'Claude Code version not read, haiku may be Haiku 4.5',
    provider: 'off the Anthropic API haiku is Haiku 4.5',
    env: 'environment not read, haiku may be Haiku 4.5',
    remapped: 'ANTHROPIC_DEFAULT_HAIKU_MODEL points haiku at another model',
    remote: 'cloud agent: the cloud session runs its own version',
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
    agentNoModel: 'model-guard: agente senza modello -> sonnet',
    explore: kept => `model-guard: Explore senza modello -> haiku${kept ? '' : ', effort medium'}`,
    haiku: why => `model-guard: haiku -> sonnet (${HAIKU_WHY.it[why] || HAIKU_WHY.it.unknown})`,
    haikuOld: 'model-guard: Haiku 4.5 -> sonnet (model-mix non fissa mai Haiku 4.5)',
    fable: 'model-guard: fable -> opus sugli agenti (un mod non legge la finestra Fable: niente Fable fuori dalla sessione principale)',
    ownModel: t => `model-guard: tipo ${t} senza modello, lasciato al modello della sua definizione`,
    deniedRed: b => `model-guard: lancio bloccato, budget rosso (${budgetBrief(b, 'it')})`,
    deniedPaused: at => `model-guard: lancio bloccato, finestra 5 ore oltre il 90%${at ? ' fino alle ' + at : ''}`,
    warnRed: b => `model-guard: budget rosso (${budgetBrief(b, 'it')}), lancio consentito (solo segnalato)`,
    resumeRed: (b, what) => `model-guard: budget rosso (${budgetBrief(b, 'it')}), ripresa ${what === 'session' ? 'della sessione' : 'del workflow'} consentita (lavoro aperto)`,
    unknown: 'model-guard: nessuna lettura del budget ancora, lancio consentito',
    unknownStale: 'model-guard: lettura del budget scaduta, lancio consentito',
    cloudModel: 'model-guard: claude --cloud senza --model -> --model sonnet',
    localModel: 'model-guard: claude -p/--bg senza --model -> --model sonnet',
    nested: 'model-guard: lancio di claude senza --model in uno script annidato, bloccato',
    cloudBad: m => `model-guard: sessione cloud con modello ${m} bloccata`,
    localBad: m => `model-guard: sessione headless con modello ${m} bloccata`,
    launchBad: (m, script) => `model-guard: ${script || 'launch.exp'} con modello ${m} bloccato`,
    unparsed: 'model-guard: claude con -p, --cloud o --bg in un punto che model-guard non legge, bloccato: va lanciato claude direttamente con --model',
    modelUnread: 'model-guard: lancio di claude con un --model vuoto o variabile, bloccato',
    wfFable: 'model-guard: agente di workflow su Fable bloccato, va fissato opus',
    spawnFable: why => `model-guard: agente su Fable bloccato (${why === 'fork' ? 'un fork gira sul modello della sessione' : why === 'definition' ? 'il suo tipo può ereditare il modello della sessione' : 'eredita il modello della sessione'}), va usato general-purpose con opus`,
    spawnHaiku: why => `model-guard: agente su haiku bloccato (${HAIKU_WHY.it[why] || HAIKU_WHY.it.unknown}), va fissato sonnet`,
    spawnHaikuOld: 'model-guard: agente su Haiku 4.5 bloccato, va fissato sonnet o claude-haiku-5-5',
    routineBad: m => `model-guard: routine con modello ${m} bloccata`,
    wfHaiku: why => `model-guard: agente di workflow su haiku bloccato (${HAIKU_WHY.it[why] || HAIKU_WHY.it.unknown}), va fissato sonnet`,
    wfHaikuOld: 'model-guard: agente di workflow su Haiku 4.5 bloccato, va fissato sonnet o claude-haiku-5-5',
    wfWidth: p => `model-guard: workflow oltre la larghezza ${p.width} (${profileLabel(p, 'it')}), altri agenti bloccati`,
    wfWidthWarn: p => `model-guard: workflow oltre la larghezza ${p.width} (${profileLabel(p, 'it')}), altri agenti consentiti (solo segnalato)`,
    wfSolo: p => `model-guard: workflow bloccato, il profilo di oggi (${profileLabel(p, 'it')}) non ne consente`,
    cloudSolo: p => `model-guard: sessione cloud bloccata, il profilo di oggi (${profileLabel(p, 'it')}) non ne consente`,
    indirect: 'model-guard: lancio di claude tramite Start-Process o start bloccato, va lanciato direttamente',
    failed: 'model-guard: controllo fallito, lancio bloccato',
    status: (b, warn) => `model-guard: budget rosso · ${budgetBrief(b, 'it')} · ${warn ? 'lanci solo segnalati' : 'nuovi lanci bloccati'}`,
  },
  en: {
    red: 'red', yellow: 'yellow', green: 'green', unknown: 'unknown',
    agentNoModel: 'model-guard: agent without a model -> sonnet',
    explore: kept => `model-guard: Explore without a model -> haiku${kept ? '' : ', effort medium'}`,
    haiku: why => `model-guard: haiku -> sonnet (${HAIKU_WHY.en[why] || HAIKU_WHY.en.unknown})`,
    haikuOld: 'model-guard: Haiku 4.5 -> sonnet (model-mix never pins Haiku 4.5)',
    fable: 'model-guard: fable -> opus on agents (a mod cannot read the Fable window: no Fable outside the main session)',
    ownModel: t => `model-guard: type ${t} has no model, left to its definition's model`,
    deniedRed: b => `model-guard: launch blocked, budget red (${budgetBrief(b, 'en')})`,
    deniedPaused: at => `model-guard: launch blocked, 5-hour window past 90%${at ? ' until ' + at : ''}`,
    warnRed: b => `model-guard: budget red (${budgetBrief(b, 'en')}), launch allowed (only flagged)`,
    resumeRed: (b, what) => `model-guard: budget red (${budgetBrief(b, 'en')}), ${what === 'session' ? 'session' : 'workflow'} resume allowed (open work)`,
    unknown: 'model-guard: no budget reading yet, launch allowed',
    unknownStale: 'model-guard: budget reading out of date, launch allowed',
    cloudModel: 'model-guard: claude --cloud without --model -> --model sonnet',
    localModel: 'model-guard: claude -p/--bg without --model -> --model sonnet',
    nested: 'model-guard: claude launch without --model inside a nested script, blocked',
    cloudBad: m => `model-guard: cloud session on ${m} blocked`,
    localBad: m => `model-guard: headless session on ${m} blocked`,
    launchBad: (m, script) => `model-guard: ${script || 'launch.exp'} on ${m} blocked`,
    unparsed: 'model-guard: claude with -p, --cloud or --bg where model-guard cannot read it, blocked: run claude directly with --model',
    modelUnread: 'model-guard: claude launch with an empty or variable --model, blocked',
    wfFable: 'model-guard: workflow agent on Fable blocked, pin opus',
    spawnFable: why => `model-guard: agent on Fable blocked (${why === 'fork' ? 'a fork runs on the session model' : why === 'definition' ? 'its type may inherit the session model' : 'it inherits the session model'}), use general-purpose with opus`,
    spawnHaiku: why => `model-guard: agent on haiku blocked (${HAIKU_WHY.en[why] || HAIKU_WHY.en.unknown}), pin sonnet`,
    spawnHaikuOld: 'model-guard: agent on Haiku 4.5 blocked, pin sonnet or claude-haiku-5-5',
    routineBad: m => `model-guard: routine on ${m} blocked`,
    wfHaiku: why => `model-guard: workflow agent on haiku blocked (${HAIKU_WHY.en[why] || HAIKU_WHY.en.unknown}), pin sonnet`,
    wfHaikuOld: 'model-guard: workflow agent on Haiku 4.5 blocked, pin sonnet or claude-haiku-5-5',
    wfWidth: p => `model-guard: workflow past width ${p.width} (${profileLabel(p, 'en')}), further agents blocked`,
    wfWidthWarn: p => `model-guard: workflow past width ${p.width} (${profileLabel(p, 'en')}), further agents allowed (only flagged)`,
    wfSolo: p => `model-guard: workflow blocked, today's profile (${profileLabel(p, 'en')}) allows none`,
    cloudSolo: p => `model-guard: cloud session blocked, today's profile (${profileLabel(p, 'en')}) allows none`,
    indirect: 'model-guard: claude launch through Start-Process or start blocked, run it directly',
    failed: 'model-guard: check failed, launch blocked',
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

// A profile's name in the person's lines: the Red profile reads as the color, in their language.
function profileLabel(p, lang) {
  return p && p.name === 'Red' ? (lang === 'it' ? 'rosso' : 'red') : p ? p.name : ''
}

function budgetBrief(b, lang) {
  const it = lang === 'it'
  const parts = []
  if (typeof b.margin === 'number') parts.push((it ? 'margine ' : 'margin ') + signed(b.margin))
  if (b.weekly) parts.push((it ? 'settimanale ' : 'weekly ') + Math.round(b.weekly.used) + '%')
  if (b.reason === 'over-reserve') parts.push(it ? 'oltre la riserva' : 'past the reserve')
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

// The redeem advice only when it pays (budget.md): a banked weekly reset not yet lost (b.bankedWeekly,
// with or without an expiry date), weekly use at or above 100 - reserve, and at least 2 days left before
// the weekly reset (d at most 5): later, the reset is worth little. A red caused by pace alone gets no such sentence.
function redReason(b) {
  const parts = []
  if (typeof b.margin === 'number') parts.push('margin ' + signed(b.margin))
  if (b.weekly) parts.push('weekly ' + Math.round(b.weekly.used) + '% used')
  if (b.reason === 'over-reserve' && b.plan && typeof b.plan.reserve === 'number') {
    parts.push(`at or past the ${100 - b.plan.reserve}% reserve line (100 - reserve ${b.plan.reserve}%), red whatever the margin`)
  }
  if (b.weekly && b.weekly.resetsAt) parts.push('weekly reset ' + dateUtc(b.weekly.resetsAt, 'en'))
  const redeem = !!(b.bankedWeekly > 0 && b.weekly && b.plan && typeof b.plan.reserve === 'number'
    && b.weekly.used >= 100 - b.plan.reserve && typeof b.d === 'number' && b.d <= 5)
  return `Budget red (${parts.join(', ')}): model-guard did not run this launch. Start nothing new; finish open work only (a fix on a worker's own open PR, a final review in this session, merging what is green).`
    + (redeem ? ' A weekly reset is banked and at least 2 days are left before the weekly reset: ask the person to redeem it (Settings > Usage).' : '')
}

// One text for every paused launch, resumes included: a resumed run or session can hit the 5-hour limit
// and fail as well (budget.md, Projected cost), so model-guard holds it too.
function pausedReason(b) {
  const at = b.fiveHour && b.fiveHour.resetsAt ? clockUtc(b.fiveHour.resetsAt) : null
  const used = b.fiveHour ? Math.round(b.fiveHour.used) + '%' : '90% or more'
  return at
    ? `The 5-hour window is at ${used}: model-guard paused new launches and resumes, since a run started now can hit the limit and fail. Wait until ${at}, then launch or resume; keep working in this session meanwhile.`
    : `The 5-hour window is at ${used}: model-guard paused new launches and resumes until it resets, since a run started now can hit the limit and fail. Keep working in this session meanwhile.`
}

// ctx.fiveHourBanked: the plan line banks a 5-hour reset (budget.md: with a green weekly color, ask
// the person whether to redeem it instead of pausing; model-guard cannot redeem, so it still pauses).
function pausedGate(b, t, ctx) {
  const at = b.fiveHour && b.fiveHour.resetsAt ? clockUtc(b.fiveHour.resetsAt) : null
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
  if (b.color === 'unknown' && !ctx.unknownLogged) return { note: b.reason === 'stale-reading' || b.reason === 'window-expired' ? t.unknownStale : t.unknown, unknownNoted: true }
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
// A fork ignores model (it always runs on the session model) and a custom type without a model runs its
// definition's: neither is rewritten here. The tool call does not carry the session model, so the
// agent.spawn guard (decideSpawn) checks the model they will run on.
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
  if (type === 'fork') {
    const d = allowWith(gate, 'A fork runs on the session model and ignores model: model-guard checks that model when the fork is spawned.')
    if (!gate) d.to = 'debug'
    return d
  }
  if (!model) {
    if (type === 'Explore' && haikuHere) {
      changes = effort ? { model: 'haiku' } : { model: 'haiku', effort: 'medium' }
      line = t.explore(!!effort)
      why = `Agent model set to haiku${effort ? '' : ', effort medium'}: Explore is broad reading, model-mix's Haiku row, and haiku is Haiku 5.5 here.`
    } else if (!type || INHERITING_TYPES.includes(type)) {
      changes = { model: 'sonnet' }
      line = t.agentNoModel
      why = `Agent model set to sonnet: ${type || 'the default type'} would inherit the session model.`
        + (type === 'Explore' ? ` Not haiku: ${HAIKU_WHY.model[haikuWhy]}.` : '')
    } else {
      const d = allowWith(gate, `Agent type ${type} has no model: its definition decides (checked at spawn against the session model).`)
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
// held only while the 5-hour window is paused. A fresh run is new work and goes through the gate.
// An allowed resume carries startRun { width, name }: the caller records the run with it when it does not
// know the run (a reload lost it, or the module never saw its first agent), so the resumed run's agents
// spawn up to that width: today's profile, or the plan's own profile when today's allows none (red, Solo),
// as decideWorkflowAgent's warnAdmits base does. A run the caller already knows keeps its own record.
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
    const own = b.profile && b.profile.width > 0 ? b.profile : (b.plan && PROFILES[b.plan.name]) || PROFILES['Max 5x']
    const d = allowWith(gate, 'Workflow resume allowed: it finishes open work.')
    d.startRun = { width: own.width, name: own.name }
    return d
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

// The text values of every field whose name ends in "model" (model, default_model, ...), at any depth of
// a RemoteTrigger body: the routine's model, wherever the body schema puts it.
export function bodyModels(value, depth = 0, out = []) {
  if (depth > 32) return out
  if (Array.isArray(value)) {
    for (const v of value) bodyModels(v, depth + 1, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && /model$/i.test(k)) out.push(v)
      else bodyModels(v, depth + 1, out)
    }
  }
  return out
}

// RemoteTrigger actions that start a cloud session, now or on a schedule, and so need a cloud slot.
const STARTING_ACTIONS = ['create', 'run', 'create_webhook_trigger']

// A routine is a cloud session: after the budget gate, a model named anywhere in the body is checked as
// a cloud launch's --model is (forbiddenModel: Fable, the bare haiku alias, Haiku 4.5), and a create or run
// needs a cloud slot in today's profile (Solo, Pro yellow, has none).
export function decideRemoteTrigger(input, ctx) {
  const action = optionalString(input.action, 'action')
  if (!action || !LAUNCH_ACTIONS.includes(action)) return { action: 'allow', reason: 'RemoteTrigger read.', log: '' }
  if (action === 'update' && disablesOnly(input)) return { action: 'allow', reason: 'RemoteTrigger disable.', log: '' }
  const t = texts(ctx.lang)
  const gate = launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  for (const model of bodyModels(input.body)) {
    const bad = forbiddenModel(model)
    if (bad) {
      const m = shellModelText(bad)
      return {
        action: 'deny',
        reason: `Routines run as cloud sessions, which never run ${m.name} (model-mix); this body names ${model}. Set the routine's model to sonnet (model-mix's row for routines), opus for security-critical work, or claude-haiku-5-5 for a small mechanical job, and send it again.`,
        log: t.routineBad(m.log),
        to: 'transcript',
      }
    }
  }
  const p = ctx.budget.profile
  if (STARTING_ACTIONS.includes(action) && ctx.budget.color !== 'red' && p && p.cloud === 0) {
    return {
      action: 'deny',
      reason: `Today's profile is ${p.name} (budget ${ctx.budget.color}): no new cloud sessions, and a routine ${action === 'run' ? 'run starts' : 'starts'} one. Do the work in this session; disabling a routine still passes.`,
      log: t.cloudSolo(p),
      to: 'transcript',
    }
  }
  return allowWith(gate, 'RemoteTrigger allowed.')
}

// ---------------------------------------------------------------- shell commands (rules 4, 5, 7)

// ---------------------------------------------------------------- shell parser (shared with skill-router)
// From here to the "end of the shared shell parser" line, this block is the same text in model-guard's
// rules.js and skill-router's routes.js: keep the two identical. Both mods' tests run one corpus through
// tokenizeFull, so a drift fails a test.

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

// From `from` (the start of a line), where the line that ends a heredoc body starts (`body`) and the
// index just past it (`next`), or null when no line ends it. Unterminated bodies are scanned as
// commands: missing a real launch costs more than a false alarm (`$((1<<2))` also looks like a heredoc).
function heredocEnd(command, from, h) {
  let p = from
  while (p <= command.length) {
    const nl = command.indexOf('\n', p)
    const stop = nl < 0 ? command.length : nl
    let line = command.slice(p, stop)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (h.stripTabs) line = line.replace(/^\t+/, '')
    if (line === h.word) return { body: p, next: nl < 0 ? command.length : nl + 1 }
    if (nl < 0) return null
    p = nl + 1
  }
  return null
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

// Splits a shell line (Bash or PowerShell) into segments of tokens { value, start, end }, with:
//   ends    the separator that ended each segment (';', '|', '&&', '\n', '{', ...; '' for the last)
//   subs    command substitutions that stay inside one token, { value, start, end }: `$(...)` inside
//           double quotes, and backtick pairs (inside double quotes, or unquoted on one line)
//   bodies  heredoc bodies, { seg, value } (seg: the segment that opened them)
// Never throws on odd input: an unclosed quote runs to the end of the line.
// A line continuation (`\` in Bash, ` in PowerShell, before a newline) joins the next line.
// `{` and `}` standing alone (a brace group, a loop body, a PowerShell script block, `%{`) end a
// segment, so the command inside sits at a command position.
// Heredoc bodies (`<<EOF`, `<<-'EOF'`, several on one line) add no tokens; a PowerShell here-string
// (`@'` ... `'@`) is one token holding its body, never split into commands. Even an unquoted `<<EOF` or
// `@"` body, which the shell expands, is skipped: a launch hidden in a `$(...)` there is far rarer than
// commit, PR and brief texts that only mention `claude --cloud`. Only a body fed to a shell is a script
// (the callers read `bodies`). A heredoc inside a `$(...)` inside double quotes (Claude Code's commit
// and PR idiom `"$(cat <<'EOF' ... EOF\n)"`) is data too: its body stays in the quoted token, and its
// quotes never close the string.
export function tokenizeFull(command) {
  const segments = [[]]
  const ends = []
  const subs = []
  const bodies = []
  let tok = null
  let heredocs = []
  const cur = () => segments[segments.length - 1]
  const push = () => {
    if (tok) { cur().push(tok); tok = null }
  }
  const brk = sep => {
    push()
    if (cur().length) { ends[segments.length - 1] = sep; segments.push([]) }
  }
  const startTok = i => { if (!tok) tok = { value: '', start: i, end: i } }
  let i = 0
  while (i < command.length) {
    const c = command[i]
    const next = command[i + 1]
    if (c === ' ' || c === '\t') { push(); i++; continue }
    if ((c === '\\' || c === '`') && (next === '\n' || (next === '\r' && command[i + 2] === '\n'))) {
      push()
      i += next === '\r' ? 3 : 2
      continue
    }
    if (c === '<' && next === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
      push()
      let j = i + 2
      const stripTabs = command[j] === '-'
      if (stripTabs) j++
      while (command[j] === ' ' || command[j] === '\t') j++
      const { word, next: after } = heredocWord(command, j)
      if (word) heredocs.push({ word, stripTabs, seg: cur() })
      i = after
      continue
    }
    const alone = next === undefined || /\s/.test(next)
    if ((c === '{' && next !== '}' && (alone || !tok || tok.value === '%')) || (c === '}' && !tok && (alone || /[;|&)]/.test(next)))) {
      brk(c)
      i++
      continue
    }
    // An & or | inside a redirection stays in its word, so it splits nothing: `2>&1`, `>&2`, `<&3`,
    // `>|file`, `&>log`, `&>>log`.
    if ((c === '&' || c === '|') && tok && tok.end === i && (command[i - 1] === '>' || (c === '&' && command[i - 1] === '<'))) {
      tok.value += c
      i++
      tok.end = i
      continue
    }
    if (c === '&' && next === '>') {
      push()
      startTok(i)
      tok.value += c
      i++
      tok.end = i
      continue
    }
    if (SEPARATORS.has(c)) {
      const doubled = (c === '&' || c === '|') && next === c
      brk(doubled ? c + c : c)
      i += doubled ? 2 : 1
      if (c === '\n' && heredocs.length) {
        for (const h of heredocs) {
          const end = heredocEnd(command, i, h)
          if (!end) break
          bodies.push({ seg: h.seg, value: command.slice(i, end.body) })
          i = end.next
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
      let open = 0 // open `$(` inside this string
      let from = 0 // where the outermost one's text starts
      let inner = [] // heredocs opened inside them, waiting for the end of their line
      i++
      while (i < command.length && command[i] !== '"') {
        const d = command[i]
        if (d === '$' && command[i + 1] === '(') {
          if (!open) from = i + 2
          open++
          tok.value += '$('
          i += 2
          continue
        }
        if (d === ')' && open > 0) {
          open--
          if (!open) subs.push({ value: command.slice(from, i), start: from, end: i })
        }
        if (open > 0 && d === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
          let j = i + 2
          const stripTabs = command[j] === '-'
          if (stripTabs) j++
          while (command[j] === ' ' || command[j] === '\t') j++
          const { word, next: after } = heredocWord(command, j)
          if (word) inner.push({ word, stripTabs })
          tok.value += command.slice(i, after)
          i = after
          continue
        }
        if (d === '\n' && inner.length) {
          let p = i + 1
          for (const h of inner) {
            const end = heredocEnd(command, p, h)
            if (!end) { p = -1; break }
            p = end.next
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
          continue
        }
        if (d === '`') {
          // A Bash substitution, when it closes before the string does (PowerShell's "`n" escapes
          // read as one too: their text holds no command).
          const close = command.indexOf('`', i + 1)
          const quote = command.indexOf('"', i + 1)
          if (close > 0 && (quote < 0 || close < quote)) {
            subs.push({ value: command.slice(i + 1, close), start: i + 1, end: close })
            tok.value += command.slice(i, close + 1)
            i = close + 1
            continue
          }
        }
        tok.value += d
        i++
      }
      if (open > 0) subs.push({ value: command.slice(from, i), start: from, end: i })
      i++
    } else if (c === '`') {
      const close = command.indexOf('`', i + 1)
      const nl = command.indexOf('\n', i + 1)
      if (close > 0 && (nl < 0 || close < nl)) {
        subs.push({ value: command.slice(i + 1, close), start: i + 1, end: close })
        tok.value += command.slice(i, close + 1)
        i = close + 1
      } else {
        tok.value += c
        i++
      }
    } else {
      tok.value += c
      i++
    }
    tok.end = Math.min(i, command.length)
  }
  push()
  // Only the last segment can be empty, so a kept segment keeps its index.
  const kept = segments.filter(s => s.length)
  return {
    segments: kept,
    ends: kept.map((s, i) => ends[i] || ''),
    subs,
    bodies: bodies.map(b => ({ seg: kept.indexOf(b.seg), value: b.value })),
  }
}

// tokenizeFull's segments alone.
export function tokenize(command) {
  return tokenizeFull(command).segments
}

function baseName(value) {
  const parts = value.split(/[\\/]/)
  return parts[parts.length - 1].toLowerCase()
}

// claude by name or path (`claude.exe`, `/usr/local/bin/claude`), or its npm package (`npx @anthropic-ai/claude-code`).
function isClaude(value) {
  return /^claude(\.exe|\.cmd|\.ps1)?$/.test(baseName(value)) || /^@anthropic-ai\/claude-code(@\S*)?$/i.test(value)
}

function isLaunchScript(value) {
  return /^launch\.(exp|ps1)$/.test(baseName(value))
}

// Words that run the command after them, each with its own options: v lists the options that take the
// next word as their value (an attached value, `-n5`, `-I{}` or `--signal=KILL`, is one word); n counts
// the operands before the command (timeout's duration, chrt's priority, taskset's mask). Any other
// option stands alone (env -S's string is then the command word), and `--` ends the options. Shell
// keywords (kw) take no options.
const WRAPPERS = new Map([
  ...['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '}'].map(w => [w, { kw: true }]),
  ['time', { v: ['-o', '-f', '--output', '--format'] }],
  ['exec', { v: ['-a'] }],
  ['command', {}], ['nohup', {}], ['setsid', {}], ['call', {}], ['source', {}], ['.', {}],
  ['env', { v: ['-u', '-C', '--unset', '--chdir'] }],
  ['sudo', { v: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-R', '--user', '--group', '--host', '--prompt', '--close-from', '--chdir', '--role', '--type', '--other-user', '--command-timeout', '--chroot'] }],
  ['xargs', { v: ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a', '--max-args', '--max-procs', '--max-lines', '--max-chars', '--delimiter', '--eof', '--arg-file', '--replace', '--process-slot-var'] }],
  ['timeout', { v: ['-s', '-k', '--signal', '--kill-after'], n: 1 }],
  ['gtimeout', { v: ['-s', '-k', '--signal', '--kill-after'], n: 1 }],
  ['nice', { v: ['-n', '--adjustment'] }],
  ['ionice', { v: ['-c', '-n', '--class', '--classdata'] }],
  ['chrt', { v: ['-T', '-P', '-D', '--sched-runtime', '--sched-period', '--sched-deadline'], n: 1 }],
  ['taskset', { n: 1 }],
  ['caffeinate', { v: ['-t', '-w'] }],
  ['stdbuf', { v: ['-i', '-o', '-e', '--input', '--output', '--error'] }],
  ['watch', { v: ['-n', '--interval', '-q', '--equexit'] }],
  ['npx', { v: ['-p', '--package', '--cache', '--registry', '--userconfig'] }],
  ['bunx', { v: ['-p', '--package'] }],
])

// Index of the segment's command word, past `VAR=value`, shell keywords and wrappers with their options.
function commandIndex(seg) {
  let i = 0
  while (i < seg.length) {
    const word = seg[i].value
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) { i++; continue }
    const w = WRAPPERS.get(word)
    if (!w) break
    i++
    if (w.kw) continue
    while (i < seg.length && seg[i].value.startsWith('-')) {
      const o = seg[i].value
      i += o !== '--' && w.v && w.v.includes(o) ? 2 : 1
      if (o === '--') break
    }
    i += w.n || 0
  }
  return i < seg.length ? i : -1
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
    if (!REST_SHELLS.test(shell)) {
      // A POSIX shell reads all its options before the script: `bash -c -- "..."`, `sh -c -e "..."`,
      // `bash -c -o pipefail "..."` (-o and -O take a value).
      let s = j + 1
      while (s < seg.length && /^[-+]./.test(seg[s].value) && command.slice(seg[s].start, seg[s].end) === seg[s].value) {
        const o = seg[s].value
        s += /^[-+][oO]$/.test(o) ? 2 : 1
        if (o === '--') break
      }
      return s < seg.length ? [seg[s]] : null
    }
    if (j + 2 >= seg.length) return [seg[j + 1]]
    const start = seg[j + 1].start
    const end = seg[seg.length - 1].end
    const rest = { value: command.slice(start, end), start, end, synthetic: true }
    const q = command[start]
    return q === '"' || q === "'" || q === '@' ? [seg[j + 1], rest] : [rest]
  }
  return null
}

const EVALS = ['eval', 'iex', 'invoke-expression']
// Commands whose arguments may each hold a whole command line they run (`tmux new "..."`, `ssh host "..."`,
// `find . -exec sh -c "..."`): every argument with a space in it is read as a script.
const SCRIPT_TAKERS = ['tmux', 'screen', 'ssh', 'su', 'runuser', 'script', 'parallel', 'find']
const ECHOES = ['echo', 'printf', 'write-output', 'write-host']

// Whether segment k's command reads a script on stdin: a shell, ssh or su, or Invoke-Expression with no argument.
function readsStdin(seg, ci) {
  const name = baseName(seg[ci].value)
  if (EVALS.includes(name)) return seg.length === ci + 1 && name !== 'eval'
  return SHELLS.test(name) || name === 'ssh' || name === 'su' || name === 'runuser'
}

// The other scripts segment k runs, as texts to scan (never edited in place): eval's and Invoke-Expression's
// arguments; the command line `watch` or `env -S` runs; SCRIPT_TAKERS' arguments; AppleScript's
// `do shell script "..."`; and what a shell reads on stdin: a heredoc or `<<<` it takes, or what the segment
// before pipes into it (`cat <<'EOF' | bash`, `echo "..." | sh`, `"..." | iex`).
function extraScripts(full, k, ci) {
  const seg = full.segments[k]
  const name = baseName(seg[ci].value)
  const args = seg.slice(ci + 1).map(t => t.value)
  const out = []
  if (EVALS.includes(name)) out.push(args.filter(a => !/^-c(ommand)?$/i.test(a)).join(' '))
  if (/\s/.test(seg[ci].value) && seg.slice(0, ci).some(t => ['watch', '-S', '--split-string'].includes(t.value))) out.push(seg.slice(ci).map(t => t.value).join(' '))
  if (SCRIPT_TAKERS.includes(name)) out.push(...args.filter(a => /\s/.test(a)))
  if (name === 'osascript') {
    for (const a of args) for (const m of a.matchAll(/do (?:shell )?script\s+"((?:[^"\\]|\\.)*)"/g)) out.push(m[1].replace(/\\(.)/g, '$1'))
  }
  if (readsStdin(seg, ci)) {
    for (let j = 0; j < args.length; j++) if (args[j].startsWith('<<<')) out.push(args[j].length > 3 ? args[j].slice(3) : args[j + 1] || '')
    for (const b of full.bodies) if (b.seg === k) out.push(b.value)
    if (k > 0 && full.ends[k - 1] === '|') {
      const prev = full.segments[k - 1]
      for (const b of full.bodies) if (b.seg === k - 1) out.push(b.value)
      const pi = commandIndex(prev)
      if (pi >= 0 && /\s/.test(prev[pi].value)) out.push(prev[pi].value)
      else if (pi >= 0 && ECHOES.includes(baseName(prev[pi].value))) out.push(prev.slice(pi + 1).map(t => t.value).join(' '))
    }
  }
  return out.filter(Boolean)
}

// Where a launch script (coordinator-method's launch.exp, cloud-worker's launch.ps1) sits in segment
// seg: as the command word (`./launch.exp`, `& "...\launch.ps1"`, `. launch.ps1`), after expect and its
// flags, or as any argument of powershell or pwsh (`-File`, or the first operand). Else -1.
function launchScriptAt(seg, ci) {
  if (isLaunchScript(seg[ci].value)) return ci
  const name = baseName(seg[ci].value)
  if (/^expect(\.exe)?$/.test(name)) {
    let j = ci + 1
    while (j < seg.length && seg[j].value.startsWith('-')) j++
    return j < seg.length && isLaunchScript(seg[j].value) ? j : -1
  }
  if (REST_SHELLS.test(name)) {
    for (let j = ci + 1; j < seg.length; j++) if (isLaunchScript(seg[j].value)) return j
  }
  return -1
}

function hasFlag(values, ...names) {
  return values.some(v => names.includes(v) || names.some(n => v.startsWith(n + '=')))
}

// ---------------------------------------------------------------- indirect launches (Start-Process, start)
// What a starter hands claude is a Windows command line, and re-reading its quoting kept letting launches
// through. So the argument list is never read: only which program the starter runs, from the starter's
// own parameters.

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
// newlines inside them; a ` or \ line continuation is a space) and ends at any other separator.
function starterUnits(command, segments, k, ci) {
  const units = []
  let prev = segments[k][ci]
  let depth = 0
  for (let s = k; s < segments.length; s++) {
    for (let j = s === k ? ci + 1 : 0; j < segments[s].length; j++) {
      const tok = segments[s][j]
      let apart = !units.length
      for (const ch of command.slice(prev.end, tok.start).replace(/[`\\]\r?\n/g, ' ')) {
        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)
        else if (ch === ' ' || ch === '\t' || ((ch === '\n' || ch === '\r') && depth > 0)) apart = apart || depth === 0
        else return units
      }
      prev = tok
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

// ---------------------------------------------------------------- end of the shared shell parser

// ---------------------------------------------------------------- claude launches (model-guard)

// The last value of an option (a later one overrides an earlier one), `--name value` or `--name=value`.
function flagValue(args, name) {
  let found = { present: false, value: null }
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value
    if (v === name) found = { present: true, value: args[i + 1] ? args[i + 1].value : null }
    else if (v.startsWith(name + '=')) found = { present: true, value: v.slice(name.length + 1) }
  }
  return found
}

// A model name model-guard can read: not empty, not the next option, no variable or substitution.
function literalModel(value) {
  return typeof value === 'string' && value !== '' && !value.startsWith('-') && !/[$`]/.test(value)
}

// claude's options that take the next word (the variadic ones, `--add-dir a b`, are read as taking one,
// so a prompt after them still counts), and those whose value is optional (taken unless an option follows).
const CLAUDE_VALUED = [
  '--add-dir', '--agent', '--agents', '--allowedTools', '--allowed-tools', '--append-system-prompt', '--append-system-prompt-file',
  '--autocompact', '--betas', '--debug-file', '--disallowedTools', '--disallowed-tools', '--effort', '--environment',
  '--fallback-model', '--file', '--input-format', '--json-schema', '--max-budget-usd', '--max-turns', '--mcp-config', '--model',
  '-n', '--name', '--output-format', '--permission-mode', '--permission-prompts', '--permission-prompt-tool', '--plugin-dir',
  '--plugin-url', '--remote-control-session-name-prefix', '--session-id', '--setting-sources', '--settings', '--system-prompt',
  '--system-prompt-file', '--system-prompt-snapshot', '--tools',
]
const CLAUDE_OPTIONAL = ['-r', '--resume', '-d', '--debug', '--from-pr', '-w', '--worktree', '--remote-control', '--teleport', '--prompt-suggestions', '--cloud']
// A redirection word: `>`, `2>>`, `<`, `&>`, `>|`, `2>&1`, with its target attached or in the next word.
const REDIRECT = /^(?:\d*\*?|&)(>>?|<)(.*)$/
// Whether a redirection word's target is the next word (`> log`, `&> log`, `>& log`, `>| log`).
const targetNext = r => /^[&|]?$/.test(r[2])

// Short flags grouped in one word (`-pc`) read one by one.
function claudeWords(values) {
  return values.flatMap(v => (/^-[a-zA-Z]{2,}$/.test(v) ? [...v.slice(1)].map(c => '-' + c) : [v]))
}

// claude's first operand (a subcommand or the prompt), past options, their values and redirections; null when none.
function firstOperand(values) {
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === '--') return i + 1 < values.length ? values[i + 1] : null
    const r = REDIRECT.exec(v)
    if (r) { if (targetNext(r)) i++; continue }
    if (!v.startsWith('-') || v === '-') return v
    if (v.includes('=')) continue
    if (CLAUDE_VALUED.includes(v)) i++
    else if (CLAUDE_OPTIONAL.includes(v) && i + 1 < values.length && !values[i + 1].startsWith('-')) i++
  }
  return null
}

// What a claude command line starts, from its argument values: 'cloud', 'local', 'resume', 'ultrareview' or null.
//   `--cloud` with `-p`/`--print` (and no `--environment`) only queues a message to an existing cloud
//   session (`claude -p "<msg>" --cloud <session_id|cse_id|url>`): steering open work, null. Without a
//   terminal --cloud cannot create a session; `-p --environment <id> --cloud` does, so it stays a launch.
//   `--cloud` otherwise: a new cloud session.
//   `ultrareview`: a cloud-hosted review; it names no model.
//   A management subcommand (`claude plugin ...`), --version or --help: null.
//   `-p`/`--print`, `--bg`/`--background`, or a prompt word: a local headless session. From the Bash,
//   PowerShell and Monitor tools stdout is not a terminal, so `claude "task"` runs headless as -p does.
//   With `-r`/`--resume`, `-c`/`--continue` or `--from-pr` (and no `--fork-session`) it carries on an
//   existing local session: 'resume', open work. Otherwise (--fork-session included) a new one: 'local'.
//   Without any of them (`claude`, `claude --resume abc`) it is an interactive session, no delegated launch: null.
export function claudeLaunch(raw) {
  const values = claudeWords(raw)
  if (hasFlag(values, '--cloud')) return hasFlag(values, '-p', '--print') && !hasFlag(values, '--environment') ? null : 'cloud'
  if (hasFlag(values, '--version', '-v', '--help', '-h')) return null
  const operand = firstOperand(values)
  if (operand !== null && MANAGEMENT.includes(operand)) return null
  if (operand === 'ultrareview') return 'ultrareview'
  if (operand === null && !hasFlag(values, '-p', '--print', '--bg', '--background')) return null
  if (hasFlag(values, '-r', '--resume', '-c', '--continue', '--from-pr') && !hasFlag(values, '--fork-session')) return 'resume'
  return 'local'
}

// The launch a claude command word starts (kind from claudeLaunch). A --model with no readable name
// (`--model=`, a trailing `--model`, `--model "$M"`) names no model: hasModel false, and modelUnread,
// because an inserted --model sonnet would lose to it. --fallback-model's names are kept in `fallback`.
function claudeEntry(kind, args, insertAt) {
  if (kind === 'ultrareview') return { kind }
  const m = flagValue(args, '--model')
  const l = { kind, hasModel: m.present, model: m.value, insertAt }
  if (m.present && !literalModel(m.value)) {
    l.hasModel = false
    l.model = null
    l.modelUnread = true
  }
  const f = flagValue(args, '--fallback-model')
  if (f.present && literalModel(f.value)) l.fallback = f.value.split(',').map(s => s.trim()).filter(Boolean)
  return l
}

// cloud-worker's launch.ps1 parameters. PowerShell binds named parameters anywhere, by any unambiguous
// prefix (`-Dry`), with `-Name:value` as one word.
const PS1_PARAMS = ['taskfile', 'rulesfile', 'logfile', 'model', 'effort', 'ref', 'dryrun', 'force', 'nottycheck', 'exe', 'exeargs']
const PS1_SWITCHES = ['dryrun', 'force', 'nottycheck']

// The launch a launch script at seg[li] starts. launch.exp takes the model as its 4th argument; launch.ps1
// as its 4th positional argument or -Model, and -DryRun only prints the prompt (no launch: null). A
// launch.ps1 line cut short by `(` (`-ExeArgs @('-p')`) cannot be read: unparsed.
function launchEntry(command, seg, li) {
  let model
  let script
  if (baseName(seg[li].value) === 'launch.exp') {
    const arg = seg[li + 4]
    model = arg ? arg.value : null
  } else {
    if (/^\s*\(/.test(command.slice(seg[seg.length - 1].end))) return { kind: 'unparsed' }
    script = 'launch.ps1'
    model = null
    let named = false
    const positional = []
    for (let j = li + 1; j < seg.length; j++) {
      const v = seg[j].value
      const r = REDIRECT.exec(v)
      if (r) { if (targetNext(r)) j++; continue }
      const p = /^-([a-z]+)(?::([\s\S]*))?$/i.exec(v)
      if (!p) { positional.push(v); continue }
      const n = p[1].toLowerCase()
      const hits = PS1_PARAMS.includes(n) ? [n] : PS1_PARAMS.filter(x => x.startsWith(n))
      const name = hits.length === 1 ? hits[0] : null
      if (name && PS1_SWITCHES.includes(name)) {
        if (name === 'dryrun' && !/^\$?false$/i.test(p[2] || '')) return null
        continue
      }
      let value = p[2]
      if (value === undefined) {
        j++
        value = j < seg.length ? seg[j].value : null
        // An array value runs on over commas: 'a','b' or 'a', 'b'.
        while (j + 1 < seg.length && (command[seg[j].end - 1] === ',' || command[seg[j + 1].start] === ',')) j++
      }
      if (name === 'model') { model = value; named = true }
    }
    if (!named) model = positional.length > 3 ? positional[3] : null
  }
  const l = script ? { kind: 'launchExp', model, script } : { kind: 'launchExp', model }
  if (model !== null && !literalModel(model)) l.modelUnread = true
  return l
}

// What starts a session when it follows a claude word: -p (alone or among claude's short flags, -pc),
// --print, --cloud, --bg, --background, or the ultrareview subcommand.
const LAUNCH_FLAG = /^(--print|--cloud(=.*)?|--bg|--background|ultrareview|-[cdhnrvw]*p[cdhnrvw]*)$/

// Programs that never run their arguments: a claude word after them is data (`echo claude --cloud x`,
// `git log --grep claude -p`, `ls claude -p`), except git's own runners (`git bisect run claude -p x`,
// `git rebase -x claude`).
const DATA_COMMANDS = [
  'echo', 'printf', 'write-output', 'write-host', 'git', 'gh', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ls', 'dir',
  'cat', 'bat', 'head', 'tail', 'less', 'more', 'wc', 'which', 'whereis', 'type', 'man', 'file', 'stat',
  'select-string', 'get-content', 'get-command', 'get-help',
]
const GIT_RUNS = /^(bisect|-x|--exec(=.*)?)$/

// A segment that may start claude where model-guard cannot read it as the command: an unquoted claude
// word followed later in the segment by a LAUNCH_FLAG, behind a program that may run its arguments
// (`screen -dm claude -p x`, `find -exec claude -p x \;`, an unknown runner). A quoted word is text, never
// the program (`git log -S "claude" -p`, `grep -rn "claude" -p .`, `echo "claude -p x"`), and so is
// anything after a DATA_COMMANDS program or after an unquoted word starting with `#`, which bash and
// PowerShell read as a comment (cmd does not: `cmd` true). Also a variable or substitution as the command
// word followed by an unquoted launch flag (`$CLAUDE -p x`, `` `which claude` -p x ``), or a launch flag as
// the command word (what follows `$(which claude)`).
function unresolvedLaunch(command, seg, ci, cmd) {
  const plain = t => command.slice(t.start, t.end) === t.value
  // PowerShell's block comment (`<# ... #>`) ends inside the line: no cut then.
  if (!cmd && !seg.some(t => t.value.includes('<#'))) {
    const c = seg.findIndex(t => plain(t) && t.value.startsWith('#'))
    if (c >= 0 && c <= ci) return false
    if (c >= 0) seg = seg.slice(0, c)
  }
  const flagAfter = (j, unquoted) => seg.slice(j + 1).some(t => LAUNCH_FLAG.test(t.value) && (!unquoted || plain(t)))
  const word = seg[ci].value
  if (word.startsWith('-') && LAUNCH_FLAG.test(word)) return true
  if (/^[$`]/.test(word) && flagAfter(ci, true)) return true
  const name = baseName(word).replace(/\.exe$/, '')
  if (plain(seg[ci]) && DATA_COMMANDS.includes(name) && !(name === 'git' && seg.some(t => GIT_RUNS.test(t.value)))) return false
  return seg.some((t, j) => j !== ci && plain(t) && isClaude(t.value) && flagAfter(j, false))
}

// The launches a command line holds:
//   { kind: 'cloud', hasModel, model, insertAt }  for `claude ... --cloud ...` (not a -p follow-up)
//   { kind: 'local', hasModel, model, insertAt }  for `claude -p ...`, `claude --bg ...`, `claude "task"` (headless, local)
//   { kind: 'resume', hasModel, model, insertAt } for `claude --resume <id> -p ...`, `claude -c --bg ...`
//     (insertAt null when the launch sits inside a nested script that cannot be edited in place;
//     modelUnread when --model has no readable name; fallback: --fallback-model's names)
//   { kind: 'ultrareview' }                       for `claude ultrareview ...`
//   { kind: 'launchExp', model, script? }         for `expect .../launch.exp <task> <rules> <log> <model> <effort>`
//     and cloud-worker's launch.ps1 (script 'launch.ps1')
//   { kind: 'indirect' }                          for claude run by Start-Process (start, saps) or cmd's start,
//     whatever its arguments: they are never read
//   { kind: 'unparsed' }                          for a claude word with a launch flag model-guard cannot read
// Behind wrappers (timeout, env -u X, sudo -u x, caffeinate -i, xargs -I{}, ...), in loop and if bodies,
// brace groups and script blocks. Nested scripts are read up to 3 levels deep: shells (`bash -c "..."`,
// `pwsh -Command "..."`), eval and Invoke-Expression, heredocs and pipes into a shell, `$(...)` and
// backticks inside double quotes, tmux, ssh, watch, osascript. Past 3 levels a script naming claude is unparsed.
export function scanShell(command, depth = 0, cmd = false) {
  if (typeof command !== 'string') throw new TypeError('command is not text')
  if (!/claude|launch\.(exp|ps1)|[$`]/i.test(command)) return []
  const launches = []
  const covered = [] // spans read as nested shell scripts: their substitutions are read there
  const inner = text => {
    if (depth >= 3) return /claude|launch\.(exp|ps1)/i.test(text) ? [{ kind: 'unparsed' }] : []
    return scanShell(text, depth + 1).map(l => ('insertAt' in l ? { ...l, insertAt: null } : l))
  }
  const full = tokenizeFull(command)
  const segments = full.segments
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k]
    const ci = commandIndex(seg)
    if (ci < 0) continue
    const word = seg[ci]
    const scripts = nestedScripts(command, seg, ci)
    if (scripts) {
      if (depth >= 3) {
        if (scripts.some(s => /claude|launch\.(exp|ps1)/i.test(s.value))) launches.push({ kind: 'unparsed' })
        continue
      }
      covered.push([word.end, seg[seg.length - 1].end])
      let read = false
      for (const script of scripts) {
        const found = scanShell(script.value, depth + 1, /^cmd(\.exe)?$/.test(baseName(word.value)))
        if (!found.length) continue
        read = true
        const raw = command.slice(script.start, script.end)
        const quote = !script.synthetic && (raw[0] === '"' || raw[0] === "'") ? raw[0] : ''
        // Offsets map back only when the script token is the plain text in one pair of quotes (or none).
        const exact = raw === quote + script.value + quote
        for (const l of found) {
          if (!('insertAt' in l)) launches.push(l)
          else launches.push({ ...l, insertAt: exact && l.insertAt !== null ? script.start + quote.length + l.insertAt : null })
        }
        break
      }
      // No launch in the script, yet the shell's other words, which the script may run as "$@", hold one
      // (`sh -c 'exec "$@"' sh claude -p x`). The script word itself was read (`bash -c claude --cloud x`
      // runs a bare claude).
      if (!read && unresolvedLaunch(command, seg.filter(t => !scripts.includes(t)), ci, cmd)) launches.push({ kind: 'unparsed' })
      continue
    }
    const extra = extraScripts(full, k, ci).flatMap(inner)
    launches.push(...extra)
    if (STARTERS.includes(baseName(word.value)) && startsClaude(command, segments, k, ci)) {
      launches.push({ kind: 'indirect' })
      continue
    }
    if (isClaude(word.value)) {
      const args = seg.slice(ci + 1)
      const kind = claudeLaunch(args.map(a => a.value))
      if (kind) launches.push(claudeEntry(kind, args, word.end))
      continue
    }
    const li = launchScriptAt(seg, ci)
    if (li >= 0) {
      const l = launchEntry(command, seg, li)
      if (l) launches.push(l)
      continue
    }
    // Read as a script already (`eval claude -p x`): no second, unparsed reading.
    if (!extra.length && unresolvedLaunch(command, seg, ci, cmd)) launches.push({ kind: 'unparsed' })
  }
  for (const s of full.subs) {
    if (!covered.some(([a, b]) => s.start >= a && s.end <= b)) launches.push(...inner(s.value))
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

// The deny for a forbidden model named on a launch, by --model or --fallback-model.
function modelDenied(l, bad, flag, t) {
  const m = shellModelText(bad)
  const fix = flag === '--model' ? m.fix : m.fix.replace(/--model /g, '--fallback-model ')
  const via = flag === '--model' ? '' : `, not even as --fallback-model (the session falls back to it when the main model is busy)`
  if (l.kind === 'cloud') {
    return { action: 'deny', reason: `Cloud sessions never run ${m.name} (model-mix)${via}: ${fix}`, log: t.cloudBad(m.log), to: 'transcript' }
  }
  if (l.kind === 'local' || l.kind === 'resume') {
    return { action: 'deny', reason: `Headless and background sessions (claude -p, --bg) never run ${m.name} (model-mix)${via}: ${fix}`, log: t.localBad(m.log), to: 'transcript' }
  }
  const script = l.script || 'launch.exp'
  return {
    action: 'deny',
    reason: `${script}'s model argument (the 4th) is ${l.model}: cloud sessions never run ${m.name} (model-mix): ${m.fix.replace(/--model /g, '')}`,
    log: t.launchBad(m.log, script),
    to: 'transcript',
  }
}

// launches: scanShell(input.command), computed by the caller before it reads the budget.
// Cloud, local headless (-p, --bg, a prompt word), ultrareview and launch script launches all pass the
// gate (red, paused); all but ultrareview, which names no model, pass the model check (--model and
// --fallback-model); only cloud ones (and the launch scripts) need a cloud slot in today's profile.
// A command whose launches are all local resumes (--resume, --continue or --from-pr with -p or --bg)
// finishes open work, as a Workflow resume does: allowed while red (redPolicy deny too) and on Solo,
// denied only while the 5-hour window is paused. It gets no --model, but an explicit Fable, bare
// haiku or Haiku 4.5 id is still denied. Next to a new launch, the command goes through the gate as a whole.
// claude run by Start-Process or cmd's start, and a claude word model-guard cannot read as the command
// (unparsed), are denied in every color, before the gate: the model runs the same launch directly.
// A --model with no readable name (empty, missing, a variable) is denied too: an added --model sonnet
// would lose to it.
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
  if (found.some(l => l.kind === 'unparsed')) {
    return {
      action: 'deny',
      reason: 'model-guard cannot read the claude launch in this command (the unquoted word claude with -p, --print, --cloud, --bg or ultrareview after it behind a program it does not know, a variable as the command word, a script nested too deep, or a launch.ps1 line cut by "("), so it was not run. Run claude directly as the command word with --model, for example claude --model sonnet -p "<task>" or claude --model sonnet --cloud "<task>". If this command does not start claude, quote that text or put the flag before the word claude.',
      log: t.unparsed,
      to: 'transcript',
    }
  }
  const resumesOnly = found.every(l => l.kind === 'resume')
  if (resumesOnly && b.pausedFiveHour) return denied(pausedGate(b, t, ctx))
  const gate = resumesOnly && b.color === 'red' ? { note: t.resumeRed(b, 'session') } : launchGate(ctx)
  if (gate && gate.deny) return denied(gate)
  for (const l of found) {
    for (const [model, flag] of [[l.model, '--model'], ...(l.fallback || []).map(f => [f, '--fallback-model'])]) {
      const bad = forbiddenModel(model)
      if (bad) return modelDenied(l, bad, flag, t)
    }
  }
  if (found.some(l => l.modelUnread)) {
    return {
      action: 'deny',
      reason: 'This claude launch gives --model (or launch.ps1/launch.exp its model) no name model-guard can read: empty, missing, or a variable or substitution such as "$M". It cannot check that model or add one, so the command was not run. Name the model literally: --model sonnet for implementation, --model opus for security-critical work, or --model claude-haiku-5-5 for a small mechanical ticket.',
      log: t.modelUnread,
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

// ---------------------------------------------------------------- agents at agent.spawn (rules 3, 6)

// The model a spawned agent will run on, from agent.spawn's input: { model, source, type }.
//   own         the call names it (a literal 'inherit', any case, names none)
//   fork        a fork: it ignores model and always runs on the parent's (parentModel)
//   inherit     no model, and no type or a type in INHERITING_TYPES: the parent's
//   definition  a custom type with no model: its definition's model, which a hook cannot read, and the
//               parent's when that definition has none or says inherit, so the parent's is what is judged
// A field of the wrong type throws: the guard's .catch then refuses.
export function spawnModel(input) {
  const raw = optionalString(input.model, 'model')
  const type = optionalString(input.subagentType, 'subagentType')
  const parent = optionalString(input.parentModel, 'parentModel')
  const own = raw && raw.trim() && raw.trim().toLowerCase() !== 'inherit' ? raw : undefined
  if (input.fork === true || type === 'fork') return { model: parent, source: 'fork', type }
  if (own) return { model: own, source: 'own', type }
  if (!type || INHERITING_TYPES.includes(type)) return { model: parent, source: 'inherit', type }
  return { model: parent, source: 'definition', type }
}

// The deny for a spawn that would run on Fable, on the haiku alias where it is not Haiku 5.5, or on a
// Haiku 4.5 id, judged on spawnModel's answer; null when the model passes.
// workflow: a workflow agent (its texts say agent() and "run the stage again").
function spawnModelDenied(sm, ctx, t, workflow) {
  const { model, source, type } = sm
  const named = source === 'own'
  if (modelFamily(model) === 'fable') {
    if (workflow) {
      return {
        action: 'deny',
        reason: named
          ? "Workflow agents never run on Fable (model-mix). Pin { model: 'opus', effort: 'high' } on this agent() call and run the stage again."
          : source === 'definition'
            ? `This agent() has type ${type} and no model, and that type's definition may inherit the session's Fable (no model, or model: inherit). Pin { model: 'opus', effort: 'high' } (or 'sonnet' for fan-out stages) and run the stage again.`
            : "This agent() has no model and would inherit the session's Fable. Pin { model: 'opus', effort: 'high' } (or 'sonnet' for fan-out stages) and run the stage again.",
        log: t.wfFable,
        to: 'transcript',
      }
    }
    const fix = "Use subagent_type general-purpose with model: 'opus' and a self-contained prompt instead."
    return {
      action: 'deny',
      reason: source === 'fork'
        ? `A fork always runs on the session model, Fable here, and ignores model: model-mix keeps Fable off delegated work (a mod cannot read the Fable window). ${fix}`
        : named
          ? `Subagents never run on Fable (model-mix: a mod cannot read the Fable window). ${fix}`
          : source === 'definition'
            ? `Agent type ${type} has no model in this call, and its definition may inherit the session's Fable (no model, or model: inherit). Name the model in the call (model: 'opus', or 'sonnet' for implementation), or: ${fix}`
            : `This agent has no model and would inherit the session's Fable. ${fix}`,
      log: t.spawnFable(source === 'fork' || source === 'definition' ? source : 'inherit'),
      to: 'transcript',
    }
  }
  // The model this agent runs: its own, or the session's when it inherits (as the Fable check above).
  const kind = haikuKind(model)
  const h = haikuOf(ctx)
  const fix = workflow
    ? "Pin { model: 'sonnet', effort: 'high' } on this agent() call and run the stage again."
    : source === 'fork'
      ? "Use subagent_type general-purpose with model: 'sonnet' instead (a fork ignores model)."
      : "Start it with model: 'sonnet'."
  if (kind === 'alias' && !h.ok) {
    const why = h.why || 'unknown'
    const who = workflow ? 'This agent()' : 'This agent'
    return {
      action: 'deny',
      reason: `${named ? 'The haiku alias' : `${who} has no model and would ${source === 'fork' ? 'run on' : 'inherit'} the session's haiku alias, which`} is not Haiku 5.5 here: ${HAIKU_WHY.model[why]}. ${fix}`,
      log: workflow ? t.wfHaiku(why) : t.spawnHaiku(why),
      to: 'transcript',
    }
  }
  if (kind === 'old') {
    const pin = workflow
      ? `Pin ${h.ok ? "{ model: 'haiku', effort: 'medium' } for a reading stage or " : ''}{ model: 'sonnet', effort: 'high' } on this agent() call and run the stage again.`
      : fix
    return {
      action: 'deny',
      reason: `model-mix never pins Haiku 4.5 (${model}${named ? '' : ', inherited from the session'}). ${pin}`,
      log: workflow ? t.wfHaikuOld : t.spawnHaikuOld,
      to: 'transcript',
    }
  }
  return null
}

// agent.spawn outside a workflow: an Agent call, a teammate, a plugin's $.agent.spawn. Only the model it
// will run on is judged here (spawnModelDenied); the budget gate and the cloud slot are the Agent tool
// call's (decideAgent), and the width the Workflow's. A fork or an inheriting agent in a Fable session
// is refused, as is a custom type with no model there, since its definition may inherit Fable.
export function decideSpawn(input, ctx) {
  const d = spawnModelDenied(spawnModel(input), ctx, texts(ctx.lang), false)
  return d || { action: 'allow', reason: 'Spawn model checked.', log: '' }
}

// run: what the caller knows of this runId, { admitted: Set of agentIndex, width, name }, or undefined
// for a run never seen. A known run keeps the width that applied at its first agent, so a run that
// started before red (or before a step down) finishes at its own width: red blocks only new work,
// and the first agent of an unseen run while red is new work (today's width 0).
// Any Fable (pinned, inherited, or possibly inherited through a custom type) is denied; the haiku alias
// passes where it is Haiku 5.5 (ctx.haiku ok) and is denied otherwise; a pinned Haiku 4.5 id is denied;
// a pinned Haiku 5.5 id passes. A literal model 'inherit' counts as inheriting.
// A decision may carry, for the caller to apply synchronously after this call:
//   startRun { width, name }  record this run (only when it was not known)
//   admit: true               add this agentIndex to the run's admitted set
export function decideWorkflowAgent(input, ctx, run) {
  const wf = input.workflow
  if (!wf || typeof wf !== 'object') throw new TypeError('workflow is missing')
  if (typeof wf.runId !== 'string') throw new TypeError('workflow.runId is not text')
  if (typeof wf.agentIndex !== 'number' || !Number.isFinite(wf.agentIndex)) throw new TypeError('workflow.agentIndex is not a number')
  const sm = spawnModel(input)
  const t = texts(ctx.lang)
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
  const refused = spawnModelDenied(sm, ctx, t, true)
  if (refused) return withRun(refused)
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
