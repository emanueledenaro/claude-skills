// Element trees and texts for coordinator-lens. Pure: no `$`; elements come in as `E`
// (what `$.ui.resolve(e)` gives). Data in, trees out. Never put Svg in a terminal tree.
//
//   bandView(vm, E, { cols, surface })                  the line above the prompt (or null): one row, two at most, always within cols
//   cardView(vm, E, { cols, surface })                  the inline /coord card
//   paneView(vm, E, { cols, surface, tab, actions })    the /coord pane, five tabs
//   summaryText(vm)                                     /coord command text for the model (English, <= 10 lines)
//   budgetLine(vm)                                      one English line for the model context
//   paceSvg(vm, width, height)                          weekly pace bar as SVG markup (hex colors live only here)
//
// Look ("clean labels"): sections are a dim UPPERCASE label in a fixed column (LABEL_W cells), then the
// value, set apart by spaces only: no head dot and no ' · ' anywhere in text the person sees.
// Marks: done = ✓ (success), current = ◉, todo = ○, probable = dim ○ with a '?'.
// Workers: ● running (claude), ○ launched, ✓ done, ✗ failed, ! stalled or denied.
// Bars: ━ filled in the pace color, ─ empty (dim), ╋ the pace mark.
// Budget block: PLAN is the person's plan (with what it allows); PROFILE is today's profile and has a row
// only when it is not the plan's (yellow steps down, red launches nothing).
// An old reading: budget.md's 10-minute rule is for launch decisions, so the person still sees the color of
// the last known reading, the word dim with its age after it ('Budget verde (lettura di 12m fa)'; the band,
// the card title and the BUDGET block). 'in attesa' is for no reading at all, or one of unknown age. The
// texts for the model (summaryText, budgetLine) keep the rule: an old green reading is 'unknown', an old red
// or yellow one keeps its color.

import { modelFamily, estimatePoints, PROFILES } from './budget.js'
import { t, tn, has, colorWord, fmtDuration, fmtPoints, normalizeLang } from './i18n.js'

export const TABS = ['overview', 'workers', 'merge', 'flow', 'night']

const PACE_COLOR = { green: 'success', yellow: 'warning', red: 'error', unknown: 'inactive' }
const PACE_HEX = { green: '#2f9e63', yellow: '#d9a31c', red: '#d94b4b', unknown: '#8b919a' }
const STAGES = ['grill', 'spec', 'tickets', 'build', 'review', 'pr']
const LABEL_W = 12
const GAP = '   '
const SVG_CELLS = 20

// ---------- small helpers ----------

function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x)
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x))
}

function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function glyphs(s) {
  return Array.from(s)
}

function width(s) {
  return glyphs(s).length
}

function fit(s, n) {
  const g = glyphs(clean(s))
  if (n <= 0) return ''
  if (g.length <= n) return g.join('')
  return n === 1 ? '…' : g.slice(0, n - 1).join('') + '…'
}

// Cut to n cells with '…', keeping the spaces inside (fit also collapses them: use it on text from outside).
function cut(s, n) {
  const g = glyphs(s)
  if (n <= 0) return ''
  if (g.length <= n) return s
  return n === 1 ? '…' : g.slice(0, n - 1).join('') + '…'
}

function pad(s, n) {
  const w = width(s)
  return w >= n ? s : s + ' '.repeat(n - w)
}

function padL(s, n) {
  const w = width(s)
  return w >= n ? s : ' '.repeat(n - w) + s
}

function props(o) {
  const out = {}
  for (const k of Object.keys(o)) {
    const v = o[k]
    if (v !== undefined && v !== null && v !== false) out[k] = v
  }
  return out
}

function pctText(x) {
  const r = Math.round(x)
  return String(Object.is(r, -0) ? 0 : r)
}

function signed(x) {
  const r = Math.round(x)
  if (r === 0 || Object.is(r, -0)) return '0'
  return r > 0 ? '+' + r : String(r)
}

function colsOf(opts, fallback) {
  const c = Number(opts && opts.cols)
  return Number.isFinite(c) && c >= 20 ? Math.floor(c) : fallback
}

function langOf(vm) {
  return normalizeLang(vm && vm.lang)
}

// The budget as the model reads it: budget.md's rule applies, so a green reading older than 10 minutes is
// color 'unknown' (reason 'stale-reading'), and an old red or yellow one keeps holding. summaryText and
// budgetLine read this one.
function modelBudget(vm) {
  return (vm && vm.budget) || {}
}

// The budget as the person sees it. The 10-minute rule is for launch decisions, not for what is drawn: when
// the tracker kept the last known reading in `budget.shown` (color, pace, margin, profile worked out
// without the staleness cut), everything drawn reads that, and staleAge() says how old it is.
function budgetOf(vm) {
  const b = modelBudget(vm)
  return b.shown && typeof b.shown === 'object' ? { ...b, ...b.shown } : b
}

function colorOf(b) {
  const c = b.color
  return c === 'green' || c === 'yellow' || c === 'red' ? c : 'unknown'
}

function colorKey(vm) {
  return colorOf(budgetOf(vm))
}

function workersOf(vm) {
  return vm && Array.isArray(vm.workers) ? vm.workers.filter(Boolean) : []
}

function isActive(w) {
  return w.status === 'running' || w.status === 'launched'
}

function pendingOf(vm) {
  return vm && Array.isArray(vm.decisions) ? vm.decisions.filter(d => d && d.pending) : []
}

function since(vm, at) {
  if (!isNum(at) || !isNum(vm && vm.now)) return ''
  return fmtDuration(langOf(vm), vm.now - at)
}

function until(vm, at) {
  if (!isNum(at) || !isNum(vm && vm.now)) return ''
  return fmtDuration(langOf(vm), at - vm.now)
}

function utcClock(ms) {
  return new Date(ms).toISOString().slice(11, 16) + ' UTC'
}

// How old the reading drawn is, as a relative time ('12m'), or '' when it is fresh or its age is unknown.
function staleAge(vm) {
  const b = modelBudget(vm)
  if (!b.shown || typeof b.shown !== 'object' || !isNum(b.lastReadingAt)) return ''
  return since(vm, b.lastReadingAt)
}

function planWidth(vm, b) {
  const p = (b || budgetOf(vm)).profile
  return p && isNum(p.width) ? p.width : 0
}

function runningWorkflow(vm) {
  let best = null
  for (const w of workersOf(vm)) {
    if (w.kind === 'workflow' && w.status === 'running' && (!best || (w.startedAt || 0) > (best.startedAt || 0))) best = w
  }
  return best
}

function wfProgress(vm, w, b) {
  const total = w.agents && isNum(w.agents.total) ? w.agents.total : 0
  const max = planWidth(vm, b)
  return max > 0 ? total + '/' + max : String(total)
}

function sortedWorkers(vm) {
  const list = workersOf(vm).map((w, i) => ({ w, i }))
  list.sort((a, b) => {
    const aa = isActive(a.w) ? 1 : 0
    const bb = isActive(b.w) ? 1 : 0
    if (aa !== bb) return bb - aa
    const at = aa ? a.w.startedAt || 0 : a.w.endedAt || a.w.startedAt || 0
    const bt = bb ? b.w.startedAt || 0 : b.w.endedAt || b.w.startedAt || 0
    return bt - at || a.i - b.i
  })
  return list.map(x => x.w)
}

function isHttps(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url) && url.length <= 2048
}

function stepLabel(lang, prefix, key) {
  return has(lang, prefix + key) ? t(lang, prefix + key) : clean(key)
}

// ---------- element building ----------

const seg = (text, o) => ({ text, ...(o || {}) })

function segsWidth(segs) {
  let n = 0
  for (const s of segs) n += s && s.text ? width(s.text) : s && s.el ? s.elWidth || 0 : 0
  return n
}

// Groups side by side with a dim separator between them. The separator never shrinks, so a squeezed row
// loses the end of a value, not the space between two sections.
function joinGroups(groups, sepText) {
  const out = []
  groups.forEach((g, i) => {
    if (i > 0) out.push(seg(sepText, { dim: true, fixed: true, wrap: 'truncate-end' }))
    out.push(...g)
  })
  return out
}

// A seg with `fixed` sits in its own Box with flexShrink 0: a label that must not be squeezed.
function row(E, segs, extra) {
  const kids = []
  for (const s of segs) {
    if (!s) continue
    if (s.el) kids.push(s.el)
    else if (s.text) {
      const text = E.Text(props({ children: s.text, color: s.color, bold: s.bold, dimColor: s.dim, wrap: s.wrap }))
      kids.push(s.fixed ? E.Box({ flexShrink: 0, children: [text] }) : text)
    }
  }
  return E.Box(props({ flexDirection: 'row', ...(extra || {}), children: kids }))
}

