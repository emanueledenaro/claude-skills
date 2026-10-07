// Budget color from a usage reading, as model-mix/budget.md computes it.
// Pure functions only: no `$`, so both mods can import their own copy.
// coordinator-lens/hooks/budget.js and model-guard/hooks/budget.js must stay identical.

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const READING_MAX_AGE = 10 * 60 * 1000

export const PROFILES = {
  'Max 20x': { name: 'Max 20x', width: 16, cloud: 3, verify: 'opus-high-per-finding', reserve: 10 },
  'Max 5x': { name: 'Max 5x', width: 8, cloud: 1, verify: 'opus-high-batched', reserve: 15 },
  'Pro': { name: 'Pro', width: 4, cloud: 1, verify: 'opus-medium-final', reserve: 25 },
  'Solo': { name: 'Solo', width: 0, cloud: 0, verify: 'main-session', reserve: null },
}

const LADDER = ['Max 20x', 'Max 5x', 'Pro', 'Solo']

export function stepDown(name) {
  const i = LADDER.indexOf(name)
  return LADDER[Math.min(i < 0 ? 1 : i + 1, LADDER.length - 1)]
}

export function planName(text) {
  if (!text) return null
  if (/max\s*20\s*x/i.test(text)) return 'Max 20x'
  if (/max\s*5\s*x/i.test(text)) return 'Max 5x'
  if (/\bpro\b/i.test(text)) return 'Pro'
  return null
}

// Reads `Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22`.
// Returns null when the text has no plan line.
export function parsePlanLine(text) {
  if (typeof text !== 'string') return null
  const m = /^[ \t>*-]*Claude plan:[ \t]*(.+)$/im.exec(text)
  if (!m) return null
  const parts = m[1].split(/[·|]/).map(s => s.trim()).filter(Boolean)
  const info = { name: planName(parts[0]), reserve: null, banked: [], usageFile: null, raw: m[1].trim() }
  for (const part of parts.slice(1)) {
    const reserve = /^reserve\s+(\d+(?:\.\d+)?)\s*%?$/i.exec(part)
    if (reserve) { info.reserve = Number(reserve[1]); continue }
    const banked = /^banked\s*:\s*(.*)$/i.exec(part)
    if (banked) {
      for (const entry of banked[1].split(';').map(s => s.trim()).filter(Boolean)) {
        const type = /5\s*-?\s*hour/i.test(entry) ? '5-hour' : /weekly/i.test(entry) ? 'weekly' : null
        if (!type) continue
        const date = /expires\s+(\d{4}-\d{2}-\d{2})/i.exec(entry)
        info.banked.push({ type, expires: date ? date[1] : null })
      }
      continue
    }
    const file = /^usage file\s*:\s*(.+)$/i.exec(part)
    if (file) info.usageFile = file[1].trim()
  }
  return info
}

function windowOf(rateLimits, kind) {
  const w = (rateLimits || []).find(r => r && r.kind === kind)
  if (!w || typeof w.percentUsed !== 'number') return null
  const resetsAt = w.resetsAt ? Date.parse(w.resetsAt) : NaN
  return { used: w.percentUsed, resetsAt: Number.isFinite(resetsAt) ? resetsAt : null }
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

// Weekly resets still worth counting: not redeemed (the caller drops those), with an expiry date after today.
export function countedResets(plan, now) {
  const today = utcDay(now)
  return (plan && plan.banked ? plan.banked : [])
    .filter(b => b.type === 'weekly' && b.expires && b.expires > today)
    .map(b => ({ ...b, weeks: Math.max(1, (Date.parse(b.expires + 'T00:00:00Z') - now) / WEEK) }))
}

// input: { rateLimits, now, plan (parsePlanLine result or null), inFlight (weekly points still to come), readingAt }
export function computeBudget(input) {
  const now = input.now
  const plan = input.plan || null
  const known = !!(plan && plan.name)
  const planProfile = PROFILES[known ? plan.name : 'Max 5x']
  const reserve = plan && typeof plan.reserve === 'number' ? plan.reserve : planProfile.reserve
  const weekly = windowOf(input.rateLimits, 'seven_day')
  const fiveHour = windowOf(input.rateLimits, 'five_hour')
  const inFlight = Math.max(0, input.inFlight || 0)
  const base = {
    plan: { name: planProfile.name, known, reserve },
    weekly, fiveHour, inFlight,
    pausedFiveHour: !!(fiveHour && fiveHour.used >= 90 && (!fiveHour.resetsAt || fiveHour.resetsAt > now)),
    resets: countedResets(plan, now),
  }
  const stale = typeof input.readingAt === 'number' && now - input.readingAt > READING_MAX_AGE
  if (!weekly || !weekly.resetsAt || weekly.resetsAt <= now || stale) {
    return { ...base, color: 'unknown', reason: !weekly ? 'no-reading' : stale ? 'stale-reading' : 'window-expired', pace: null, margin: null, d: null, lastHours: false, profile: planProfile }
  }
  const hoursToReset = (weekly.resetsAt - now) / (60 * 60 * 1000)
  const d = Math.min(7, Math.max(0.5, 7 - hoursToReset / 24))
  const boost = base.resets.reduce((sum, r) => sum + 1 / r.weeks, 0)
  const pace = d / 7 * 100 * (1 + boost)
  const margin = weekly.used + inFlight - pace
  const overReserve = weekly.used >= 100 - reserve
  const lastHours = hoursToReset <= 12
  let color
  if (overReserve) color = 'red'
  else if (lastHours) color = 'green'
  else if (margin <= 10) color = 'green'
  else if (margin <= 25) color = 'yellow'
  else color = 'red'
  const profile = color === 'red'
    ? { name: 'Red', width: 0, cloud: 0, verify: 'main-session', reserve: null }
    : color === 'yellow' ? PROFILES[stepDown(planProfile.name)] : planProfile
  return { ...base, color, reason: overReserve ? 'over-reserve' : lastHours ? 'last-12-hours' : 'pace', pace, margin, d, lastHours, profile }
}

// Weekly points a run would cost, from the run-cost unit: points per Sonnet-weighted agent (Haiku counts 0.05,
// Opus 2, Fable 5). Haiku 5.5 is about 1/20 of Sonnet per token while its prompt stays under 100K tokens.
export function estimatePoints(agents, unitPoints) {
  if (typeof unitPoints !== 'number' || !(unitPoints > 0)) return null
  const a = agents || {}
  return unitPoints * (0.05 * (a.haiku || 0) + (a.sonnet || 0) + 2 * (a.opus || 0) + 5 * (a.fable || 0) + (a.other || 0))
}

export function modelFamily(model) {
  if (!model) return null
  if (/fable/i.test(model)) return 'fable'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  if (/haiku/i.test(model)) return 'haiku'
  return 'other'
}