function column(E, children, extra) {
  return E.Box(props({ flexDirection: 'column', ...(extra || {}), children: children.filter(Boolean) }))
}

function blank(E) {
  return E.Box({ height: 1 })
}

// A band, title or card section: a dim label, then its value. Sections are set apart by space only. The
// label never shrinks and nothing wraps: a value that does not fit is cut with an ellipsis.
function pair(label, value, valueStyle) {
  return [seg(label + ' ', { dim: true, fixed: true, wrap: 'truncate-end' }), seg(value, { ...(valueStyle || {}), wrap: 'truncate-end' })]
}

// The state word and what follows it, as segs, in variants from the fullest to the shortest. A fresh reading
// is the word in the pace color, bold. A reading older than 10 minutes keeps its color word but dim, with
// its age after it: 'verde (lettura di 12m fa)', then '(12m fa)', then the word alone. 'in attesa' is only
// for no reading at all (or one of unknown age).
function stateValues(vm) {
  const lang = langOf(vm)
  const key = colorKey(vm)
  const color = PACE_COLOR[key]
  const word = colorWord(lang, key)
  const age = staleAge(vm)
  if (!age) return [[seg(word, { color, bold: true })]]
  const dimWord = seg(word, { color, dim: true })
  return [
    [dimWord, seg(' ' + t(lang, 'band.stale', { ago: age }), { dim: true })],
    [dimWord, seg(' ' + t(lang, 'band.staleShort', { ago: age }), { dim: true })],
    [dimWord],
  ]
}

// The first variant of `variants` that fits `room` cells, else the shortest.
function pickFit(variants, room) {
  return variants.find(v => segsWidth(v) <= room) || variants[variants.length - 1]
}

// 'Budget verde': the dim label, then the state word (see stateValues). Band and card title.
function stateHeads(vm) {
  const label = seg(t(langOf(vm), 'band.budget') + ' ', { dim: true, fixed: true, wrap: 'truncate-end' })
  return stateValues(vm).map(v => [label, ...v.map(s => ({ ...s, wrap: 'truncate-end' }))])
}

// ---------- pace bar (text) ----------

// ━ filled (pace color), ─ empty (dim), ╋ the pace mark (week only). `which` is 'week' (default, with the
// pace mark) or 'five' (the 5-hour window: no mark, warning color while paused).
export function textBar(vm, barWidth, which) {
  const b = budgetOf(vm)
  const five = which === 'five'
  const w = clamp(Math.floor(barWidth || 16), 6, 60)
  const src = five ? b.fiveHour : b.weekly
  const used = src && isNum(src.used) ? clamp(src.used, 0, 100) : 0
  const filled = Math.round((used / 100) * w)
  const mark = !five && isNum(b.pace) ? clamp(Math.floor((b.pace / 100) * w), 0, w - 1) : -1
  const color = five && b.pausedFiveHour ? 'warning' : PACE_COLOR[colorKey(vm)]
  const cells = []
  for (let i = 0; i < w; i++) {
    if (i === mark) cells.push({ ch: '╋', kind: 'mark' })
    else if (i < filled) cells.push({ ch: '━', kind: 'fill' })
    else cells.push({ ch: '─', kind: 'empty' })
  }
  const segs = []
  for (const c of cells) {
    const last = segs[segs.length - 1]
    if (last && last.kind === c.kind) last.text += c.ch
    else {
      segs.push({
        kind: c.kind,
        text: c.ch,
        color: c.kind === 'fill' ? color : undefined,
        bold: c.kind === 'mark' ? true : undefined,
        dim: c.kind === 'empty' ? true : undefined,
      })
    }
  }
  return { text: cells.map(c => c.ch).join(''), segs: segs.map(({ kind, ...rest }) => rest) }
}

// ---------- pace bar (svg, desktop only) ----------

function xml(s) {
  return clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function paceSvg(vm, width = 200, height = 12) {
  const w = Math.round(clamp(isNum(width) ? width : 200, 40, 2000))
  const ht = Math.round(clamp(isNum(height) ? height : 12, 6, 100))
  const b = budgetOf(vm)
  const lang = langOf(vm)
  const colorName = colorKey(vm)
  const hex = PACE_HEX[colorName]
  const used = b.weekly && isNum(b.weekly.used) ? clamp(b.weekly.used, 0, 100) : 0
  const r = ht / 2
  const fx = (w * used) / 100
  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" role="img">`)
  const tip = !b.weekly
    ? t(lang, 'budget.noReading')
    : t(lang, 'band.weekLabel') + ' ' + t(lang, 'band.weekOnly', { used: pctText(used) }) +
      (isNum(b.pace) ? ', ' + t(lang, 'budget.pace', { pace: pctText(b.pace) }) : '') +
      (b.plan && isNum(b.plan.reserve) ? ', ' + t(lang, 'lbl.reserve') + ' ' + b.plan.reserve + '%' : '')
  parts.push(`<title>${xml(tip)}</title>`)
  parts.push(`<defs><clipPath id="track"><rect x="0" y="0" width="${w}" height="${ht}" rx="${r}" ry="${r}"/></clipPath></defs>`)
  parts.push(`<rect x="0" y="0" width="${w}" height="${ht}" rx="${r}" ry="${r}" fill="#8b919a" fill-opacity="0.28"/>`)
  if (fx > 0) parts.push(`<rect x="0" y="0" width="${fx.toFixed(1)}" height="${ht}" fill="${hex}" clip-path="url(#track)"/>`)
  if (b.plan && isNum(b.plan.reserve) && b.plan.reserve > 0) {
    const rx = (w * (100 - b.plan.reserve)) / 100
    parts.push(`<line x1="${rx.toFixed(1)}" y1="0" x2="${rx.toFixed(1)}" y2="${ht}" stroke="#d94b4b" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.9"/>`)
  }
  if (isNum(b.pace)) {
    const px = clamp((w * b.pace) / 100, 1, w - 1)
    parts.push(`<line x1="${px.toFixed(1)}" y1="0" x2="${px.toFixed(1)}" y2="${ht}" stroke="#1f2328" stroke-width="3"/>`)
    parts.push(`<line x1="${px.toFixed(1)}" y1="0" x2="${px.toFixed(1)}" y2="${ht}" stroke="#ffffff" stroke-width="1"/>`)
  }
  parts.push('</svg>')
  return parts.join('')
}

// ---------- the band ----------
//
// The band is made of groups (a dim label and its value), set apart by four spaces. A group has variants,
// from the fullest to the shortest, so a band that is too wide for `bodyColumns` is shortened before
// anything is dropped:
//   the week      'Settimana 17% (ritmo 21%)'  ->  'Settimana 17%'
//   the 5 hours   '5 ore 99% (pausa 4h 10m)'   ->  '5 ore 99%' (the warning color stays)
//   the workflow  'Al lavoro 3 (wf nome 7/16)' ->  the name fitted to the room (6 cells at least)  ->  'Al lavoro 3'
// The band is one row when everything fits. Else it is two: the budget groups, then the work groups. Each
// row is shortened by itself, only as far as it needs, and when it still does not fit its group of lowest
// priority goes first (night, then the week, ...). Nothing wraps: every Text is cut with an ellipsis, and
// the labels and separators never shrink.

const BAND_SEP = '    '

function rowWidth(parts) {
  let n = 0
  parts.forEach((p, i) => {
    n += segsWidth(p) + (i > 0 ? width(BAND_SEP) : 0)
  })
  return n
}

// The variants (one per group) of the least shortened row that fits `avail`: the first group that can
// still be shortened goes one step shorter, until the row fits. Null when even the shortest does not.
function shortenRow(groups, avail) {
  const at = groups.map(() => 0)
  for (;;) {
    const parts = groups.map((g, i) => g.variants[at[i]])
    if (rowWidth(parts) <= avail) return parts
    const k = groups.findIndex((g, i) => at[i] < g.variants.length - 1)
    if (k < 0) return null
    at[k] += 1
  }
}

// A row that fits `avail`: shorten first, and when that is not enough drop the group of lowest priority
// and try again. The last group stays, cut by its Text if the room is smaller than it.
function fitRow(groups, avail) {
  const list = groups.slice()
  for (;;) {
    const parts = shortenRow(list, avail)
    if (parts) return parts
    if (list.length <= 1) return list.map(g => g.variants[g.variants.length - 1])
    let low = 0
    list.forEach((g, i) => {
      if (g.prio < list[low].prio) low = i
    })
    list.splice(low, 1)
  }
}

// The rows of the band, at most two, each a list of groups' segs that fits `avail` cells.
function layoutBand(head, work, avail) {
  const full = [...head, ...work].map(g => g.variants[0])
  if (rowWidth(full) <= avail) return [full]
  if (!work.length) return [fitRow(head, avail)]
  return [fitRow(head, avail), fitRow(work, avail)]
}

// The groups of the band: `head` is the budget, `work` is what is going on. prio: the lowest goes first.
function bandGroups(vm) {
  const lang = langOf(vm)
  const b = budgetOf(vm)
  const active = workersOf(vm).filter(isActive)
  const stalled = active.filter(w => w.stalled)
  const pending = pendingOf(vm)
  // The state word with its age, then with the short age; never the bare word: the age is what marks the
  // reading as old, so a tight row loses the 5-hour and the pace before it.
  const head = [{ key: 'budget', prio: 100, variants: stateHeads(vm).slice(0, 2) }]

  if (b.weekly && isNum(b.weekly.used)) {
    const used = pctText(b.weekly.used)
    const label = t(lang, 'band.weekLabel')
    const only = pair(label, t(lang, 'band.weekOnly', { used }))
    head.push({
      key: 'week',
      prio: 30,
      variants: isNum(b.pace) ? [pair(label, t(lang, 'band.week', { used, pace: pctText(b.pace) })), only] : [only],
    })
  }
  if (b.fiveHour && isNum(b.fiveHour.used)) {
    const used = pctText(b.fiveHour.used)
    const label = t(lang, 'band.fiveLabel')
    const waiting = b.pausedFiveHour && b.fiveHour.resetsAt ? until(vm, b.fiveHour.resetsAt) : ''
    if (waiting) {
      const warn = { color: 'warning' }
      head.push({
        key: 'five',
        prio: 60,
        variants: [pair(label, t(lang, 'band.fivePaused', { used, wait: waiting }), warn), pair(label, t(lang, 'band.five', { used }), warn)],
      })
    } else head.push({ key: 'five', prio: 20, variants: [pair(label, t(lang, 'band.five', { used }))] })
  }

  const work = []
  if (active.length) {
    const label = t(lang, 'band.workingLabel')
    const variants = []
    const wf = runningWorkflow(vm)
    if (wf) {
      const a = wf.agents && isNum(wf.agents.total) ? wf.agents.total : 0
      const max = planWidth(vm)
      const top = Math.min(24, width(clean(wf.label)))
      for (let n = top; n >= Math.min(6, top); n--) {
        const name = fit(wf.label, n)
        const part = max > 0 ? t(lang, 'band.wf', { name, a, b: max }) : t(lang, 'band.wfOpen', { name, a })
        variants.push(pair(label, active.length + ' (' + part + ')'))
      }
    }
    variants.push(pair(label, String(active.length)))
    work.push({ key: 'working', prio: 40, variants })
  }
  if (stalled.length) work.push({ key: 'stalled', prio: 70, variants: [pair(t(lang, 'band.stalledLabel'), String(stalled.length), { color: 'warning' })] })
  if (pending.length) {
    work.push({ key: 'decide', prio: 80, variants: [pair(t(lang, 'band.decideLabel'), String(pending.length), { color: 'suggestion', bold: true })] })
  }
  if (vm.night && vm.night.on) {
    work.push({ key: 'night', prio: 10, variants: [[seg(t(lang, 'band.night'), { dim: true, fixed: true, wrap: 'truncate-end' })]] })
  }
  return { head, work }
}

export function bandView(vm, E, opts) {
  if (!vm || !E || !E.Box || !E.Text) return null
  const b = budgetOf(vm)
  const hasReading = !!(b.weekly || b.fiveHour)
  const active = workersOf(vm).filter(isActive)
  const night = !!(vm.night && vm.night.on)
  if (!hasReading && !active.length && !pendingOf(vm).length && !night) return null

  const avail = Math.max(20, colsOf(opts, 100) - 2)
  const { head, work } = bandGroups(vm)
  const lines = layoutBand(head, work, avail).map(parts => joinGroups(parts, BAND_SEP))
  const extra = { paddingX: 1 }
  if (lines.length === 1) return row(E, lines[0], extra)
  return column(E, lines.map(l => row(E, l)), extra)
}

// ---------- sections: a label column, then the values ----------
//
// A drawing is a list of lines; a line is a list of segs; an empty line is a blank row. Sections are
// built by `block`: the label (UPPERCASE, dim, LABEL_W cells) on the first line, the values in one
// column to its right, every following line of the section indented to that column.

function up(s) {
  return clean(s).toUpperCase()
}

function block(label, rows) {
  const list = rows.length ? rows : [[]]
  return list.map((segs, i) => [i === 0 ? seg(pad(up(label), LABEL_W), { dim: true }) : seg(' '.repeat(LABEL_W)), ...segs])
}

function lastTruncate(segs) {
  const copy = segs.slice()
  const last = copy[copy.length - 1]
  if (last && last.text && !last.wrap) copy[copy.length - 1] = { ...last, wrap: 'truncate-end' }
  return copy
}

function draw(E, lines) {
  return lines.map(l => (l.length ? row(E, lastTruncate(l)) : blank(E)))
}

function wrapLines(text, n) {
  const words = clean(text).split(' ').filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if (width(cur) + 1 + width(w) <= n) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.map(l => fit(l, n))
}

// ---------- workers table ----------

function workerCells(vm, w) {
  const lang = langOf(vm)
  const stalled = isActive(w) && !!w.stalled
  let mark
  if (stalled) mark = ['!', 'warning']
  else if (w.status === 'running') mark = ['●', 'claude']
  else if (w.status === 'launched') mark = ['○', 'claude']
  else if (w.status === 'done') mark = ['✓', 'success']
  else if (w.status === 'failed') mark = ['✗', 'error']
  else mark = ['!', 'warning']

  let model
  const parts =
    w.kind === 'workflow' && w.agents
      ? ['sonnet', 'opus', 'fable', 'other'].filter(k => w.agents[k] > 0).map(k => w.agents[k] + ' ' + k)
      : []
  if (parts.length) model = parts.join(' ')
  else {
    const fam = w.model ? modelFamily(w.model) : null
    const base = fam && fam !== 'other' ? fam : w.model ? clean(w.model) : '-'
    model = w.effort ? base + ' ' + clean(w.effort) : base
  }

  let time = ''
  if (isNum(w.startedAt)) {
    if (isActive(w)) time = isNum(vm.now) ? fmtDuration(lang, vm.now - w.startedAt) : ''
    else if (isNum(w.endedAt)) time = fmtDuration(lang, w.endedAt - w.startedAt)
  }
  const stateKey = stalled ? 'stalled' : w.status
  const stateColor = stalled || w.status === 'denied' ? 'warning' : w.status === 'failed' ? 'error' : undefined
  const agents = w.kind === 'workflow' && w.agents ? wfProgress(vm, w) : ''
  return {
    w,
    mark,
    name: clean(w.label) || clean(w.id),
    kind: has(lang, 'kind.' + w.kind) ? t(lang, 'kind.' + w.kind) : clean(w.kind),
    model,
    agents,
    detail: [agents, model].filter(Boolean).join('  '),
    pts: isNum(w.points) ? fmtPoints(w.points) : '',
    time,
    state: has(lang, 'state.' + stateKey) ? t(lang, 'state.' + stateKey) : clean(w.status),
    stateColor,
    dimState: !stateColor && w.status !== 'running',
  }
}

// The full table (Workers tab, with a header) and the compact one (overview and card: the mark says the
// state, progress and model share one cell). A column that is empty in every row takes no room.
const WORKER_FULL = [
  { k: 'name', prio: 100, cap: 30, min: 14 },
  { k: 'kind', prio: 60, cap: 6, min: 0 },
  { k: 'model', prio: 70, cap: 18, min: 0 },
  { k: 'agents', prio: 40, cap: 7, min: 0, right: true },
  { k: 'pts', prio: 30, cap: 6, min: 0, right: true },
  { k: 'time', prio: 80, cap: 7, min: 0, right: true },
  { k: 'state', prio: 20, cap: 8, min: 0 },
]
const WORKER_COMPACT = [
  { k: 'name', prio: 100, cap: 30, min: 14 },
  { k: 'kind', prio: 60, cap: 6, min: 0 },
  { k: 'detail', prio: 70, cap: 24, min: 0 },
  { k: 'pts', prio: 30, cap: 6, min: 0, right: true },
  { k: 'time', prio: 80, cap: 7, min: 0, right: true },
]

// Rows as segs, without the label column. `avail` is the width from the value column to the right edge.
function workerRows(vm, E, avail, o) {
  const lang = langOf(vm)
  const list = sortedWorkers(vm)
  const max = o && o.max ? o.max : list.length
  const shown = list.slice(0, max)
  const cells = shown.map(w => workerCells(vm, w))
  const header = !!(o && o.header)
  const compact = !!(o && o.compact)
  const head = k => t(lang, 'th.' + k)
  const gap = compact ? 3 : 2
  const gapS = ' '.repeat(gap)
  const space = Math.max(10, avail - 2)
  let cols = (compact ? WORKER_COMPACT : WORKER_FULL).map(d => ({
    ...d,
    has: cells.some(c => width(c[d.k]) > 0),
    w: Math.min(d.cap, Math.max(d.min, header ? width(head(d.k)) : 0, ...cells.map(c => width(c[d.k])))),
  }))
  cols = cols.filter((c, i) => i === 0 || c.has)
  const need = cs => cs.reduce((n, c) => n + c.w, 0) + gap * (cs.length - 1)
  while (cols.length > 1 && need(cols) > space) {
    const name = cols[0]
    const over = need(cols) - space
    if (name.w - over >= name.min) {
      name.w -= over
      break
    }
    let low = 1
    for (let i = 2; i < cols.length; i++) if (cols[i].prio < cols[low].prio) low = i
    cols.splice(low, 1)
  }
  if (need(cols) > space) cols[0].w = Math.max(4, cols[0].w - (need(cols) - space))
  const fmt = (c, s) => (c.right ? padL(cut(s, c.w), c.w) : pad(cut(s, c.w), c.w))
  const out = []
  if (header) out.push([seg('  ' + cols.map(c => fmt(c, head(c.k))).join(gapS), { dim: true })])
  const mid = cols.slice(1).filter(c => c.k !== 'state')
  const stateCol = cols.find(c => c.k === 'state')
  for (const c of cells) {
    const segs = [seg(c.mark[0] + ' ', { color: c.mark[1] })]
    const name = cols[0]
    const url = c.w.url
    if (isHttps(url) && E.Link) {
      const shownName = fit(c.name, name.w)
      segs.push({ el: E.Link({ href: url, label: shownName }), elWidth: width(shownName) })
      segs.push(seg(' '.repeat(Math.max(0, name.w - width(shownName)))))
    } else {
      segs.push(seg(pad(fit(c.name, name.w), name.w)))
    }
    if (mid.length) segs.push(seg(gapS + mid.map(m => fmt(m, c[m.k])).join(gapS), { dim: true }))
    if (stateCol) segs.push(seg(gapS + fmt(stateCol, c.state), { color: c.stateColor, dim: c.dimState }))
    out.push(segs)
  }
  if (list.length > shown.length) out.push([seg('  ' + t(lang, 'more', { n: list.length - shown.length }), { dim: true })])
  return out
}

function workerSummary(vm) {
  const lang = langOf(vm)
  const ws = workersOf(vm)
  const count = s => ws.filter(w => w.status === s).length
  const running = ws.filter(isActive).length
  const parts = []
  if (running) parts.push(tn(lang, 'workers.summary.running', running))
  if (count('done')) parts.push(tn(lang, 'workers.summary.done', count('done')))
  if (count('failed')) parts.push(tn(lang, 'workers.summary.failed', count('failed')))
  if (count('denied')) parts.push(tn(lang, 'workers.summary.denied', count('denied')))
  return parts
}

function workersLines(vm, E, o) {
  const lang = langOf(vm)
  if (!workersOf(vm).length) return block(t(lang, 'row.workers'), [[seg(t(lang, 'empty.workers'), { dim: true })]])
  // the counts side by side as far as the room goes, then on the next row: none is ever cut
  const rows = pack(workerSummary(vm), Math.max(10, o.inner - LABEL_W)).map(r => [seg(r)])
  rows.push(...workerRows(vm, E, o.inner - LABEL_W, o))
  return block(t(lang, 'row.workers'), rows)
}

// ---------- marks and checklists ----------

function listOf(x) {
  return Array.isArray(x) ? x.filter(Boolean) : []
}

// done = ✓ (success), to do = ○, probable = dim ○ and a dim '?' after the label.
function checkSegs(state, label) {
  if (state === true) return [seg('✓ ', { color: 'success' }), seg(label)]
  if (state === 'probable') return [seg('○ ', { dim: true }), seg(label + ' ?', { dim: true })]
  return [seg('○ '), seg(label)]
}

function anyProbable(items) {
  return items.some(i => i.done === 'probable')
}

function stageSegs(lang, stage) {
  const name = stepLabel(lang, 'stage.', stage.key)
  if (stage.state === 'done') return [seg('✓ ', { color: 'success' }), seg(name)]
  if (stage.state === 'active') return [seg('◉ ', { color: 'claude', bold: true }), seg(name, { color: 'claude', bold: true })]
  return [seg('○ ', { dim: true }), seg(name, { dim: true })]
}

function flowStages(vm) {
  const stages = listOf(vm.flow && vm.flow.stages)
  return stages.length ? stages : STAGES.map(key => ({ key, state: 'todo' }))
}

// The stage chips on one line: full names, then tighter, then marks only for the stages still to do.
function flowChips(lang, stages, avail, extra) {
  const build = (sep, compact) => {
    const out = []
    stages.forEach((s, i) => {
      if (i > 0) out.push(seg(sep))
      if (compact && s.state === 'todo') out.push(seg('○', { dim: true }))
      else out.push(...stageSegs(lang, s))
    })
    return out
  }
  let chips = build('  ', false)
  if (segsWidth(chips) > avail) chips = build(' ', false)
  if (segsWidth(chips) > avail) chips = build(' ', true)
  if (extra && segsWidth(chips) + width(extra) <= avail) chips.push(seg(extra, { dim: true }))
  return chips
}

// ---------- the budget block ----------

// What follows the weekly percent: pace, margin, and the reason when it is not just the pace.
function weekPieces(vm) {
  const lang = langOf(vm)
  const b = budgetOf(vm)
  const out = []
  if (isNum(b.pace)) out.push(t(lang, 'budget.pace', { pace: pctText(b.pace) }))
  if (isNum(b.margin)) out.push(t(lang, 'budget.margin', { margin: signed(b.margin) }))
  if (b.reason && b.reason !== 'pace' && has(lang, 'reason.' + b.reason)) out.push(t(lang, 'reason.' + b.reason))
  return out
}

// What follows the 5-hour percent: the wait while it is paused (warning), else when it resets.
function fivePiece(vm) {
  const lang = langOf(vm)
  const b = budgetOf(vm)
  if (!b.fiveHour || !isNum(b.fiveHour.used)) return null
  if (b.pausedFiveHour && b.fiveHour.resetsAt) return { text: t(lang, 'budget.wait', { wait: until(vm, b.fiveHour.resetsAt) }), warn: true }
  if (b.fiveHour.resetsAt) return { text: t(lang, 'budget.resetIn', { in: until(vm, b.fiveHour.resetsAt) }), warn: false }
  return null
}

// Pieces joined by GAP into as few lines as fit `room` cells; a piece wider than a line wraps by words.
function pack(pieces, room) {
  const rows = []
  let cur = ''
  for (const p of pieces) {
    if (width(p) > room) {
      if (cur) rows.push(cur)
      const wrapped = wrapLines(p, room)
      cur = wrapped.pop() || ''
      rows.push(...wrapped)
    } else if (!cur) cur = p
    else if (width(cur) + width(GAP) + width(p) <= room) cur += GAP + p
    else {
      rows.push(cur)
      cur = p
    }
  }
  if (cur) rows.push(cur)
  return rows
}

// Adds a piece to the last row after a GAP when it fits `avail` cells, else on a row of its own.
function appendPiece(rows, text, style, avail) {
  const last = rows[rows.length - 1]
  const lastW = last ? last.reduce((n, s) => n + width(s.text || ''), 0) : 0
  if (last && lastW + width(GAP) + width(text) <= avail) last.push(seg(GAP + text, style))
  else rows.push([seg(text, style)])
}

// A launch profile as text that fits `fits` cells: the long form with three spaces, the short form, then
// both with two spaces, then the name alone, then the end is cut. No numbers (a plan the table does not
// know): the name alone.
function profileText(lang, p, fits) {
  const none = isNum(p.width) && p.width === 0 && isNum(p.cloud) && p.cloud === 0
  const forms = p.name === 'Solo'
    ? [t(lang, 'budget.profileSolo', { name: p.name }), t(lang, 'budget.profileSoloShort', { name: p.name })]
    : none
    ? [t(lang, 'budget.profileNone', { name: p.name })]
    : isNum(p.width) && isNum(p.cloud)
      ? [
          t(lang, 'budget.profile', { name: p.name, width: p.width, cloud: p.cloud }),
          t(lang, 'budget.profileShort', { name: p.name, width: p.width, cloud: p.cloud }),
        ]
      : [clean(p.name)]
  const name = clean(p.name)
  const tries = [...forms, ...forms.map(f => f.replace(/ {3}/g, '  ')), name]
  return cut(tries.find(f => width(f) <= fits) || name, fits)
}

// The rows of the budget block, without the label column. mode 'quadro' draws a bar for the week and the
// 5 hours (an Svg for the week on Desktop when o.svg), the plan, and the profile when it is not the plan's;
// mode 'night' is text only, with the plan details and the age of the reading. A row never goes past
// o.inner - LABEL_W cells: details go before the bar shrinks, and the 5-hour detail goes to a row of its own.
function budgetRows(vm, E, o) {
  const lang = langOf(vm)
  const b = budgetOf(vm)
  const bars = o.mode !== 'night'
  const subW = Math.max(...['lbl.week', 'lbl.five', 'lbl.plan', 'lbl.profile', 'lbl.reading'].map(k => width(t(lang, k)))) + 2
  const sub = key => seg(pad(t(lang, key), subW), { dim: true })
  const weekOn = !!(b.weekly && isNum(b.weekly.used))
  const five = fivePiece(vm)
  const fiveOn = !!(b.fiveHour && isNum(b.fiveHour.used))
  const weekPct = weekOn ? pctText(b.weekly.used) + '%' : ''
  const fivePct = fiveOn ? pctText(b.fiveHour.used) + '%' : ''
  const pctW = Math.max(3, width(weekPct), width(fivePct))
  // the state word first; with an old reading the age follows it, cut to what the row has
  const rows = [pickFit(stateValues(vm), Math.max(10, o.inner - LABEL_W))]
  const planName = b.plan && b.plan.name ? b.plan.name : ''
  const planKnown = !(b.plan && b.plan.known === false)

  if (bars) {
    // The bar takes what the row leaves, 8 to 26 cells (the Svg is SVG_CELLS wide). When the details
    // leave less than that, the last ones go: reason, then margin, then pace. When even the 5-hour
    // detail leaves less, it moves to a row of its own under the bar. An Svg that does not fit becomes
    // the text bar.
    const base = o.inner - LABEL_W - subW - 2 - pctW
    const gapW = width(GAP)
    const fiveW = five ? width(five.text) : 0
    const plan = minBar => {
      const bits = weekPieces(vm)
      const inline = fiveW > 0 && base - gapW - fiveW >= minBar
      const roomWith = list => {
        const detail = Math.max(list.length ? width(list.join(GAP)) : 0, inline ? fiveW : 0)
        return base - (detail ? gapW + detail : 0)
      }
      while (bits.length && roomWith(bits) < minBar) bits.pop()
      return { bits, inline, room: roomWith(bits) }
    }
    let layout = o.svg ? plan(SVG_CELLS) : null
    const useSvg = !!(layout && layout.room >= SVG_CELLS)
    if (!useSvg) layout = plan(8)
    const { bits, inline } = layout
    const barW = useSvg ? SVG_CELLS : clamp(layout.room, 6, 26)
    const pct = s => seg('  ' + padL(s, pctW))
    if (weekOn) {
      const used = b.weekly.used
      const lead = [sub('lbl.week')]
      if (useSvg) {
        const svgW = 150
        const svgH = 12
        lead.push({
          el: E.Svg({
            source: paceSvg(vm, svgW, svgH),
            alt:
              t(lang, 'band.weekLabel') + ' ' +
              (isNum(b.pace) ? t(lang, 'band.week', { used: pctText(used), pace: pctText(b.pace) }) : t(lang, 'band.weekOnly', { used: pctText(used) })),
            width: svgW,
            height: svgH,
          }),
          elWidth: barW,
        })
      } else {
        for (const s of textBar(vm, barW, 'week').segs) lead.push(seg(s.text, s))
      }
      lead.push(pct(weekPct))
      if (bits.length) lead.push(seg(GAP + bits.join(GAP), { dim: true }))
      rows.push(lead)
    } else {
      rows.push([sub('lbl.week'), seg(t(lang, 'budget.noReading'), { dim: true })])
    }
    if (fiveOn) {
      const lead = [sub('lbl.five')]
      for (const s of textBar(vm, barW, 'five').segs) lead.push(seg(s.text, s))
      lead.push(pct(fivePct))
      const style = five ? { color: five.warn ? 'warning' : undefined, dim: !five.warn } : null
      if (five && inline) lead.push(seg(GAP + five.text, style))
      rows.push(lead)
      if (five && !inline) rows.push([seg(' '.repeat(subW)), seg(cut(five.text, Math.max(8, o.inner - LABEL_W - subW)), style)])
    }
    // The plan is the person's plan. The profile is what today's color allows: it gets a row of its own
    // only when it is not the plan's (yellow steps down, red launches nothing).
    const fits = o.inner - LABEL_W - subW
    if (planName) {
      const text = planKnown
        ? profileText(lang, PROFILES[planName] || { name: planName }, fits)
        : cut(t(lang, 'budget.planUnknown') + GAP + t(lang, 'budget.planAssumed', { name: planName }), fits)
      rows.push([sub('lbl.plan'), seg(text, { dim: true })])
    }
    const p = b.profile
    if (p && (!planName || p.name !== planName)) {
      const text = colorKey(vm) === 'red' ? t(lang, 'budget.noLaunch') : profileText(lang, p, fits)
      rows.push([sub('lbl.profile'), seg(cut(text, fits), { color: PACE_COLOR[colorKey(vm)] })])
    }
    return rows
  }

  // night: text only, the pieces of a row packed into as many lines as the width needs
  const room = Math.max(10, o.inner - LABEL_W - subW)
  const indent = seg(' '.repeat(subW))
  const pushPacked = (key, first, pieces, restStyle) => {
    pack(first ? [first, ...pieces] : pieces, room).forEach((text, i) => {
      if (i > 0) rows.push([indent, seg(text, restStyle)])
      else if (first) rows.push([sub(key), seg(first), seg(text.slice(width(first)), restStyle)])
      else rows.push([sub(key), seg(text, restStyle)])
    })
  }
  if (weekOn) {
    const bits = weekPieces(vm)
    if (b.weekly.resetsAt) bits.push(t(lang, 'budget.resetIn', { in: until(vm, b.weekly.resetsAt) }))
    pushPacked('lbl.week', weekPct, bits, { dim: true })
  } else {
    rows.push([sub('lbl.week'), seg(t(lang, 'budget.noReading'), { dim: true })])
  }
  if (fiveOn) pushPacked('lbl.five', fivePct, five ? [five.text] : [], { color: five && five.warn ? 'warning' : undefined, dim: !(five && five.warn) })
  if (b.plan) {
    const bits = []
    if (!planKnown) bits.push(t(lang, 'budget.planAssumed', { name: planName }))
    if (isNum(b.plan.reserve)) bits.push(t(lang, 'budget.reserve', { reserve: b.plan.reserve }))
    for (const r of listOf(b.resets).slice(0, 2)) if (r.expires) bits.push(t(lang, 'budget.banked', { date: r.expires }))
    pushPacked('lbl.plan', planKnown ? planName : t(lang, 'budget.planUnknown'), bits, { dim: true })
  }
  if (isNum(b.lastReadingAt) && isNum(vm.now)) {
    rows.push([sub('lbl.reading'), seg(t(lang, 'budget.readAgo', { ago: since(vm, b.lastReadingAt) }), { dim: true })])
  }
  return rows
}

// ---------- the one-line block: merge, round, flow, decisions ----------

function mergeInfo(vm) {
  const lang = langOf(vm)
  const steps = listOf(vm.merge && vm.merge.steps)
  const hasPr = !!(vm.merge && isNum(vm.merge.pr))
  const anything = steps.some(s => s.done === true || s.done === 'probable') || hasPr
  if (!anything) return null
  const done = steps.filter(s => s.done === true).length
  const next = steps.find(s => s.done === false)
  return {
    first: (hasPr ? '#' + vm.merge.pr : '–') + GAP + t(lang, 'count.of', { done, total: steps.length }),
    next: next ? t(lang, 'word.next', { next: stepLabel(lang, 'merge.step.', next.key) }) : '',
  }
}

function roundInfo(vm) {
  const lang = langOf(vm)
  const items = listOf(vm.round && vm.round.items)
  const anything = items.some(s => s.done === true || s.done === 'probable') || !!(vm.round && isNum(vm.round.since))
  if (!anything) return null
  const done = items.filter(s => s.done === true).length
  const next = items.find(s => s.done === false)
  return {
    first: t(lang, 'count.of', { done, total: items.length }),
    next: next ? t(lang, 'word.next', { next: stepLabel(lang, 'round.item.', next.key) }) : '',
  }
}

function oneLiners(vm, o) {
  const lang = langOf(vm)
  const avail = Math.max(10, o.inner - LABEL_W)
  const merge = mergeInfo(vm)
  const round = roundInfo(vm)
  const firstW = Math.max(merge ? width(merge.first) : 0, round ? width(round.first) : 0)
  const rowOf = info => {
    const segs = [seg(info.next ? pad(info.first, firstW) : info.first)]
    if (info.next) segs.push(seg(GAP + fit(info.next, Math.max(8, avail - firstW - width(GAP))), { dim: true }))
    return segs
  }
  const lines = []
  lines.push(...block(t(lang, 'row.merge'), [merge ? rowOf(merge) : [seg(t(lang, 'empty.merge'), { dim: true })]]))
  lines.push(...block(t(lang, 'row.round'), [round ? rowOf(round) : [seg(t(lang, 'empty.round'), { dim: true })]]))

  const stages = flowStages(vm)
  if (stages.some(s => s.state !== 'todo')) {
    const cur = vm.flow && vm.flow.current
    const extra = cur && !STAGES.includes(cur) ? '  ' + t(lang, 'flow.now', { name: clean(cur) }) : ''
    lines.push(...block(t(lang, 'row.flow'), [flowChips(lang, stages, avail, extra)]))
  }

  const pending = pendingOf(vm)
  if (pending.length) {
    const count = tn(lang, 'decisions.waiting', pending.length)
    const leadW = width(count) + 2
    const room = Math.max(10, avail - leadW)
    const rows = pending.slice(0, 3).map((d, i) =>
      i === 0
        ? [seg(count, { color: 'suggestion', bold: true }), seg(': '), seg(fit(d.text, room))]
        : [seg(' '.repeat(leadW)), seg(fit(d.text, room))],
    )
    if (pending.length > 3) rows.push([seg(' '.repeat(leadW)), seg(t(lang, 'more', { n: pending.length - 3 }), { dim: true })])
    lines.push(...block(t(lang, 'row.decisions'), rows))
  }
  return lines
}

// ---------- the Quadro tab and the card share these lines ----------

function overviewLines(vm, E, o) {
  const lang = langOf(vm)
  return [
    ...block(t(lang, 'row.budget'), budgetRows(vm, E, { inner: o.inner, svg: o.svg, mode: 'quadro' })),
    [],
    ...workersLines(vm, E, { inner: o.inner, max: o.maxWorkers, compact: true }),
    [],
    ...oneLiners(vm, o),
  ]
}

// ---------- the inline card ----------

export function cardView(vm, E, opts) {
  if (!vm || !E || !E.Box || !E.Text) return null
  const lang = langOf(vm)
  const cols = colsOf(opts, 80)
  const outer = Math.min(cols, 100)
  const inner = Math.max(24, outer - 4)
  const svg = !!(opts && opts.surface === 'desktop' && typeof E.Svg === 'function')
  const rows = draw(E, overviewLines(vm, E, { inner, svg, maxWorkers: 6 }))
  // the state at the right takes what the title leaves: a reading's age shortens before it overflows
  const name = t(lang, 'title')
  const head = pickFit(stateHeads(vm), inner - width(name) - 1)
  const title = E.Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    children: [
      E.Text({ children: name, bold: true, color: 'claude' }),
      row(E, head),
    ],
  })
  const footer = E.Text({ children: t(lang, 'footer.snapshot'), dimColor: true, wrap: 'truncate-end' })
  return E.Box({
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: 'subtle',
    paddingX: 1,
    width: outer,
    children: [title, ...rows, blank(E), footer],
  })
}

// ---------- the pane ----------

function normalizeTab(tab) {
  if (TABS.includes(tab)) return tab
  const n = Number(tab)
  if (Number.isInteger(n) && n >= 1 && n <= TABS.length) return TABS[n - 1]
  return 'overview'
}

function prLines(vm, E, inner) {
  const lang = langOf(vm)
  const prs = listOf(vm.prs)
  if (!prs.length) return block(t(lang, 'sec.prs'), [[seg(t(lang, 'empty.prs'), { dim: true })]])
  const avail = inner - LABEL_W
  const numW = Math.max(...prs.map(p => width('#' + p.number)))
  const checkWord = { green: t(lang, 'checks.green'), red: t(lang, 'checks.red'), pending: '…', none: '' }
  const checkColor = { green: 'success', red: 'error', pending: 'warning', none: undefined }
  const checkMark = { green: '✓', red: '✗', pending: '○', none: '–' }
  const rows = [[seg(String(prs.length))]]
  const shown = prs.slice(0, 20)
  const stateOf = p => {
    const word = has(lang, 'pr.' + p.state) ? t(lang, 'pr.' + p.state) : clean(p.state)
    return p.draft ? t(lang, 'pr.withDraft', { state: word }) : word
  }
  // The columns are the number, the state, the checks mark and word, then the title. The title keeps at
  // least 10 cells: when the room is short the state column takes what its words need, then the checks
  // word goes (the mark stays), then the state is cut.
  let stateW = 12
  let checkW = 9
  const roomOf = () => avail - numW - stateW - checkW - 6
  if (roomOf() < 12) stateW = Math.min(stateW, Math.max(...shown.map(p => width(stateOf(p)))))
  if (roomOf() < 12) checkW = 0
  if (roomOf() < 10) stateW = Math.max(4, stateW - (10 - roomOf()))
  const room = Math.max(8, roomOf())
  for (const p of shown) {
    const num = '#' + p.number
    const state = stateOf(p)
    const checks = p.checks in checkMark ? p.checks : 'none'
    const segs = []
    if (isHttps(p.url) && E.Link) {
      segs.push({ el: E.Link({ href: p.url, label: num }), elWidth: width(num) })
      segs.push(seg(' '.repeat(Math.max(0, numW - width(num)) + 2)))
    } else segs.push(seg(pad(num, numW + 2)))
    segs.push(seg(pad(fit(state, stateW), stateW + 2), { dim: true }))
    segs.push(seg(checkMark[checks] + ' ', { color: checkColor[checks], dim: checks === 'none' }))
    if (checkW) segs.push(seg(pad(checkWord[checks], checkW), { color: checkColor[checks] }))
    segs.push(seg(fit(p.title, room), { wrap: 'truncate-end' }))
    rows.push(segs)
  }
  return block(t(lang, 'sec.prs'), rows)
}

function workersBody(vm, E, inner) {
  return workersLines(vm, E, { inner, header: true, max: 40 })
}

function mergeBody(vm, E, inner) {
  const lang = langOf(vm)
  const lines = []
  const steps = listOf(vm.merge && vm.merge.steps)
  const pr = vm.merge && isNum(vm.merge.pr) ? '#' + vm.merge.pr : ''
  const mergeOn = steps.some(s => s.done === true || s.done === 'probable') || !!pr
  const mergeRows = mergeOn
    ? steps.map(s => checkSegs(s.done, stepLabel(lang, 'merge.step.', s.key)))
    : [[seg(t(lang, 'empty.merge'), { dim: true })]]
  if (mergeOn && pr) mergeRows.unshift([seg(pr)])
  lines.push(...block(t(lang, 'sec.merge'), mergeRows))
  lines.push([])
  const items = listOf(vm.round && vm.round.items)
  const roundOn = items.some(s => s.done === true || s.done === 'probable') || !!(vm.round && isNum(vm.round.since))
  const sinceText = vm.round && isNum(vm.round.since) ? t(lang, 'round.since', { ago: since(vm, vm.round.since) }) : ''
  const roundRows = roundOn
    ? items.map(s => checkSegs(s.done, stepLabel(lang, 'round.item.', s.key)))
    : [[seg(t(lang, 'empty.round'), { dim: true })]]
  if (roundOn && sinceText) roundRows.unshift([seg(sinceText, { dim: true })])
  if (anyProbable(steps) || anyProbable(items)) roundRows.push([seg('? ' + t(lang, 'probable'), { dim: true })])
  lines.push(...block(t(lang, 'sec.round'), roundRows))
  lines.push([])
  lines.push(...prLines(vm, E, inner))
  return lines
}

function flowBody(vm, E, inner) {
  const lang = langOf(vm)
  const avail = inner - LABEL_W
  const flow = vm.flow || {}
  const stages = flowStages(vm)
  const side = listOf(flow.side)
  const artifacts = listOf(flow.artifacts)
  const warnings = listOf(flow.warnings)
  const lines = []
  const on = stages.some(s => s.state !== 'todo') || side.length || artifacts.length
  const stageRows = stages.map(s => {
    const segs = stageSegs(lang, s)
    if (s.state === 'active') segs.push(seg('  ' + t(lang, 'word.now'), { dim: true }))
    return segs
  })
  if (!on) stageRows.push([seg(t(lang, 'empty.flow'), { dim: true })])
  lines.push(...block(t(lang, 'sec.flow'), stageRows))
  if (side.length) {
    lines.push([])
    const nameW = Math.max(...side.map(s => width(clean(s.key))))
    lines.push(
      ...block(
        t(lang, 'sec.side'),
        side.slice(0, 8).map(s => [
          seg(pad(clean(s.key), nameW + 3)),
          seg(isNum(s.at) ? t(lang, 'flow.ago', { ago: since(vm, s.at) }) : '', { dim: true }),
        ]),
      ),
    )
  }
  if (artifacts.length) {
    lines.push([])
    const kindOf = a => (has(lang, 'artifact.' + a.kind) ? t(lang, 'artifact.' + a.kind) : clean(a.kind))
    const kindW = Math.max(...artifacts.map(a => width(kindOf(a))))
    const rows = [[seg(String(artifacts.length))]]
    for (const a of artifacts.slice(0, 8)) {
      const label = clean(a.label || a.path || a.url)
      const room = Math.max(10, avail - kindW - 3)
      const segs = [seg(pad(kindOf(a), kindW + 3), { dim: true })]
      if (isHttps(a.url) && E.Link) segs.push({ el: E.Link({ href: a.url, label: fit(label, room) }), elWidth: Math.min(width(label), room) })
      else segs.push(seg(fit(label, room), { wrap: 'truncate-end' }))
      rows.push(segs)
    }
    lines.push(...block(t(lang, 'sec.artifacts'), rows))
  }
  if (warnings.length) {
    lines.push([])
    lines.push(
      ...block(
        t(lang, 'sec.warnings'),
        warnings.slice(0, 6).map(w => {
          const text = has(lang, 'warning.' + w.key) ? t(lang, 'warning.' + w.key) : clean(w.text || w.key)
          return [seg('! ', { color: 'warning' }), seg(fit(text, Math.max(10, avail - 2)), { wrap: 'truncate-end' })]
        }),
      ),
    )
  }
  return lines
}

function nightBody(vm, E, inner, actions) {
  const lang = langOf(vm)
  const avail = Math.max(20, inner - LABEL_W)
  const night = vm.night || {}
  const b = budgetOf(vm)
  const lines = []

  const nightRows = []
  const state = night.on ? t(lang, 'night.state.on') : t(lang, 'night.state.off')
  const stateSegs = [seg(state, { bold: true, color: night.on ? 'claude' : undefined })]
  if (night.on && isNum(night.since)) stateSegs.push(seg(GAP + t(lang, 'night.since', { ago: since(vm, night.since) }), { dim: true }))
  nightRows.push(stateSegs)
  if (night.on) {
    nightRows.push([
      seg(
        isNum(night.nextWakeAt) && night.nextWakeAt > (vm.now || 0)
          ? t(lang, 'night.nextWake', { in: until(vm, night.nextWakeAt) })
          : t(lang, 'night.noWake'),
        { dim: true },
      ),
    ])
    if (isNum(night.pointsSince)) nightRows.push([seg(t(lang, 'night.points', { points: fmtPoints(night.pointsSince) }), { dim: true })])
  }
  const toggleLabel = night.on ? t(lang, 'btn.nightOff') : t(lang, 'btn.nightOn')
  nightRows.push([
    {
      el: E.Button(
        props({
          key: 'night-toggle',
          label: toggleLabel,
          hotkey: 'n',
          plain: true,
          variant: 'secondary',
          onPress: () => (actions && actions.toggleNight ? actions.toggleNight() : undefined),
        }),
      ),
      elWidth: width(toggleLabel) + 3,
    },
  ])
  for (const l of wrapLines(t(lang, 'night.hint'), avail)) nightRows.push([seg(l, { dim: true })])
  lines.push(...block(t(lang, 'sec.night'), nightRows))

  lines.push([])
  const rc = vm.runCost || {}
  const costRows = []
  if (isNum(rc.unitPoints) && rc.unitPoints > 0) {
    const unitRows = wrapLines(t(lang, 'cost.unit', { points: fmtPoints(rc.unitPoints) }), avail).map(l => [seg(l)])
    appendPiece(unitRows, t(lang, 'cost.samples', { n: rc.samples || 0 }), { dim: true }, avail)
    costRows.push(...unitRows)
    const w = planWidth(vm)
    const full = w > 0 ? estimatePoints({ sonnet: w }, rc.unitPoints) : null
    if (isNum(full)) {
      const reserve = b.plan && isNum(b.plan.reserve) ? b.plan.reserve : 0
      const left = b.weekly ? 100 - reserve - b.weekly.used - (b.inFlight || 0) : null
      const fitsOk = isNum(left) ? full <= left : null
      const fullRows = wrapLines(t(lang, 'cost.full', { width: w, points: fmtPoints(full) }), avail).map(l => [seg(l, { dim: true })])
      if (fitsOk !== null) appendPiece(fullRows, fitsOk ? t(lang, 'cost.fits') : t(lang, 'cost.noFit'), { color: fitsOk ? 'success' : 'warning' }, avail)
      costRows.push(...fullRows)
    }
  } else {
    for (const l of wrapLines(t(lang, 'cost.none'), avail)) costRows.push([seg(l, { dim: true })])
  }
  if (rc.last) {
    const lastText = isNum(rc.last.agents)
      ? t(lang, 'cost.last', { label: fit(rc.last.label, 30), points: fmtPoints(rc.last.points), agents: rc.last.agents })
      : t(lang, 'cost.lastNoAgents', { label: fit(rc.last.label, 30), points: fmtPoints(rc.last.points) })
    costRows.push([seg(cut(lastText, avail), { dim: true })])
  }
  lines.push(...block(t(lang, 'sec.cost'), costRows))

  lines.push([])
  lines.push(...block(t(lang, 'sec.budget'), budgetRows(vm, E, { inner, svg: false, mode: 'night' })))
  return lines
}

export function paneView(vm, E, opts) {
  if (!vm || !E || !E.Box || !E.Text) return null
  const lang = langOf(vm)
  const cols = colsOf(opts, 80)
  const inner = Math.max(24, cols - 2)
  const tab = normalizeTab(opts && opts.tab)
  const actions = (opts && opts.actions) || {}

  // Plain buttons: the terminal draws `1: Quadro`. The current tab is at full strength, the others dim.
  const tabButtons = TABS.map((key, i) =>
    E.Button(
      props({
        key: 'tab-' + key,
        label: t(lang, 'tab.' + key),
        hotkey: String(i + 1),
        plain: true,
        dimColor: key !== tab,
        variant: key === tab ? 'primary' : 'secondary',
        onPress: () => (actions.setTab ? actions.setTab(key) : undefined),
      }),
    ),
  )
  // No close button of our own: the pane already draws its close mark at the top right, and Esc closes it
  // (opened with closeOnEscape), so a second "x: Close" would only repeat it.
  const tabsRow = E.Box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: cols < 76 ? 1 : 3, children: tabButtons })
  const rule = E.Text({ children: '─'.repeat(inner), color: 'subtle' })

  let lines
  if (tab === 'workers') lines = workersBody(vm, E, inner)
  else if (tab === 'merge') lines = mergeBody(vm, E, inner)
  else if (tab === 'flow') lines = flowBody(vm, E, inner)
  else if (tab === 'night') lines = nightBody(vm, E, inner, actions)
  else lines = overviewLines(vm, E, { inner, svg: false, maxWorkers: 4 })

  return E.Box({ flexDirection: 'column', paddingX: 1, children: [tabsRow, rule, ...draw(E, lines)] })
}

// ---------- texts for the model (English) ----------

function reasonEn(reason) {
  return has('en', 'reason.' + reason) ? t('en', 'reason.' + reason) : clean(reason)
}

// One line for the model context, e.g.
// coordinator-lens budget: green (margin -4) · profile Max 20x: 16 agents/run, 3 cloud sessions · weekly 17% (pace 20) · 5h 0% · Fable window not readable
export function budgetLine(vm) {
  // the model reads the budget with budget.md's 10-minute rule: an old green reading is 'unknown (old reading)'
  const b = modelBudget(vm)
  const color = colorOf(b)
  const bits = []
  if (color === 'unknown') bits.push(reasonEn(b.reason || 'no-reading'))
  else {
    if (b.reason && b.reason !== 'pace') bits.push(reasonEn(b.reason))
    if (isNum(b.margin)) bits.push('margin ' + signed(b.margin))
  }
  const parts = ['coordinator-lens budget: ' + color + (bits.length ? ' (' + bits.join(', ') + ')' : '')]
  const p = b.profile
  if (p) {
    parts.push(
      'profile ' +
        p.name +
        ': ' +
        (!p.width && !p.cloud
          ? 'no new launches'
          : p.width + ' agents/run, ' + p.cloud + ' cloud session' + (p.cloud === 1 ? '' : 's')),
    )
  }
  if (b.weekly && isNum(b.weekly.used)) {
    const extra = []
    if (isNum(b.pace)) extra.push('pace ' + pctText(b.pace))
    if (isNum(b.inFlight) && b.inFlight > 0) extra.push('in flight +' + fmtPoints(b.inFlight))
    parts.push('weekly ' + pctText(b.weekly.used) + '%' + (extra.length ? ' (' + extra.join(', ') + ')' : ''))
  } else parts.push('weekly not readable')
  if (b.fiveHour && isNum(b.fiveHour.used)) {
    parts.push(
      '5h ' +
        pctText(b.fiveHour.used) +
        '%' +
        (b.pausedFiveHour ? ' (paused' + (b.fiveHour.resetsAt ? ', resets ' + utcClock(b.fiveHour.resetsAt) : '') + ')' : ''),
    )
  } else parts.push('5h not readable')
  const banked = listOf(b.resets).find(r => r.expires)
  if (banked) parts.push('weekly reset banked until ' + banked.expires)
  parts.push('Fable window not readable')
  return parts.join(' · ')
}

function enDuration(ms) {
  return fmtDuration('en', ms)
}

// The /coord command text: at most 10 lines, English.
export function summaryText(vm) {
  const lines = []
  // the model reads the budget with budget.md's 10-minute rule: an old green reading is 'budget: unknown'
  const b = modelBudget(vm)
  const color = colorOf(b)
  const now = vm && isNum(vm.now) ? vm.now : null

  const head = ['budget: ' + color]
  if (color !== 'unknown' && isNum(b.margin)) head.push('margin ' + signed(b.margin))
  if (b.weekly && isNum(b.weekly.used)) head.push('weekly ' + pctText(b.weekly.used) + '%' + (isNum(b.pace) ? ' (pace ' + pctText(b.pace) + ')' : ''))
  if (b.fiveHour && isNum(b.fiveHour.used)) head.push('5h ' + pctText(b.fiveHour.used) + '%' + (b.pausedFiveHour ? ' paused' : ''))
  if (b.profile) head.push('profile ' + b.profile.name)
  // commas, not ' · ': when no card is drawn the person reads this row as it is
  lines.push(head.join(', '))

  const ws = sortedWorkers(vm || {})
  const active = ws.filter(isActive)
  const count = s => ws.filter(w => w.status === s).length
  const wparts = []
  if (active.length) {
    const named = active.slice(0, 3).map(w => {
      const base = fit(w.label || w.id, 28) + ' ' + (has('en', 'kind.' + w.kind) ? t('en', 'kind.' + w.kind) : clean(w.kind))
      const prog = w.kind === 'workflow' && w.agents ? ' ' + wfProgress(vm, w, b) : ''
      return base + prog + (w.stalled ? ' stalled' : '')
    })
    const more = active.length > 3 ? ', +' + (active.length - 3) + ' more' : ''
    wparts.push(active.length + ' running (' + named.join(', ') + more + ')')
  }
  if (count('done')) wparts.push(count('done') + ' done')
  if (count('failed')) wparts.push(count('failed') + ' failed')
  if (count('denied')) wparts.push(count('denied') + ' denied')
  lines.push('workers: ' + (wparts.length ? wparts.join(', ') : 'none'))

  const prs = listOf(vm && vm.prs)
  if (prs.length) {
    const shown = prs.slice(0, 4).map(p => '#' + p.number + ' ' + clean(p.state) + (p.checks && p.checks !== 'none' ? ' ' + p.checks : ''))
    lines.push('prs: ' + shown.join(', ') + (prs.length > 4 ? ' (+' + (prs.length - 4) + ' more)' : ''))
  }

  const steps = listOf(vm && vm.merge && vm.merge.steps)
  const mergePr = vm && vm.merge && isNum(vm.merge.pr) ? '#' + vm.merge.pr : null
  if (mergePr || steps.some(s => s.done === true || s.done === 'probable')) {
    const next = steps.find(s => s.done === false)
    lines.push(
      'merge: ' +
        (mergePr || 'no pr') +
        ' ' +
        steps.filter(s => s.done === true).length +
        '/' +
        steps.length +
        ' steps' +
        (next ? ', next ' + stepLabel('en', 'merge.step.', next.key) : ''),
    )
  } else lines.push('merge: none in progress')

  const items = listOf(vm && vm.round && vm.round.items)
  if (items.some(s => s.done === true || s.done === 'probable') || (vm && vm.round && isNum(vm.round.since))) {
    const next = items.find(s => s.done === false)
    lines.push(
      'round: ' +
        items.filter(s => s.done === true).length +
        '/' +
        items.length +
        ' checks' +
        (next ? ', next ' + stepLabel('en', 'round.item.', next.key) : ''),
    )
  } else lines.push('round: not started')

  const stages = listOf(vm && vm.flow && vm.flow.stages)
  const doneStages = stages.filter(s => s.state === 'done').map(s => s.key)
  const activeStage = stages.find(s => s.state === 'active')
  if (doneStages.length || activeStage) {
    const bits = []
    if (doneStages.length) bits.push('done ' + doneStages.join(', '))
    if (activeStage) bits.push('now ' + activeStage.key)
    lines.push('flow: ' + bits.join('; '))
  }

  const pending = pendingOf(vm)
  lines.push(
    pending.length
      ? 'decisions: ' + pending.length + ' waiting: ' + pending.slice(0, 2).map(d => '"' + fit(d.text, 70) + '"').join('; ')
      : 'decisions: none waiting',
  )

  const n = (vm && vm.night) || {}
  if (n.on) {
    const bits = ['on']
    if (now != null && isNum(n.since)) bits.push('since ' + enDuration(now - n.since))
    if (now != null && isNum(n.nextWakeAt) && n.nextWakeAt > now) bits.push('next wake in ' + enDuration(n.nextWakeAt - now))
    if (isNum(n.pointsSince)) bits.push(fmtPoints(n.pointsSince) + ' weekly points spent')
    lines.push('night: ' + bits.join(', '))
  } else lines.push('night: off')

  const rc = (vm && vm.runCost) || {}
  if (isNum(rc.unitPoints) && rc.unitPoints > 0) {
    lines.push(
      'run cost: ' +
        fmtPoints(rc.unitPoints) +
        ' weekly points per Sonnet-sized agent (' +
        (rc.samples || 0) +
        ' samples)' +
        (rc.last ? ', last ' + fit(rc.last.label, 30) + ' ' + fmtPoints(rc.last.points) + ' points' : ''),
    )
  } else lines.push('run cost: no sample yet')

  const warnings = listOf(vm && vm.flow && vm.flow.warnings)
  if (warnings.length) lines.push('warnings: ' + warnings.slice(0, 2).map(w => fit(w.text || w.key, 70)).join('; '))

  return lines.slice(0, 10).map(l => fit(l, 240)).join('\n')
}

// Suffix for the Spinner while a workflow runs: '  wf name a/b' (empty when none). Spaces only, no dot.
export function workflowSuffix(vm) {
  const wf = runningWorkflow(vm)
  if (!wf) return ''
  const max = planWidth(vm)
  const a = wf.agents && isNum(wf.agents.total) ? wf.agents.total : 0
  return '  wf ' + fit(wf.label, 20) + ' ' + a + (max > 0 ? '/' + max : '')
}
