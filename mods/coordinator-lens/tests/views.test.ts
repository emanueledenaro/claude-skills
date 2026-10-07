// Views and texts of coordinator-lens: pure trees, checked two ways. The look is "clean labels": a dim
// UPPERCASE label column, values beside it, spaces between sections, no head dot and no ' · ' anywhere.
// 1. Direct: a strict fake of the element table (allowed props only, string children, no control
//    characters), so a bad prop or an Svg in a terminal tree throws here.
// 2. Through the engine: `$.ui.mount` draws the same trees with the real surface tables. The test hooks use
//    their own pane id (viewpane) and command (viewcard), so the plugin's real register.js leaves them alone.
// @ts-nocheck
import { test, expect, describe } from 'claude-code/testing'
import { bandView, cardView, paneView, summaryText, budgetLine, paceSvg, textBar, workflowSuffix, TABS } from '../hooks/views.js'
import { t, tn, has, KEYS, fmtDuration, fmtPoints, normalizeLang } from '../hooks/i18n.js'
import { computeBudget, parsePlanLine } from '../hooks/budget.js'

// ---------- fake element table ----------

const MARGIN = ['margin', 'marginX', 'marginY', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight']
const PADDING = ['padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']
const ALLOWED = {
  Box: new Set([
    'key', 'hover', 'position', 'top', 'left', 'right', 'bottom', 'flexDirection', 'flexGrow', 'flexShrink', 'flexWrap',
    'alignItems', 'alignSelf', 'justifyContent', 'gap', 'columnGap', 'rowGap', 'width', 'height', 'minWidth', 'minHeight',
    'borderStyle', 'borderColor', 'borderDimColor', 'backgroundColor', 'overflow', 'display', 'children',
    ...MARGIN, ...PADDING,
  ]),
  Text: new Set(['hover', 'color', 'backgroundColor', 'dimColor', 'bold', 'italic', 'underline', 'strikethrough', 'inverse', 'wrap', 'children']),
  Button: new Set(['key', 'label', 'hotkey', 'action', 'plain', 'dimColor', 'variant', 'role', 'autoFocus', 'onPress', 'children']),
  Link: new Set(['href', 'label', 'children']),
  Svg: new Set(['source', 'alt', 'width', 'height', 'isInteractive']),
}

function strict(type) {
  return props => {
    for (const k of Object.keys(props)) {
      if (!ALLOWED[type].has(k)) throw new Error(type + ': prop not allowed: ' + k)
      if (props[k] === undefined) throw new Error(type + ': undefined prop: ' + k)
    }
    if (type === 'Text') {
      if (typeof props.children !== 'string') throw new Error('Text children must be one string')
      if (/[\u0000-\u001f\u007f-\u009f]/.test(props.children)) throw new Error('control character in Text: ' + JSON.stringify(props.children))
    }
    if (type === 'Button' && props.hotkey !== undefined && !/^[0-9a-z]$/.test(props.hotkey)) throw new Error('bad hotkey ' + props.hotkey)
    if (type === 'Svg') {
      if (!props.source.startsWith('<svg') || props.source.length > 131072) throw new Error('bad svg source')
      if (!props.alt) throw new Error('Svg needs alt')
    }
    return { type, props }
  }
}

function fakeE(surface) {
  const E = { Box: strict('Box'), Text: strict('Text'), Button: strict('Button'), Link: strict('Link') }
  if (surface === 'desktop') E.Svg = strict('Svg')
  return E
}

function kids(n) {
  const c = n && n.props ? n.props.children : undefined
  return c == null ? [] : Array.isArray(c) ? c : [c]
}

function walk(n, f) {
  if (n && typeof n === 'object') {
    f(n)
    for (const c of kids(n)) walk(c, f)
  }
}

function all(n, type) {
  const out = []
  walk(n, x => {
    if (x.type === type) out.push(x)
  })
  return out
}

function linesOf(n) {
  if (typeof n === 'string') return [n]
  if (!n) return []
  if (n.type === 'Box') {
    const ks = kids(n)
    if (n.props.flexDirection === 'column') return ks.flatMap(linesOf)
    return [ks.map(k => linesOf(k).join(' ')).join('')]
  }
  if (n.type === 'Text') return [n.props.children]
  if (n.type === 'Button' || n.type === 'Link') return [n.props.label || '']
  return ['']
}

const textOf = n => linesOf(n).join('\n')
const hasSvg = n => all(n, 'Svg').length > 0
const button = (n, key) => all(n, 'Button').find(b => b.props.key === key)
const textNode = (n, text) => all(n, 'Text').find(x => x.props.children === text)
const nCells = s => Array.from(s).length

// The cells a node takes in a row: Texts and labels by their glyphs, an Svg as the 20 cells the views give it.
function cells(n) {
  if (!n) return 0
  if (typeof n === 'string') return nCells(n)
  if (n.type === 'Text') return nCells(n.props.children)
  if (n.type === 'Link' || n.type === 'Button') return nCells(n.props.label || '')
  if (n.type === 'Svg') return 20
  if (n.type !== 'Box') return 0
  const ks = kids(n)
  return n.props.flexDirection === 'column' ? Math.max(0, ...ks.map(cells)) : ks.reduce((sum, k) => sum + cells(k), 0)
}

// ---------- fixtures ----------

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0)
const MIN = 60000
const HOUR = 3600000
const PLAN = 'Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22'

function budgetFor(o = {}) {
  const weekly = 'weekly' in o ? o.weekly : 17
  const five = 'five' in o ? o.five : 0
  const rateLimits = []
  if (weekly !== null) rateLimits.push({ kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(NOW + (o.weeklyHours || 144) * HOUR).toISOString() })
  if (five !== null) rateLimits.push({ kind: 'five_hour', percentUsed: five, resetsAt: new Date(NOW + (o.fiveIn || 4 * HOUR + 10 * MIN)).toISOString() })
  const input = { rateLimits, now: NOW, plan: parsePlanLine(o.plan === undefined ? PLAN : o.plan), inFlight: o.inFlight || 0 }
  // ageMin: how old the reading is (2 minutes by default); unknownAge: a poll before any response
  const age = (o.ageMin || 2) * MIN
  const readingAt = !rateLimits.length ? undefined : o.unknownAge ? -Infinity : NOW - age
  const b = computeBudget({ ...input, readingAt })
  // as the tracker gives it: the budget keeps budget.md's 10-minute rule (an old green reading is unknown,
  // an old red or yellow one keeps holding), and `shown` holds the last known color worked out without the
  // staleness cut for a reading older than 10 minutes (null for a fresh reading, or one that cannot be shown)
  const last = rateLimits.length && age > 10 * MIN && !o.unknownAge ? computeBudget({ ...input, readingAt: undefined }) : null
  return { ...b, lastReadingAt: rateLimits.length && !o.unknownAge ? NOW - age : null, shown: last && last.color !== 'unknown' ? last : null }
}

function worker(o) {
  return {
    id: o.id, kind: 'agent', label: o.id, model: null, effort: null, status: 'running',
    startedAt: NOW - 10 * MIN, endedAt: null, agents: null, url: null, points: null, lastSeenAt: NOW - MIN, stalled: false,
    ...o,
  }
}

function fullVm(o = {}) {
  return {
    lang: 'en',
    now: NOW,
    budget: budgetFor(),
    workers: [
      worker({ id: 'wf_1', kind: 'workflow', label: 'deep-review', status: 'running', startedAt: NOW - 12 * MIN, agents: { total: 7, sonnet: 5, opus: 2, fable: 0, other: 0 } }),
      worker({ id: 'ag_run', kind: 'agent', label: 'review: auth', model: 'sonnet', effort: 'high', status: 'running', startedAt: NOW - 20 * MIN }),
      worker({ id: 'cloud_1', kind: 'cloud', label: 'fix-ci: flaky timeout', model: 'sonnet', effort: 'high', status: 'launched', startedAt: NOW - 40 * MIN, stalled: true, lastSeenAt: NOW - 30 * MIN, url: 'https://claude.ai/code/session_01ABC' }),
      worker({ id: 'cloud_2', kind: 'cloud', label: 'docs: roadmap', model: 'sonnet', effort: 'medium', status: 'done', startedAt: NOW - 3 * HOUR, endedAt: NOW - 2 * HOUR, points: 1.4 }),
      worker({ id: 'ag_d1', kind: 'agent', label: 'lint sweep', model: 'claude-sonnet-5-5', effort: 'medium', status: 'done', startedAt: NOW - 4 * HOUR, endedAt: NOW - 3 * HOUR - 30 * MIN, points: 0.2 }),
      worker({ id: 'ag_d2', kind: 'agent', label: 'explore api', model: 'sonnet', status: 'done', startedAt: NOW - 5 * HOUR, endedAt: NOW - 4 * HOUR - 40 * MIN }),
      worker({ id: 'ag_f', kind: 'agent', label: 'old-failed', model: 'opus', effort: 'high', status: 'failed', startedAt: NOW - 7 * HOUR, endedAt: NOW - 6 * HOUR - 30 * MIN }),
      worker({ id: 'cloud_d', kind: 'cloud', label: 'old-denied', model: 'fable', status: 'denied', startedAt: NOW - 9 * HOUR, endedAt: NOW - 9 * HOUR }),
    ],
    prs: [
      { number: 42, title: 'feat(auth): add device flow', state: 'open', checks: 'green', mergeable: 'MERGEABLE', url: 'https://github.com/acme/app/pull/42', draft: false },
      { number: 43, title: 'fix(ci): retry flaky timeout', state: 'open', checks: 'red', mergeable: 'MERGEABLE', url: 'https://github.com/acme/app/pull/43', draft: true },
      { number: 41, title: 'docs: roadmap', state: 'merged', checks: 'none', mergeable: null, url: 'https://github.com/acme/app/pull/41', draft: false },
    ],
    merge: {
      pr: 42,
      steps: [
        { key: 'realign', done: true }, { key: 'checks', done: true }, { key: 'headPinned', done: 'probable' },
        { key: 'merged', done: false }, { key: 'ticketsClosed', done: false }, { key: 'roadmap', done: false }, { key: 'unblocked', done: false },
      ],
    },
    round: {
      since: NOW - 3 * HOUR,
      items: [
        { key: 'mainCi', done: true }, { key: 'prsAndIssues', done: true }, { key: 'idleWorkers', done: 'probable' },
        { key: 'duplicates', done: false }, { key: 'diffReviewed', done: false },
      ],
    },
    flow: {
      stages: [
        { key: 'grill', state: 'done' }, { key: 'spec', state: 'done' }, { key: 'tickets', state: 'active' },
        { key: 'build', state: 'todo' }, { key: 'review', state: 'todo' }, { key: 'pr', state: 'todo' },
      ],
      side: [{ key: 'triage', at: NOW - 25 * MIN }],
      current: 'tickets',
      artifacts: [
        { kind: 'prd', label: 'PRD.md', path: '.scratch/device-flow/PRD.md', url: null },
        { kind: 'context', label: 'CONTEXT.md', path: 'CONTEXT.md', url: null },
      ],
      warnings: [{ key: 'milestone', text: 'gh issue create without --milestone' }],
    },
    decisions: [
      { at: NOW - 5 * MIN, kind: 'question', text: 'Merge #42 now or wait for the diff review?', pending: true },
      { at: NOW - 2 * HOUR, kind: 'merge', text: 'Merged #41', pending: false },
    ],
    night: { on: false, since: null, nextWakeAt: null, pointsSince: null },
    runCost: { unitPoints: 0.22, samples: 5, last: { label: 'deep-review', points: 2, agents: 9 } },
    ...o,
  }
}

const quietVm = () => ({
  lang: 'en',
  now: NOW,
  budget: budgetFor({ weekly: null, five: null }),
  workers: [], prs: [],
  merge: { pr: null, steps: [] }, round: { since: null, items: [] },
  flow: { stages: [], side: [], current: null, artifacts: [], warnings: [] },
  decisions: [], night: { on: false, since: null, nextWakeAt: null, pointsSince: null },
  runCost: { unitPoints: null, samples: 0, last: null },
})

const nightOn = () => ({ on: true, since: NOW - 3 * HOUR, nextWakeAt: NOW + 12 * MIN, pointsSince: 4.2 })

// The pace of the fixture reading (weekly 17%), as the views round it.
const PACE = Math.round(budgetFor().pace)

// ---------- i18n ----------

describe('i18n', () => {
  test('every English text has an Italian one and the other way round', () => {
    for (const key of KEYS) expect(has('it', key), 'missing it: ' + key).toBe(true)
    expect(KEYS.length).toBeGreaterThan(100)
  })
  test('placeholders fill, unknown languages fall back to Italian, unknown keys show the key', () => {
    expect(t('en', 'band.week', { used: 17, pace: 20 })).toBe('17% (pace 20%)')
    expect(t('it', 'band.week', { used: 17, pace: 20 })).toBe('17% (ritmo 20%)')
    expect(t('en', 'band.fivePaused', { used: 92, wait: '4h 10m' })).toBe('92% (wait 4h 10m)')
    expect(t('it', 'band.fivePaused', { used: 92, wait: '4h 10m' })).toBe('92% (pausa 4h 10m)')
    expect(normalizeLang(undefined)).toBe('it')
    expect(normalizeLang('fr')).toBe('it')
    expect(normalizeLang('en')).toBe('en')
    expect(t('xx', 'color.green')).toBe('verde')
    expect(t('en', 'no.such.key')).toBe('no.such.key')
    for (const key of KEYS) {
      expect(t('en', key)).not.toMatch(/\{\w+\}\{/)
    }
  })
  test('band: each section is a label key and a value key, the old plural keys are gone', () => {
    const labels = {
      en: { 'band.budget': 'Budget', 'band.weekLabel': 'Week', 'band.fiveLabel': '5h', 'band.workingLabel': 'Working', 'band.stalledLabel': 'Stalled', 'band.decideLabel': 'To decide', 'band.night': 'Night' },
      it: { 'band.budget': 'Budget', 'band.weekLabel': 'Settimana', 'band.fiveLabel': '5 ore', 'band.workingLabel': 'Al lavoro', 'band.stalledLabel': 'Fermi', 'band.decideLabel': 'Da decidere', 'band.night': 'Notte' },
    }
    for (const lang of ['en', 'it']) {
      for (const [key, text] of Object.entries(labels[lang])) expect(t(lang, key), lang + ' ' + key).toBe(text)
      expect(t(lang, 'band.five', { used: 18 })).toBe('18%')
      expect(t(lang, 'band.weekOnly', { used: 17 })).toBe('17%')
      expect(t(lang, 'band.wf', { name: 'deep-review', a: 7, b: 16 })).toBe('wf deep-review 7/16')
      expect(t(lang, 'band.wfOpen', { name: 'deep-review', a: 7 })).toBe('wf deep-review 7')
      for (const gone of ['band.working', 'band.stalled', 'band.decide'])
        for (const suffix of ['', '.one', '.other']) expect(has(lang, gone + suffix), lang + ' ' + gone + suffix).toBe(false)
      // the band has no dot and no middle-dot separator in any of its texts
      for (const key of KEYS.filter(k => k.startsWith('band.'))) expect(t(lang, key), lang + ' ' + key).not.toMatch(/[●·]/)
    }
    expect(t('en', 'color.unknown')).toBe('waiting')
    expect(t('it', 'color.unknown')).toBe('in attesa')
  })
  test('person-facing texts: no middle-dot separator, no dot mark, section labels fit the label column', () => {
    for (const lang of ['en', 'it']) {
      for (const key of KEYS) {
        expect(t(lang, key), lang + ' ' + key).not.toContain('·')
        expect(t(lang, key), lang + ' ' + key).not.toContain('●')
      }
      // labels are drawn UPPERCASE in a 12-cell column and keep at least one space after them
      for (const key of ['row.budget', 'row.workers', 'row.merge', 'row.round', 'row.flow', 'row.decisions', 'sec.merge', 'sec.round', 'sec.prs', 'sec.flow', 'sec.side', 'sec.artifacts', 'sec.warnings', 'sec.night', 'sec.cost', 'sec.budget']) {
        expect(Array.from(t(lang, key)).length, lang + ' ' + key).toBeLessThanOrEqual(11)
      }
      // the keys the new layout reads
      for (const key of ['count.of', 'word.next', 'more', 'budget.profileShort', 'lbl.profile', 'budget.noLaunch', 'budget.planUnknown', 'budget.planAssumed', 'pr.withDraft'])
        expect(has(lang, key), lang + ' ' + key).toBe(true)
      for (const gone of ['merge.line', 'merge.lineDone', 'round.line', 'round.lineDone', 'workers.more', 'decision.question', 'tab.overview.short', 'w.week', 'pr.draft'])
        expect(has(lang, gone), lang + ' ' + gone).toBe(false)
    }
    expect(t('it', 'count.of', { done: 3, total: 7 })).toBe('3 di 7')
    expect(t('en', 'count.of', { done: 3, total: 7 })).toBe('3 of 7')
    expect(t('it', 'word.next', { next: 'check verdi' })).toBe('prossimo: check verdi')
    expect(t('en', 'word.next', { next: 'checks green' })).toBe('next: checks green')
    expect(tn('it', 'decisions.waiting', 1)).toBe('1 in attesa')
    expect(tn('en', 'decisions.waiting', 2)).toBe('2 waiting')
    expect(t('it', 'budget.resetIn', { in: '2h 10m' })).toBe('reset tra 2h 10m')
    expect(t('it', 'pr.withDraft', { state: 'aperta' })).toBe('bozza aperta')
    expect(t('en', 'pr.withDraft', { state: 'open' })).toBe('open draft')
    expect(t('it', 'lbl.profile')).toBe('Profilo')
    expect(t('it', 'budget.planUnknown')).toBe('non letto')
    expect(t('en', 'budget.planUnknown')).toBe('not read')
    expect(t('it', 'budget.noLaunch')).toBe('nessun nuovo avvio')
    expect(t('en', 'budget.noLaunch')).toBe('no new launches')
    expect(t('it', 'footer.snapshot')).toBe('istantanea   pannello live con /coord pane')
    expect(t('en', 'footer.snapshot')).toBe('snapshot   /coord pane for the live panel')
    expect(t('it', 'budget.profile', { name: 'Max 20x', width: 16, cloud: 3 })).toBe('Max 20x   16 agenti per run   3 cloud')
    expect(t('en', 'budget.profile', { name: 'Max 20x', width: 16, cloud: 3 })).toBe('Max 20x   16 agents per run   3 cloud')
    // the toast and the log line say it with words and spaces only
    expect(t('it', 'toast.merge', { pr: '#3' })).toBe('Merge fatto: #3')
    expect(t('it', 'log.color', { from: 'verde', to: 'rosso' })).toBe('coordinator-lens: budget verde -> rosso')
  })
  test('an old reading: the age text in both languages, relative times, no dot', () => {
    expect(t('en', 'band.stale', { ago: '12m' })).toBe('(read 12m ago)')
    expect(t('it', 'band.stale', { ago: '12m' })).toBe('(lettura di 12m fa)')
    expect(t('en', 'band.staleShort', { ago: '1h 5m' })).toBe('(1h 5m ago)')
    expect(t('it', 'band.staleShort', { ago: '2g 3h' })).toBe('(2g 3h fa)')
    for (const lang of ['en', 'it']) {
      for (const key of ['band.stale', 'band.staleShort']) {
        expect(has(lang, key), lang + ' ' + key).toBe(true)
        expect(t(lang, key, { ago: '12m' }), lang + ' ' + key).not.toMatch(/[●·{}]/)
      }
    }
    // the word for no reading stays what it was
    expect(t('en', 'color.unknown')).toBe('waiting')
    expect(t('it', 'color.unknown')).toBe('in attesa')
  })
  test('plural helper and formats', () => {
    expect(tn('en', 'workers.summary.running', 1)).toBe('1 running')
    expect(tn('it', 'workers.summary.running', 1)).toBe('1 attivo')
    expect(tn('it', 'workers.summary.running', 3)).toBe('3 attivi')
    expect(tn('it', 'workers.summary.failed', 3)).toBe('3 falliti')
    expect(fmtDuration('en', 20 * 1000)).toBe('<1m')
    expect(fmtDuration('en', 12 * MIN)).toBe('12m')
    expect(fmtDuration('en', 65 * MIN)).toBe('1h 5m')
    expect(fmtDuration('en', 2 * HOUR)).toBe('2h')
    expect(fmtDuration('en', 51 * HOUR)).toBe('2d 3h')
    expect(fmtDuration('it', 51 * HOUR)).toBe('2g 3h')
    expect(fmtDuration('en', null)).toBe('')
    expect(fmtPoints(2)).toBe('2')
    expect(fmtPoints(0.84)).toBe('0.84')
    expect(fmtPoints(12.34)).toBe('12.3')
    expect(fmtPoints(0)).toBe('0')
  })
})

// ---------- band ----------

describe('band', () => {
  const SEP = '    '
  const WEEK = 'Week 17% (pace ' + PACE + '%)'
  const FULL_EN = 'Budget green' + SEP + WEEK + SEP + '5h 0%' + SEP + 'Working 3 (wf deep-review 7/16)' + SEP + 'Stalled 1' + SEP + 'To decide 1'
  const FULL_IT = 'Budget verde' + SEP + 'Settimana 17% (ritmo ' + PACE + '%)' + SEP + '5 ore 0%' + SEP + 'Al lavoro 3 (wf deep-review 7/16)' + SEP + 'Fermi 1' + SEP + 'Da decidere 1'

  // The sections of a band tree, in order: a dim label ('Week '), then its value Text. The separators
  // (four dim spaces) are skipped. A section with no value ('Night') is one dim Text with no trailing space.
  const sections = tree => {
    const texts = all(tree, 'Text').map(x => x.props).filter(p => p.children !== SEP)
    const out = []
    for (let i = 0; i < texts.length; i++) {
      const label = texts[i]
      expect(label.dimColor, 'a band label is dim: ' + label.children).toBe(true)
      if (label.children.endsWith(' ')) {
        out.push({ label: label.children.trim(), value: texts[i + 1].children, valueProps: texts[i + 1] })
        i += 1
      } else out.push({ label: label.children, value: null, valueProps: null })
    }
    return out
  }

  test('one line, calm, no buttons, no Svg', () => {
    for (const surface of ['terminal', 'desktop']) {
      const tree = bandView(fullVm(), fakeE(surface), { cols: 160, surface })
      expect(tree.type).toBe('Box')
      expect(tree.props.flexDirection).toBe('row')
      const lines = linesOf(tree)
      expect(lines).toEqual([FULL_EN])
      expect(lines[0]).not.toContain('●')
      expect(lines[0]).not.toContain(' · ')
      expect(all(tree, 'Button')).toHaveLength(0)
      expect(hasSvg(tree)).toBe(false)
    }
  })
  test('each section is a dim label followed by its value, sections four spaces apart', () => {
    const tree = bandView(fullVm(), fakeE('terminal'), { cols: 160, surface: 'terminal' })
    expect(sections(tree).map(s => [s.label, s.value])).toEqual([
      ['Budget', 'green'], ['Week', '17% (pace ' + PACE + '%)'], ['5h', '0%'],
      ['Working', '3 (wf deep-review 7/16)'], ['Stalled', '1'], ['To decide', '1'],
    ])
    for (const s of sections(tree)) expect(s.valueProps.dimColor, 'a band value is not dim: ' + s.value).toBeFalsy()
    const seps = all(tree, 'Text').filter(x => x.props.children === SEP)
    expect(seps).toHaveLength(5)
    for (const s of seps) expect(s.props.dimColor).toBe(true)
    expect(linesOf(tree)[0].split(SEP)).toHaveLength(6)
  })
  test('two lines when the width is short: the budget, then the work; the workflow part shortens before anything goes', () => {
    const tree = bandView(fullVm({ night: nightOn() }), fakeE('terminal'), { cols: 50, surface: 'terminal' })
    expect(tree.props.flexDirection).toBe('column')
    // 48 cells of room: the budget row fits as it is, the work row loses the workflow part (the name was
    // fitted first, and no name of 6 cells or more fits next to the other three sections)
    expect(linesOf(tree)).toEqual([
      'Budget green' + SEP + WEEK + SEP + '5h 0%',
      'Working 3' + SEP + 'Stalled 1' + SEP + 'To decide 1' + SEP + 'Night',
    ])
    expect(all(tree, 'Button')).toHaveLength(0)
    expect(hasSvg(tree)).toBe(false)
    // the same band with room for it is one line, Night last
    const wide = linesOf(bandView(fullVm({ night: nightOn() }), fakeE('terminal'), { cols: 200, surface: 'terminal' }))
    expect(wide).toEqual([FULL_EN + SEP + 'Night'])
    const narrowest = bandView(fullVm({ night: nightOn() }), fakeE('terminal'), { cols: 20 })
    expect(linesOf(narrowest).length).toBeLessThanOrEqual(2)
  })
  test('shortening goes in order and takes only what the row needs: pace, then the 5-hour wait (warning stays), then the workflow name, then the workflow part, then Night', () => {
    const paused = fullVm({ budget: budgetFor({ five: 99 }), night: nightOn() })
    const at = (vm, cols) => linesOf(bandView(vm, fakeE('terminal'), { cols, surface: 'terminal' }))
    // 60 cols (room 58): the pace goes, the wait stays
    expect(at(paused, 60)).toEqual([
      'Budget green' + SEP + 'Week 17%' + SEP + '5h 99% (wait 4h 10m)',
      'Working 3' + SEP + 'Stalled 1' + SEP + 'To decide 1' + SEP + 'Night',
    ])
    // 44 cols (room 42): the wait goes too, the 5-hour value keeps the warning color, and Night is the one dropped
    const narrow = bandView(paused, fakeE('terminal'), { cols: 44, surface: 'terminal' })
    expect(linesOf(narrow)).toEqual([
      'Budget green' + SEP + 'Week 17%' + SEP + '5h 99%',
      'Working 3' + SEP + 'Stalled 1' + SEP + 'To decide 1',
    ])
    const five = all(narrow, 'Text').find(x => x.props.children === '99%')
    expect(five.props.color).toBe('warning')
    // the workflow name is fitted to the room before the whole part goes (here the budget row is short)
    const long = 'deep-review-of-the-very-long-workflow-name-indeed'
    const wf = extra => fullVm({ workers: [worker({ id: 'wf_1', kind: 'workflow', label: long, status: 'running', agents: { total: 7, sonnet: 7, opus: 0, fable: 0, other: 0 } })], decisions: [], ...extra })
    const workLine = (vm, cols) => at(vm, cols).find(l => l.includes('Working'))
    expect(workLine(wf(), 120)).toContain('Working 1 (wf deep-review-of-the-very… 7/16)')
    expect(workLine(wf(), 50)).toBe('Working 1 (wf deep-review-of-the-very… 7/16)')
    expect(workLine(wf(), 44)).toBe('Working 1 (wf deep-review-of-the-ve… 7/16)')
    expect(workLine(wf({ night: nightOn() }), 44)).toBe('Working 1 (wf deep-review-… 7/16)' + SEP + 'Night')
  })
  test('the band fits bodyColumns at 44, 60, 90 and 120 columns, in Italian and English: two lines at most, each within cols - 2', () => {
    const longName = 'deep-review-of-the-very-long-workflow-name-indeed'
    const states = {
      full: fullVm({ night: nightOn() }),
      paused: fullVm({ budget: budgetFor({ five: 99 }), night: nightOn() }),
      yellow: fullVm({ budget: budgetFor({ weekly: 45, five: 93 }), night: nightOn() }),
      red: fullVm({ budget: budgetFor({ weekly: 60 }), night: nightOn() }),
      longName: fullVm({
        night: nightOn(),
        workers: [worker({ id: 'wf_1', kind: 'workflow', label: longName, status: 'running', agents: { total: 7, sonnet: 7, opus: 0, fable: 0, other: 0 } }), worker({ id: 'ag', label: 'x', stalled: true })],
      }),
      expired: fullVm({ budget: budgetFor({ weekly: 17, weeklyHours: -1 }), night: nightOn() }),
      old: fullVm({ budget: budgetFor({ ageMin: 12 }), night: nightOn() }),
      oldYellowPaused: fullVm({ budget: budgetFor({ weekly: 45, five: 93, ageMin: 65 }), night: nightOn() }),
      oldRedDays: fullVm({ budget: budgetFor({ weekly: 60, ageMin: 51 * 60 }), night: nightOn() }),
      waitingNoAge: fullVm({ budget: budgetFor({ unknownAge: true }), night: nightOn() }),
      waiting: { ...quietVm(), workers: [worker({ id: 'a', label: 'solo' })], decisions: [{ at: NOW, kind: 'question', text: 'x', pending: true }], night: nightOn() },
    }
    for (const [name, vm] of Object.entries(states)) {
      for (const lang of ['en', 'it']) {
        for (const cols of [44, 60, 90, 120]) {
          const tree = bandView({ ...vm, lang }, fakeE('terminal'), { cols, surface: 'terminal' })
          const lines = linesOf(tree)
          const where = name + ' ' + lang + ' ' + cols
          expect(lines.length, where).toBeLessThanOrEqual(2)
          for (const line of lines) expect(Array.from(line).length, where + ': ' + line).toBeLessThanOrEqual(cols - 2)
          // the budget is always there, and so are the sections that ask for the person: stalled and to decide
          expect(lines[0], where).toMatch(/^Budget /)
          if (vm.workers.some(w => w.stalled)) expect(lines.join(' '), where).toContain(lang === 'it' ? 'Fermi 1' : 'Stalled 1')
          if (vm.decisions.some(d => d.pending)) expect(lines.join(' '), where).toContain(lang === 'it' ? 'Da decidere 1' : 'To decide 1')
          // nothing wraps: every Text is cut with an ellipsis if it must be cut
          for (const x of all(tree, 'Text')) expect(x.props.wrap, where + ': ' + x.props.children).toBe('truncate-end')
        }
      }
    }
  })
  test('the labels and the separators never shrink: each sits in a Box with flexShrink 0', () => {
    for (const cols of [44, 90]) {
      const tree = bandView(fullVm({ night: nightOn() }), fakeE('terminal'), { cols, surface: 'terminal' })
      const dimTexts = all(tree, 'Text').filter(x => x.props.dimColor)
      expect(dimTexts.length).toBeGreaterThan(4)
      // in a row of the band no dim Text stands alone: it is wrapped in a Box that does not shrink
      walk(tree, n => {
        if (n.type !== 'Box' || n.props.flexDirection !== 'row') return
        for (const c of kids(n)) {
          if (c.type === 'Text') expect(c.props.dimColor, 'a dim label or separator must be fixed: ' + c.props.children).toBeFalsy()
          else {
            expect(c.props.flexShrink).toBe(0)
            expect(kids(c)).toHaveLength(1)
            expect(kids(c)[0].props.dimColor).toBe(true)
          }
        }
      })
      // the values are the Texts the row is free to cut
      for (const x of all(tree, 'Text').filter(x => !x.props.dimColor)) expect(x.props.wrap).toBe('truncate-end')
    }
  })
  test('nothing at all takes no rows', () => {
    expect(bandView(quietVm(), fakeE('terminal'), { cols: 100 })).toBeNull()
    expect(bandView(null, fakeE('terminal'), { cols: 100 })).toBeNull()
  })
  test('a reading alone, a worker alone, a decision alone, night alone each show', () => {
    const base = quietVm()
    expect(textOf(bandView({ ...base, budget: budgetFor() }, fakeE('terminal'), { cols: 100 }))).toBe('Budget green' + SEP + WEEK + SEP + '5h 0%')
    const w = bandView({ ...base, workers: [worker({ id: 'a', label: 'solo' })] }, fakeE('terminal'), { cols: 100 })
    expect(textOf(w)).toBe('Budget waiting' + SEP + 'Working 1')
    expect(textOf(bandView({ ...base, decisions: [{ at: NOW, kind: 'question', text: 'x', pending: true }] }, fakeE('terminal'), { cols: 100 }))).toBe('Budget waiting' + SEP + 'To decide 1')
    expect(textOf(bandView({ ...base, night: nightOn() }, fakeE('terminal'), { cols: 100 }))).toBe('Budget waiting' + SEP + 'Night')
    // no reading: the word is "waiting" in English and "in attesa" in Italian, never "no data"
    expect(textOf(bandView({ ...base, lang: 'it', night: nightOn() }, fakeE('terminal'), { cols: 100 }))).toBe('Budget in attesa' + SEP + 'Notte')
  })
  test('the other sections take their own color and weight', () => {
    const by = (vm, label) => sections(bandView(vm, fakeE('terminal'), { cols: 200 })).find(s => s.label === label)
    expect(by(fullVm(), 'Stalled').valueProps.color).toBe('warning')
    expect(by(fullVm(), 'To decide').valueProps.color).toBe('suggestion')
    expect(by(fullVm(), 'To decide').valueProps.bold).toBe(true)
    expect(by(fullVm(), 'Working').valueProps.color).toBeUndefined()
    expect(by(fullVm(), 'Week').valueProps.color).toBeUndefined()
    expect(by(fullVm(), '5h').valueProps.color).toBeUndefined()
    expect(by(fullVm({ night: nightOn() }), 'Night').value).toBeNull()
  })
  test('pace colors map to theme keys, carried by the value after the dim Budget label', () => {
    const head = vm => {
      const texts = all(bandView(vm, fakeE('terminal'), { cols: 100 }), 'Text')
      return { label: texts[0].props, value: texts[1].props }
    }
    const green = head(fullVm())
    expect(green.label.children).toBe('Budget ')
    expect(green.label.dimColor).toBe(true)
    expect(green.label.color).toBeUndefined()
    expect(green.value.children).toBe('green')
    expect(green.value.color).toBe('success')
    expect(green.value.bold).toBe(true)
    expect(head(fullVm({ budget: budgetFor({ weekly: 45 }) })).value).toMatchObject({ children: 'yellow', color: 'warning' })
    expect(head(fullVm({ budget: budgetFor({ weekly: 60 }) })).value).toMatchObject({ children: 'red', color: 'error' })
    expect(head(fullVm({ budget: budgetFor({ weekly: null, five: 5 }) })).value).toMatchObject({ children: 'waiting', color: 'inactive' })
    for (const weekly of [17, 45, 60]) expect(head(fullVm({ budget: budgetFor({ weekly }) })).label.color).toBeUndefined()
  })
  test('5-hour pause shows the wait, in warning color', () => {
    const tree = bandView(fullVm({ budget: budgetFor({ five: 92 }) }), fakeE('terminal'), { cols: 200 })
    expect(textOf(tree)).toContain('5h 92% (wait 4h 10m)')
    expect(textOf(tree)).toBe('Budget green' + SEP + WEEK + SEP + '5h 92% (wait 4h 10m)' + SEP + 'Working 3 (wf deep-review 7/16)' + SEP + 'Stalled 1' + SEP + 'To decide 1')
    const five = sections(tree).find(s => s.label === '5h')
    expect(five.value).toBe('92% (wait 4h 10m)')
    expect(five.valueProps.color).toBe('warning')
    const it = sections(bandView({ ...fullVm({ budget: budgetFor({ five: 92 }) }), lang: 'it' }, fakeE('terminal'), { cols: 200 })).find(s => s.label === '5 ore')
    expect(it.value).toBe('92% (pausa 4h 10m)')
    expect(it.valueProps.color).toBe('warning')
    // below the pause the 5-hour value is plain: no wait, no color
    const calm = sections(bandView(fullVm({ budget: budgetFor({ five: 18 }) }), fakeE('terminal'), { cols: 200 })).find(s => s.label === '5h')
    expect(calm.value).toBe('18%')
    expect(calm.valueProps.color).toBeUndefined()
  })
  test('language: Italian by default, English with en', () => {
    const it = textOf(bandView({ ...fullVm(), lang: undefined }, fakeE('terminal'), { cols: 200 }))
    expect(it).toBe(FULL_IT)
    expect(it).not.toContain('Budget green')
    expect(textOf(bandView({ ...fullVm(), lang: 'fr' }, fakeE('terminal'), { cols: 200 }))).toBe(FULL_IT)
    const en = textOf(bandView(fullVm(), fakeE('terminal'), { cols: 200 }))
    expect(en).toBe(FULL_EN)
    expect(en).not.toContain('verde')
    // the Italian example with a workflow, a decision and night, the way the person reads it
    const vm = fullVm({
      lang: 'it',
      budget: budgetFor({ five: 18 }),
      workers: [worker({ id: 'wf_1', kind: 'workflow', label: 'review-open-prs', startedAt: NOW - 12 * MIN, agents: { total: 5, sonnet: 5, opus: 0, fable: 0, other: 0 } })],
      night: nightOn(),
    })
    expect(textOf(bandView(vm, fakeE('terminal'), { cols: 200 }))).toBe(
      'Budget verde' + SEP + 'Settimana 17% (ritmo ' + PACE + '%)' + SEP + '5 ore 18%' + SEP + 'Al lavoro 1 (wf review-open-prs 5/16)' + SEP + 'Da decidere 1' + SEP + 'Notte',
    )
  })
  test('no dot and no middle-dot separator in any band, any language, any width', () => {
    const states = [
      fullVm(), fullVm({ night: nightOn() }), fullVm({ budget: budgetFor({ five: 92 }) }), fullVm({ budget: budgetFor({ weekly: 60 }) }),
      { ...quietVm(), night: nightOn() }, { ...quietVm(), workers: [worker({ id: 'a', label: 'solo' })] },
    ]
    for (const vm of states) {
      for (const lang of ['en', 'it']) {
        for (const cols of [20, 50, 100, 200]) {
          const text = textOf(bandView({ ...vm, lang }, fakeE('terminal'), { cols }))
          expect(text, lang + ' ' + cols).not.toMatch(/[●·]/)
          expect(text, lang + ' ' + cols).not.toContain('no data')
          expect(text, lang + ' ' + cols).not.toContain('senza dati')
        }
      }
    }
  })
  test('workflow suffix for the spinner: spaces only, no middle dot', () => {
    expect(workflowSuffix(fullVm())).toBe('  wf deep-review 7/16')
    expect(workflowSuffix(quietVm())).toBe('')
  })
})

// ---------- an old reading ----------

// budget.md's 10-minute rule is for launch decisions, not for what the person sees: past 10 minutes the
// last known color stays on screen, the state word dim with the age of the reading after it. 'waiting' is
// only for no reading at all (or one of unknown age, a poll before any response). The texts for the model
// keep the rule.
describe('an old reading', () => {
  const SEP = '    '
  const WEEK_EN = 'Week 17% (pace ' + PACE + '%)'
  const WEEK_IT = 'Settimana 17% (ritmo ' + PACE + '%)'
  const old = (ageMin = 12, o = {}, extra = {}) => fullVm({ budget: budgetFor({ ageMin, ...o }), ...extra })
  const bandOf = (vm, cols = 200, surface = 'terminal') => bandView(vm, fakeE(surface), { cols, surface })
  const bandText = (vm, cols) => textOf(bandOf(vm, cols))
  const cardLines = (vm, cols = 100, surface = 'terminal') => linesOf(cardView(vm, fakeE(surface), { cols, surface }))
  const paneLines = (vm, tab, cols = 100) => linesOf(paneView(vm, fakeE('terminal'), { cols, surface: 'terminal', tab })).slice(2)

  test('the fixture is the tracker shape: the budget keeps the rule, `shown` keeps the last known color', () => {
    const b = old().budget
    expect(b).toMatchObject({ color: 'unknown', reason: 'stale-reading', pace: null, lastReadingAt: NOW - 12 * MIN })
    expect(b.shown).toMatchObject({ color: 'green', reason: 'pace' })
    expect(Number.isFinite(b.shown.pace)).toBe(true)
    expect(budgetFor().shown).toBe(null)
    expect(budgetFor({ unknownAge: true })).toMatchObject({ color: 'unknown', lastReadingAt: null, shown: null })
    expect(budgetFor({ weekly: null, five: null })).toMatchObject({ color: 'unknown', shown: null })
  })

  test('band: Budget verde (lettura di 12m fa) / Budget green (read 12m ago), the rest of the band as it was', () => {
    const vm = old()
    expect(bandText(vm)).toBe('Budget green (read 12m ago)' + SEP + WEEK_EN + SEP + '5h 0%' + SEP + 'Working 3 (wf deep-review 7/16)' + SEP + 'Stalled 1' + SEP + 'To decide 1')
    expect(bandText({ ...vm, lang: 'it' })).toBe(
      'Budget verde (lettura di 12m fa)' + SEP + WEEK_IT + SEP + '5 ore 0%' + SEP + 'Al lavoro 3 (wf deep-review 7/16)' + SEP + 'Fermi 1' + SEP + 'Da decidere 1',
    )
    for (const surface of ['terminal', 'desktop']) {
      const tree = bandOf(vm, 200, surface)
      expect(tree.props.flexDirection).toBe('row')
      expect(all(tree, 'Button')).toHaveLength(0)
      expect(hasSvg(tree)).toBe(false)
      expect(textOf(tree)).not.toMatch(/waiting|[●·]/)
    }
  })
  test('band: the word keeps its pace color but dim, not bold; the age is dim after it, with no color of its own', () => {
    for (const [weekly, word, color] of [[17, 'green', 'success'], [45, 'yellow', 'warning'], [60, 'red', 'error']]) {
      const texts = all(bandOf(old(12, { weekly })), 'Text').map(x => x.props)
      expect(texts[0]).toMatchObject({ children: 'Budget ', dimColor: true })
      expect(texts[1], word).toMatchObject({ children: word, color, dimColor: true })
      expect(texts[1].bold, word).toBeUndefined()
      expect(texts[2], word).toMatchObject({ children: ' (read 12m ago)', dimColor: true })
      expect(texts[2].color, word).toBeUndefined()
      expect(texts[2].bold, word).toBeUndefined()
    }
    // a fresh reading is as it was: the word bold in its color, not dim, nothing after it
    const fresh = all(bandOf(fullVm()), 'Text').map(x => x.props)
    expect(fresh[1]).toMatchObject({ children: 'green', color: 'success', bold: true })
    expect(fresh[1].dimColor).toBeUndefined()
    expect(fresh[2].children).toBe('    ')
  })
  test('band: 10 minutes is still a fresh reading, 11 is an old one', () => {
    expect(bandText(old(10), 200)).toMatch(/^Budget green {4}Week /)
    expect(bandText(old(11), 200)).toMatch(/^Budget green \(read 11m ago\) {4}Week /)
  })
  test('the age is a relative time: 12m, 1h 5m, 2d 3h (2g 3h in Italian)', () => {
    expect(bandText(old(65), 200)).toMatch(/^Budget green \(read 1h 5m ago\)/)
    expect(bandText(old(51 * 60), 200)).toMatch(/^Budget green \(read 2d 3h ago\)/)
    expect(bandText({ ...old(65), lang: 'it' }, 200)).toMatch(/^Budget verde \(lettura di 1h 5m fa\)/)
    expect(bandText({ ...old(51 * 60), lang: 'it' }, 200)).toMatch(/^Budget verde \(lettura di 2g 3h fa\)/)
  })
  test('"waiting" / "in attesa" stays for no reading at all, and for windows of unknown age', () => {
    expect(bandText({ ...quietVm(), night: nightOn() }, 100)).toBe('Budget waiting' + SEP + 'Night')
    expect(bandText({ ...quietVm(), lang: 'it', night: nightOn() }, 100)).toBe('Budget in attesa' + SEP + 'Notte')
    // a poll before any response: the numbers are there, their age is not
    const poll = fullVm({ budget: budgetFor({ unknownAge: true }), workers: [], decisions: [] })
    expect(bandText(poll, 100)).toBe('Budget waiting' + SEP + 'Week 17%' + SEP + '5h 0%')
    expect(bandText({ ...poll, lang: 'it' }, 100)).toBe('Budget in attesa' + SEP + 'Settimana 17%' + SEP + '5 ore 0%')
    // the weekly window ended while the reading sat there: its numbers are not this week's any more
    const over = fullVm({ budget: budgetFor({ weekly: 17, weeklyHours: -1, ageMin: 12 }), workers: [], decisions: [] })
    expect(bandText(over, 100)).toMatch(/^Budget waiting {4}Week 17%/)
  })
  test('narrow bands shorten the age first, then the pace, then drop the 5 hours: the age is the last to go', () => {
    const vm = old(12, {}, { workers: [], decisions: [] })
    // 120 columns: everything whole
    expect(linesOf(bandOf(vm, 120))).toEqual(['Budget green (read 12m ago)' + SEP + WEEK_EN + SEP + '5h 0%'])
    // 60 columns (room 58): the whole row is 59 cells, so the age takes its short form and the pace stays
    expect(linesOf(bandOf(vm, 60))).toEqual(['Budget green (12m ago)' + SEP + WEEK_EN + SEP + '5h 0%'])
    // 44 columns (room 42): the pace goes too, and the 5 hours; the age stays
    expect(linesOf(bandOf(vm, 44))).toEqual(['Budget green (12m ago)' + SEP + 'Week 17%'])
    expect(linesOf(bandOf({ ...vm, lang: 'it' }, 44))).toEqual(['Budget verde (12m fa)' + SEP + 'Settimana 17%'])
  })
  test('the band fits 44, 60, 90 and 120 columns with an old reading, in both languages: two lines at most, the age always there', () => {
    const states = {
      old: old(12, {}, { night: nightOn() }),
      yellowPaused: old(65, { weekly: 45, five: 93 }, { night: nightOn() }),
      redDays: old(51 * 60, { weekly: 60 }, { night: nightOn() }),
      longName: old(12, {}, { night: nightOn(), workers: [worker({ id: 'wf_1', kind: 'workflow', label: 'deep-review-of-the-very-long-workflow-name-indeed', status: 'running', agents: { total: 7, sonnet: 7, opus: 0, fable: 0, other: 0 } }), worker({ id: 'ag', label: 'x', stalled: true })] }),
    }
    for (const [name, vm] of Object.entries(states)) {
      for (const lang of ['en', 'it']) {
        for (const cols of [44, 60, 90, 120]) {
          const tree = bandOf({ ...vm, lang }, cols)
          const lines = linesOf(tree)
          const where = name + ' ' + lang + ' ' + cols
          expect(lines.length, where).toBeLessThanOrEqual(2)
          for (const line of lines) expect(Array.from(line).length, where + ': ' + line).toBeLessThanOrEqual(cols - 2)
          expect(lines[0], where).toMatch(lang === 'it' ? /^Budget \S+ \((lettura di )?[\dgh m]+ fa\)/ : /^Budget \S+ \((read )?[\ddh m]+ ago\)/)
          expect(lines[0], where).not.toMatch(/waiting|in attesa/)
          for (const x of all(tree, 'Text')) expect(x.props.wrap, where + ': ' + x.props.children).toBe('truncate-end')
        }
      }
    }
  })

  test('card title and BUDGET block: the same word and age, in both languages', () => {
    const vm = old()
    const en = cardLines(vm)
    expect(en[0]).toMatch(/^Coordinator\s*Budget green \(read 12m ago\)$/)
    expect(en).toContain('BUDGET      green (read 12m ago)')
    const it = cardLines({ ...vm, lang: 'it' })
    expect(it[0]).toMatch(/^Coordinatore\s*Budget verde \(lettura di 12m fa\)$/)
    expect(it).toContain('BUDGET      verde (lettura di 12m fa)')
    // the rows under it are the last known reading: the bar, the pace
    expect(en.join('\n')).toMatch(/Week\s+[━─╋]{8,}\s+17%\s+pace \d+%/)
    expect(en.join('\n')).not.toMatch(/Budget waiting|BUDGET {6}waiting|no reading/)
    // the title: name, dim label, the word dim in its color, the dim age; the block word is the same
    const tree = cardView(vm, fakeE('terminal'), { cols: 100, surface: 'terminal' })
    const title = all(tree, 'Text').slice(0, 4).map(x => x.props)
    expect(title[0]).toMatchObject({ children: 'Coordinator', bold: true, color: 'claude' })
    expect(title[1]).toMatchObject({ children: 'Budget ', dimColor: true })
    expect(title[2]).toMatchObject({ children: 'green', color: 'success', dimColor: true })
    expect(title[2].bold).toBeUndefined()
    expect(title[3]).toMatchObject({ children: ' (read 12m ago)', dimColor: true })
    const words = all(tree, 'Text').filter(x => x.props.children === 'green').map(x => x.props)
    expect(words).toHaveLength(2)
    for (const w of words) expect(w).toMatchObject({ color: 'success', dimColor: true })
    const ages = all(tree, 'Text').filter(x => x.props.children === ' (read 12m ago)').map(x => x.props)
    expect(ages).toHaveLength(2)
    for (const a of ages) expect(a.dimColor).toBe(true)
  })
  test('card: no Button, an Svg only on Desktop (the same one), the title the same on both', () => {
    const vm = old()
    for (const surface of ['terminal', 'desktop']) {
      const tree = cardView(vm, fakeE(surface), { cols: 100, surface })
      expect(all(tree, 'Button')).toHaveLength(0)
      expect(all(tree, 'Svg')).toHaveLength(surface === 'desktop' ? 1 : 0)
      expect(linesOf(tree)[0]).toMatch(/^Coordinator\s*Budget green \(read 12m ago\)$/)
    }
    expect(all(cardView(vm, fakeE('desktop'), { cols: 100, surface: 'desktop' }), 'Svg')[0].props.alt).toBe('Week 17% (pace ' + PACE + '%)')
  })
  test('card at 44 columns: the age shortens in the title, the block keeps it whole; the title always leaves a space', () => {
    const it = cardLines({ ...old(), lang: 'it' }, 44)
    expect(it[0]).toMatch(/^Coordinatore\s*Budget verde \(12m fa\)$/)
    expect(it).toContain('BUDGET      verde (lettura di 12m fa)')
    const en = cardLines(old(), 44)
    expect(en[0]).toMatch(/^Coordinator\s*Budget green \(read 12m ago\)$/)
    for (const lang of ['en', 'it']) {
      for (const cols of [44, 50, 60, 90, 120]) {
        for (const vm of [old(12), old(65, { weekly: 45 }), old(51 * 60, { weekly: 60 })]) {
          const tree = cardView({ ...vm, lang }, fakeE('terminal'), { cols, surface: 'terminal' })
          const inner = Math.max(24, Math.min(cols, 100) - 4)
          expect(cells(kids(tree)[0]), lang + ' ' + cols + ': ' + textOf(kids(tree)[0])).toBeLessThanOrEqual(inner - 1)
        }
      }
    }
  })

  test('pane: the BUDGET block of the Quadro and of the Notte tab, with the age', () => {
    const vm = old()
    expect(paneLines(vm, 'overview')).toContain('BUDGET      green (read 12m ago)')
    expect(paneLines({ ...vm, lang: 'it' }, 'overview')).toContain('BUDGET      verde (lettura di 12m fa)')
    const night = paneLines(vm, 'night').join('\n')
    expect(night).toMatch(/^BUDGET {6}green \(read 12m ago\)\n/m)
    expect(night).toMatch(/Reading\s+12m ago/)
    expect(night).toMatch(/Week\s+17%   pace \d+%/)
    const nightIt = paneLines({ ...vm, lang: 'it' }, 'night').join('\n')
    expect(nightIt).toMatch(/^BUDGET {6}verde \(lettura di 12m fa\)\n/m)
    expect(nightIt).toMatch(/Lettura\s+12m fa/)
    // the yellow and red words and the profile of the last known reading
    const yellow = paneLines(old(12, { weekly: 45 }), 'overview')
    expect(yellow).toContain('BUDGET      yellow (read 12m ago)')
    expect(yellow).toContain('            Profile  Max 5x   8 agents per run   1 cloud')
    expect(paneLines(old(12, { weekly: 60 }), 'overview')).toContain('BUDGET      red (read 12m ago)')
    // a fresh reading has no age, an unknown age waits
    expect(paneLines(fullVm(), 'overview')).toContain('BUDGET      green')
    expect(paneLines(fullVm({ budget: budgetFor({ unknownAge: true }) }), 'overview')).toContain('BUDGET      waiting')
    // the word in the block is dim in its color, the age dim
    const tree = paneView(vm, fakeE('terminal'), { cols: 100, surface: 'terminal', tab: 'overview' })
    expect(textNode(tree, 'green').props).toMatchObject({ color: 'success', dimColor: true })
    expect(textNode(tree, ' (read 12m ago)').props.dimColor).toBe(true)
  })
  test('pane at 44 columns: the BUDGET row carries the age and stays inside the pane', () => {
    for (const lang of ['en', 'it']) {
      for (const [ageMin, weekly] of [[12, 17], [65, 45], [51 * 60, 60]]) {
        for (const tab of ['overview', 'night']) {
          const lines = paneLines({ ...old(ageMin, { weekly }), lang }, tab, 44)
          const row = lines.find(l => l.startsWith('BUDGET'))
          expect(Array.from(row).length, lang + ' ' + tab + ': ' + row).toBeLessThanOrEqual(42)
          expect(row, lang + ' ' + tab).toMatch(lang === 'it' ? /\((lettura di )?[\dgh m]+ fa\)$/ : /\((read )?[\ddh m]+ ago\)$/)
        }
      }
    }
  })

  test('the texts for the model keep the rule: an old reading is unknown, with no pace, whatever `shown` holds', () => {
    const vm = old()
    expect(summaryText(vm).split('\n')[0]).toBe('budget: unknown, weekly 17%, 5h 0%, profile Max 20x')
    const line = budgetLine(vm)
    expect(line).toMatch(/^coordinator-lens budget: unknown \(old reading\) · profile Max 20x: 16 agents\/run, 3 cloud sessions · weekly 17% · 5h 0%/)
    expect(line).not.toContain('pace')
    const bare = { ...vm, budget: { ...vm.budget, shown: null } }
    expect(summaryText(vm)).toBe(summaryText(bare))
    expect(budgetLine(vm)).toBe(budgetLine(bare))
    expect(summaryText(vm)).not.toMatch(/ ago|budget: waiting/)
  })
  test('what the person sees follows the last known profile, what the model reads follows the rule', () => {
    const vm = old(12, { weekly: 45 })
    // yellow steps Max 20x down to Max 5x: 8 agents per run for the band, and for the model too, since an
    // old yellow reading keeps holding
    expect(bandText(vm, 300)).toContain('wf deep-review 7/8')
    expect(summaryText(vm).split('\n')[1]).toContain('deep-review wf 7/8')
    expect(summaryText(vm).split('\n')[0]).toBe('budget: yellow, margin +24, weekly 45% (pace 21), 5h 0%, profile Max 5x')
    expect(workflowSuffix(vm)).toBe('  wf deep-review 7/8')
  })
})

// ---------- the layout the person chose: clean labels ----------

// The Quadro of the person's example: a week at 25% with pace 29%, 18% of the 5 hours, three workers,
// a merge, a round, the flow at "spec" and one decision.
function quadroVm(lang) {
  return fullVm({
    lang,
    budget: budgetFor({ weekly: 25, five: 18, weeklyHours: 135, fiveIn: 2 * HOUR + 10 * MIN }),
    workers: [
      worker({ id: 'a1', label: 'Revisione finale PR #3', model: 'opus', startedAt: NOW - 5 * MIN }),
      worker({ id: 'wf', kind: 'workflow', label: 'review-open-prs', startedAt: NOW - 9 * MIN, agents: { total: 5, sonnet: 0, opus: 3, fable: 0, other: 0 } }),
      worker({ id: 'c1', kind: 'cloud', label: 'fix the flaky CI test', model: 'sonnet', status: 'launched', startedAt: NOW - 20 * MIN }),
    ],
    prs: [],
    merge: {
      pr: 3,
      steps: [
        { key: 'realign', done: true }, { key: 'checks', done: true }, { key: 'headPinned', done: true },
        { key: 'merged', done: false }, { key: 'ticketsClosed', done: false }, { key: 'roadmap', done: false }, { key: 'unblocked', done: false },
      ],
    },
    round: {
      since: NOW - 3 * HOUR,
      items: [{ key: 'mainCi', done: false }, { key: 'prsAndIssues', done: false }, { key: 'idleWorkers', done: false }, { key: 'duplicates', done: false }, { key: 'diffReviewed', done: false }],
    },
    flow: {
      stages: [
        { key: 'grill', state: 'done' }, { key: 'spec', state: 'active' }, { key: 'tickets', state: 'todo' },
        { key: 'build', state: 'todo' }, { key: 'review', state: 'todo' }, { key: 'pr', state: 'todo' },
      ],
      side: [], current: 'spec', artifacts: [], warnings: [],
    },
    decisions: [{ at: NOW, kind: 'question', text: 'Installo le mod globalmente?', pending: true }],
  })
}

const QUADRO_IT = [
  'BUDGET      verde',
  '            Settimana  ━━━━━━━╋──────────────────  25%   ritmo 29%   margine -4',
  '            5 ore      ━━━━━─────────────────────  18%   reset tra 2h 10m',
  '            Piano      Max 20x   16 agenti per run   3 cloud',
  '',
  'WORKER      3 attivi',
  '            ● Revisione finale PR #3   agente   opus            5m',
  '            ● review-open-prs          wf       5/16  3 opus    9m',
  '            ○ fix the flaky CI test    cloud    sonnet         20m',
  '',
  'MERGE       #3   3 di 7   prossimo: unito',
  'GIRO        0 di 5        prossimo: CI di main',
  'FLUSSO      ✓ grill  ◉ spec  ○ ticket  ○ sviluppo  ○ review  ○ pr',
  'DECISIONI   1 in attesa: Installo le mod globalmente?',
]

const QUADRO_EN = [
  'BUDGET      green',
  '            Week     ━━━━━━━╋──────────────────  25%   pace 29%   margin -4',
  '            5 hours  ━━━━━─────────────────────  18%   resets in 2h 10m',
  '            Plan     Max 20x   16 agents per run   3 cloud',
  '',
  'WORKERS     3 running',
  '            ● Revisione finale PR #3   agent   opus            5m',
  '            ● review-open-prs          wf      5/16  3 opus    9m',
  '            ○ fix the flaky CI test    cloud   sonnet         20m',
  '',
  'MERGE       #3   3 of 7   next: merged',
  'ROUND       0 of 5        next: main CI',
  'FLOW        ✓ grill  ◉ spec  ○ tickets  ○ build  ○ review  ○ pr',
  'DECISIONS   1 waiting: Installo le mod globalmente?',
]

describe('layout', () => {
  const quadro = (lang, cols = 90) => linesOf(paneView(quadroVm(lang), fakeE('terminal'), { cols, surface: 'terminal', tab: 'overview' })).slice(2)

  test('the Quadro tab at 90 columns is the example, in Italian and in English', () => {
    expect(quadro('it')).toEqual(QUADRO_IT)
    expect(quadro('en')).toEqual(QUADRO_EN)
  })
  test('the card at 90 columns carries the same rows, with the title, the state and the footer', () => {
    const lines = linesOf(cardView(quadroVm('it'), fakeE('terminal'), { cols: 90, surface: 'terminal' }))
    expect(lines[0]).toMatch(/^Coordinatore\s*Budget verde$/)
    expect(lines.slice(1, -2)).toEqual(QUADRO_IT)
    expect(lines[lines.length - 2]).toBe('')
    expect(lines[lines.length - 1]).toBe('istantanea   pannello live con /coord pane')
    expect(linesOf(cardView(quadroVm('en'), fakeE('terminal'), { cols: 90, surface: 'terminal' })).slice(1, -2)).toEqual(QUADRO_EN)
  })
  test('every section label is UPPERCASE in a 12-cell column and every value starts at the same column', () => {
    for (const lang of ['en', 'it']) {
      for (const tab of TABS) {
        const lines = linesOf(paneView({ ...fullVm({ night: nightOn() }), lang }, fakeE('terminal'), { cols: 100, surface: 'terminal', tab })).slice(2)
        for (const line of lines.filter(l => l.trim() !== '')) {
          const label = line.slice(0, 12)
          if (label.trim() !== '') {
            expect(label.trim(), lang + ' ' + tab + ': ' + line).toBe(label.trim().toUpperCase())
            expect(label.endsWith(' '), lang + ' ' + tab + ': ' + line).toBe(true)
          }
        }
        // the labels of a tab that has them, in order
        const labels = lines.filter(l => /^\S/.test(l)).map(l => l.slice(0, 12).trim())
        expect(labels.length, lang + ' ' + tab).toBeGreaterThan(0)
      }
    }
  })
  test('groups are one blank line apart: budget, workers, then the one-line block', () => {
    const lines = quadro('it')
    expect(lines.filter(l => l === '')).toHaveLength(2)
    expect(lines[4]).toBe('')
    expect(lines[9]).toBe('')
    expect(lines.slice(10).every(l => /^[A-Z]/.test(l))).toBe(true)
  })
  test('a narrow pane keeps every row inside the width: details and columns go, the labels stay', () => {
    for (const lang of ['en', 'it']) {
      for (const cols of [60, 90, 120]) {
        for (const tab of TABS) {
          const lines = linesOf(paneView({ ...fullVm({ night: nightOn() }), lang }, fakeE('terminal'), { cols, surface: 'terminal', tab })).slice(1)
          for (const line of lines) expect(Array.from(line).length, lang + ' ' + cols + ' ' + tab + ': ' + line).toBeLessThanOrEqual(cols - 2)
        }
      }
    }
    // at 60 columns the weekly row keeps its bar and drops the margin before it cuts anything
    const line = quadro('it', 60).find(l => /Settimana/.test(l))
    expect(line).toMatch(/Settimana {2}━+╋?─*  25%   ritmo 29%$/)
    expect(line).not.toContain('margine')
  })
  test('the budget rows never go past the row, in the pane and in the card, on the terminal and on Desktop', () => {
    const states = [
      quadroVm('en'),
      fullVm({ budget: budgetFor({ weekly: 45, five: 93 }) }),
      fullVm({ budget: budgetFor({ weekly: 60 }) }),
      fullVm({ budget: budgetFor({ weekly: 17, plan: '' }) }),
      fullVm({ budget: budgetFor({ weekly: 17, weeklyHours: -1 }) }),
      fullVm({ budget: budgetFor({ ageMin: 12 }) }),
      fullVm({ budget: budgetFor({ weekly: 45, five: 93, ageMin: 65 }) }),
      fullVm({ budget: budgetFor({ weekly: 60, ageMin: 51 * 60 }) }),
    ]
    for (const vm of states) {
      for (const lang of ['en', 'it']) {
        for (const cols of [44, 50, 60, 70, 90, 120]) {
          const v = { ...vm, lang }
          const where = lang + ' ' + cols + ' ' + vm.budget.color
          // the budget block: from the BUDGET row to the next blank row (or the end)
          const block = tree => {
            const rows = kids(tree)
            const from = rows.findIndex(r => textOf(r).startsWith('BUDGET'))
            expect(from, where).toBeGreaterThan(-1)
            const out = []
            for (const r of rows.slice(from)) {
              if (textOf(r) === '') break
              out.push(r)
            }
            return out
          }
          // the pane body is cols - 2 wide; the card's rows are 4 narrower than the card
          for (const tab of ['overview', 'night']) {
            const rows = block(paneView(v, fakeE('terminal'), { cols, surface: 'terminal', tab }))
            expect(rows.length, where + ' pane ' + tab).toBeGreaterThan(3)
            for (const r of rows) expect(cells(r), where + ' pane ' + tab + ': ' + textOf(r)).toBeLessThanOrEqual(cols - 2)
          }
          for (const surface of ['terminal', 'desktop']) {
            const rows = block(cardView(v, fakeE(surface), { cols, surface }))
            expect(rows.length, where + ' card ' + surface).toBeGreaterThan(3)
            for (const r of rows) expect(cells(r), where + ' card ' + surface + ': ' + textOf(r)).toBeLessThanOrEqual(Math.min(cols, 100) - 4)
          }
        }
      }
    }
  })
  test('a narrow row loses its details first: the 5-hour detail goes under the bar, a card Svg gives way to the text bar', () => {
    const vm = { ...fullVm({ budget: budgetFor({ weekly: 17, five: 92 }) }), lang: 'en' }
    const at = (cols, surface = 'terminal') => linesOf(cardView(vm, fakeE(surface), { cols, surface })).slice(1)
    // 100 columns: everything on its row
    expect(at(100).find(l => l.startsWith('            5 hours'))).toMatch(/92%   wait 4h 10m$/)
    // 44 columns (a row has 28 cells after the label column): the wait is the row under the bar, indented
    const narrow = at(44)
    const i = narrow.findIndex(l => l.startsWith('            5 hours'))
    expect(narrow[i]).toMatch(/━+─*  92%$/)
    expect(narrow[i + 1]).toBe(' '.repeat(21) + 'wait 4h 10m')
    // the Svg needs 20 cells for itself: with less room than that the card draws the text bar, on Desktop too
    expect(all(cardView(vm, fakeE('desktop'), { cols: 100, surface: 'desktop' }), 'Svg')).toHaveLength(1)
    expect(all(cardView(vm, fakeE('desktop'), { cols: 50, surface: 'desktop' }), 'Svg')).toHaveLength(1)
    expect(all(cardView(vm, fakeE('desktop'), { cols: 48, surface: 'desktop' }), 'Svg')).toHaveLength(0)
    expect(at(48, 'desktop').find(l => l.startsWith('            Week'))).toMatch(/━+.*17%/)
  })
  test('the Plan row is the plan, never today\'s profile; the profile has a row of its own only when it is not the plan\'s', () => {
    const rows = (budget, lang, cols = 90, tab = 'overview') => linesOf(paneView({ ...quadroVm(lang), budget }, fakeE('terminal'), { cols, surface: 'terminal', tab })).slice(2)
    const has = (lines, text) => lines.some(l => l.includes(text))
    // green: the plan, with what it allows today, and nothing else
    const green = rows(budgetFor({ weekly: 25 }), 'it')
    expect(green).toContain('            Piano      Max 20x   16 agenti per run   3 cloud')
    expect(has(green, 'Profilo')).toBe(false)
    // yellow steps down: the plan stays Max 20x and the profile is its own row, in the warning color
    const yellow = rows(budgetFor({ weekly: 45 }), 'it')
    expect(yellow).toContain('            Piano      Max 20x   16 agenti per run   3 cloud')
    expect(yellow).toContain('            Profilo    Max 5x   8 agenti per run   1 cloud')
    const yellowTree = paneView({ ...quadroVm('it'), budget: budgetFor({ weekly: 45 }) }, fakeE('terminal'), { cols: 90, surface: 'terminal', tab: 'overview' })
    expect(textNode(yellowTree, 'Max 5x   8 agenti per run   1 cloud').props.color).toBe('warning')
    expect(textNode(yellowTree, 'Max 20x   16 agenti per run   3 cloud').props.dimColor).toBe(true)
    // red launches nothing: in Italian no English profile name, in the error color
    const red = rows(budgetFor({ weekly: 60 }), 'it')
    expect(red).toContain('            Piano      Max 20x   16 agenti per run   3 cloud')
    expect(red).toContain('            Profilo    nessun nuovo avvio')
    expect(red.join('\n')).not.toMatch(/Red|Piano +Red/)
    expect(textNode(paneView({ ...quadroVm('it'), budget: budgetFor({ weekly: 60 }) }, fakeE('terminal'), { cols: 90, surface: 'terminal', tab: 'overview' }), 'nessun nuovo avvio').props.color).toBe('error')
    // English, and the same rows on the card
    expect(rows(budgetFor({ weekly: 45 }), 'en')).toContain('            Profile  Max 5x   8 agents per run   1 cloud')
    expect(rows(budgetFor({ weekly: 60 }), 'en')).toContain('            Profile  no new launches')
    const card = linesOf(cardView({ ...quadroVm('it'), budget: budgetFor({ weekly: 45 }) }, fakeE('terminal'), { cols: 90, surface: 'terminal' }))
    expect(card).toContain('            Piano      Max 20x   16 agenti per run   3 cloud')
    expect(card).toContain('            Profilo    Max 5x   8 agenti per run   1 cloud')
    // the Notte tab already says the plan, and still does
    expect(rows(budgetFor({ weekly: 45 }), 'it', 100, 'night').join('\n')).toMatch(/Piano +Max 20x +riserva 10%/)
    // the waiting color (no reading) has no profile of its own
    expect(has(rows(budgetFor({ weekly: null, five: null }), 'it'), 'Profilo')).toBe(false)
  })
  test('a plan that was not read says so, in the Quadro, the card and the Notte tab, and names the profile it assumes', () => {
    const unknown = budgetFor({ weekly: 17, plan: '' })
    expect(unknown.plan.known).toBe(false)
    const quadro = (lang, tab = 'overview', cols = 100) => linesOf(paneView({ ...quadroVm(lang), budget: unknown }, fakeE('terminal'), { cols, surface: 'terminal', tab })).slice(2)
    expect(quadro('it')).toContain('            Piano      non letto   si assume Max 5x')
    expect(quadro('en')).toContain('            Plan     not read   Max 5x assumed')
    expect(quadro('it').join('\n')).not.toContain('Profilo')
    expect(linesOf(cardView({ ...quadroVm('it'), budget: unknown }, fakeE('terminal'), { cols: 100, surface: 'terminal' }))).toContain('            Piano      non letto   si assume Max 5x')
    expect(quadro('it', 'night').join('\n')).toMatch(/Piano +non letto +si assume Max 5x +riserva 15%/)
    expect(quadro('en', 'night').join('\n')).toMatch(/Plan +not read +Max 5x assumed +reserve 15%/)
    expect(quadro('it', 'night').join('\n')).not.toMatch(/Piano +Max 5x/)
    // a narrow Notte tab packs the pieces under the label instead of cutting the name
    const narrow = quadro('it', 'night', 44)
    expect(narrow.join('\n')).toMatch(/Piano {6}non letto\n {23}si assume Max 5x\n {23}riserva 15%/)
    for (const l of narrow) expect(nCells(l)).toBeLessThanOrEqual(42)
  })
  test('the workers counts go on the next row when they do not fit; none is cut', () => {
    for (const [lang, first, second] of [
      ['it', 'WORKER      3 attivi   3 finiti', '            1 fallito   1 negato'],
      ['en', 'WORKERS     3 running   3 done   1 failed', '            1 denied'],
    ]) {
      for (const tab of ['overview', 'workers']) {
        const lines = linesOf(paneView({ ...fullVm(), lang }, fakeE('terminal'), { cols: 44, surface: 'terminal', tab })).slice(2)
        const i = lines.indexOf(first)
        expect(i, lang + ' ' + tab).toBeGreaterThan(-1)
        expect(lines[i + 1], lang + ' ' + tab).toBe(second)
        expect(lines.slice(i, i + 2).join('')).not.toContain('…')
      }
    }
  })
  test('the pull request rows keep their title at 44 columns: the checks word goes, the state is cut last', () => {
    const lines = (lang, cols) => linesOf(paneView({ ...fullVm(), lang }, fakeE('terminal'), { cols, surface: 'terminal', tab: 'merge' })).filter(l => /^ {12}#4\d/.test(l))
    for (const lang of ['en', 'it']) {
      for (const cols of [44, 50]) {
        const rows = lines(lang, cols)
        expect(rows).toHaveLength(3)
        for (const r of rows) {
          expect(nCells(r), lang + ' ' + cols + ': ' + r).toBeLessThanOrEqual(cols - 2)
          const title = /[✓✗–] (.+)$/.exec(r)[1]
          expect(nCells(title), lang + ' ' + cols + ': ' + r).toBeGreaterThanOrEqual(10)
          expect(r).not.toMatch(/verde|rosso|green|red\b/)
        }
      }
      // with room the columns are as they were: state, mark and word, title
      expect(lines(lang, 90)[0]).toMatch(lang === 'it' ? /^ {12}#42 {2}aperta {8}✓ verde {4}feat\(auth\)/ : /^ {12}#42 {2}open {10}✓ green {4}feat\(auth\)/)
    }
    // a draft reads "bozza aperta" in Italian and "open draft" in English
    expect(lines('it', 90)[1]).toContain('bozza aperta')
    expect(lines('en', 90)[1]).toContain('open draft')
  })
  test('the Svg alt of a week with no pace says the week alone, never "pace ?%"', () => {
    const stale = { ...fullVm({ budget: budgetFor({ weekly: 17, weeklyHours: -1 }) }) }
    expect(stale.budget.pace).toBeNull()
    for (const [lang, alt] of [['en', 'Week 17%'], ['it', 'Settimana 17%']]) {
      const svgs = all(cardView({ ...stale, lang }, fakeE('desktop'), { cols: 100, surface: 'desktop' }), 'Svg')
      expect(svgs).toHaveLength(1)
      expect(svgs[0].props.alt).toBe(alt)
    }
  })
  test('no head dot and no middle-dot separator in anything the person sees, any state, language, surface and width', () => {
    const states = [
      fullVm(), fullVm({ night: nightOn() }), fullVm({ budget: budgetFor({ five: 92 }) }), fullVm({ budget: budgetFor({ weekly: 60 }) }),
      quadroVm('it'), quietVm(), { ...quietVm(), workers: [worker({ id: 'a', label: 'solo' })], night: nightOn() },
      { lang: 'en', now: NOW, budget: { color: 'unknown' } },
      fullVm({ budget: budgetFor({ ageMin: 12 }), night: nightOn() }), fullVm({ budget: budgetFor({ weekly: 60, ageMin: 65 }) }),
    ]
    for (const vm of states) {
      for (const lang of ['en', 'it']) {
        for (const surface of ['terminal', 'desktop']) {
          for (const cols of [44, 60, 90, 120]) {
            const E = fakeE(surface)
            const v = { ...vm, lang }
            const trees = [bandView(v, E, { cols, surface }), cardView(v, E, { cols, surface }), ...TABS.map(tab => paneView(v, E, { cols, surface, tab }))].filter(Boolean)
            for (const tree of trees) {
              for (const line of linesOf(tree)) {
                expect(line, lang + ' ' + surface + ' ' + cols).not.toContain('·')
              }
              // a dot only ever marks a running worker: '● ' in the claude color, never a head dot
              for (const x of all(tree, 'Text').filter(n => n.props.children.includes('●'))) {
                expect(x.props.children).toBe('● ')
                expect(x.props.color).toBe('claude')
              }
              for (const x of all(tree, 'Button')) expect(x.props.label).not.toMatch(/[●·]/)
            }
            // never at the head of a band or a card title
            const band = bandView(v, E, { cols, surface })
            if (band) expect(textOf(band)).not.toContain('●')
            expect(linesOf(cardView(v, E, { cols, surface }))[0]).not.toContain('●')
          }
        }
      }
    }
  })
})

// ---------- card ----------

describe('card', () => {
  test('terminal tree: rounded box, text pace bar, no Svg, no Button', () => {
    const tree = cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' })
    expect(tree.props.borderStyle).toBe('round')
    expect(hasSvg(tree)).toBe(false)
    expect(all(tree, 'Button')).toHaveLength(0)
    const text = textOf(tree)
    expect(text).toMatch(/Week\s+[━─╋]{8,}\s+17%/)
    expect(text).toMatch(/5 hours\s+[━─]{8,}\s+0%/)
    expect(text).toContain('╋')
    expect(text).not.toMatch(/[█░▓│]/)
  })
  test('desktop tree: the pace bar is an Svg from paceSvg, the terminal bar is not drawn beside it', () => {
    const vm = fullVm()
    const tree = cardView(vm, fakeE('desktop'), { cols: 100, surface: 'desktop' })
    const svgs = all(tree, 'Svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].props.source).toBe(paceSvg(vm, svgs[0].props.width, svgs[0].props.height))
    expect(svgs[0].props.alt).toBe('Week 17% (pace ' + PACE + '%)')
    const lines = linesOf(tree)
    // the Svg stands in for the weekly text bar: the row is the label, the Svg, the percent and the details
    const week = lines.find(l => /^ {12}Week /.test(l))
    expect(week).not.toMatch(/[━─╋]/)
    expect(week).toMatch(/^ {12}Week {7}17%   pace \d+%   margin -\d+$/)
    expect(textOf(tree)).not.toMatch(/[█░▓]/)
  })
  test('desktop without an Svg table falls back to the text bar', () => {
    const tree = cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'desktop' })
    expect(hasSvg(tree)).toBe(false)
    expect(textOf(tree)).toMatch(/Week\s+[━─╋]{8,}\s+17%/)
    expect(textOf(tree)).toContain('╋')
  })
  test('title, six workers at most, merge and round one-liners, flow chips, pending decision, footer', () => {
    const lines = linesOf(cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' }))
    const text = lines.join('\n')
    // the title: the name at the left, then the dim label 'Budget' and the state word, no dot
    expect(lines[0]).toMatch(/^Coordinator\s*Budget green$/)
    expect(lines[0]).not.toContain('●')
    const title = all(cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' }), 'Text').slice(0, 3).map(x => x.props)
    expect(title[0]).toMatchObject({ children: 'Coordinator', bold: true, color: 'claude' })
    expect(title[1]).toMatchObject({ children: 'Budget ', dimColor: true })
    expect(title[2]).toMatchObject({ children: 'green', bold: true, color: 'success' })
    expect(text).toContain('deep-review')
    expect(text).toContain('review: auth')
    expect(text).toContain('fix-ci: flaky timeout')
    expect(text).toContain('docs: roadmap')
    expect(text).toContain('lint sweep')
    expect(text).toContain('explore api')
    expect(text).not.toContain('old-failed')
    expect(text).not.toContain('old-denied')
    expect(text).toContain('+2 more')
    expect(text).toContain('3 running   3 done   1 failed   1 denied')
    expect(text).toMatch(/\nMERGE {7}#42   2 of 7   next: merged\n/)
    expect(text).toMatch(/\nROUND {7}2 of 5 {9}next: duplicates\n/)
    expect(text).toMatch(/\nFLOW {8}✓ grill {2}✓ spec {2}◉ tickets {2}○ build {2}○ review {2}○ pr\n/)
    expect(text).toMatch(/\nDECISIONS {3}1 waiting: Merge #42 now or wait for the diff review\?\n/)
    expect(text).not.toContain('Merged #41')
    expect(lines[lines.length - 1]).toBe('snapshot   /coord pane for the live panel')
  })
  test('the workers are marked by state: ● running, ○ launched, ! stalled, ✓ done', () => {
    const lines = linesOf(cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' }))
    const row = name => lines.find(l => l.includes(name))
    expect(row('deep-review')).toMatch(/^ {12}● /)
    expect(row('review: auth')).toMatch(/^ {12}● /)
    expect(row('fix-ci')).toMatch(/^ {12}! /)
    expect(row('docs: roadmap')).toMatch(/^ {12}✓ /)
    const tree = cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' })
    expect(textNode(tree, '● ').props.color).toBe('claude')
    expect(textNode(tree, '! ').props.color).toBe('warning')
    expect(textNode(tree, '✓ ').props.color).toBe('success')
    // a launched worker keeps the hollow mark
    const launched = cardView(fullVm({ workers: [worker({ id: 'l', label: 'sent one', status: 'launched' })] }), fakeE('terminal'), { cols: 100, surface: 'terminal' })
    expect(textOf(launched)).toMatch(/○ sent one/)
  })
  test('cloud worker with a session URL gets a link', () => {
    const tree = cardView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal' })
    const links = all(tree, 'Link')
    expect(links).toHaveLength(1)
    expect(links[0].props.href).toBe('https://claude.ai/code/session_01ABC')
  })
  test('empty coordinator: calm placeholders, no flow row, no decisions', () => {
    const lines = linesOf(cardView(quietVm(), fakeE('terminal'), { cols: 80, surface: 'terminal' }))
    const text = lines.join('\n')
    expect(lines[0]).toMatch(/^Coordinator\s*Budget waiting$/)
    expect(text).not.toContain('no data')
    expect(text).toContain('no reading yet')
    expect(text).toContain('No workers yet')
    expect(text).toContain('No merge in progress')
    expect(text).toContain('No round yet')
    expect(text).not.toContain('FLOW')
    expect(text).not.toContain('DECISIONS')
  })
  test('width follows cols and stays within 100', () => {
    expect(cardView(fullVm(), fakeE('terminal'), { cols: 60 }).props.width).toBe(60)
    expect(cardView(fullVm(), fakeE('terminal'), { cols: 200 }).props.width).toBe(100)
    for (const line of linesOf(cardView(fullVm(), fakeE('terminal'), { cols: 60 }))) expect(Array.from(line).length).toBeLessThanOrEqual(56)
  })
  test('Italian card', () => {
    const lines = linesOf(cardView({ ...fullVm(), lang: 'it' }, fakeE('terminal'), { cols: 100 }))
    const text = lines.join('\n')
    expect(lines[0]).toMatch(/^Coordinatore\s*Budget verde$/)
    expect(linesOf(cardView({ ...quietVm(), lang: 'it' }, fakeE('terminal'), { cols: 100 }))[0]).toMatch(/^Coordinatore\s*Budget in attesa$/)
    expect(text).toContain('Coordinatore')
    expect(text).toContain('WORKER')
    expect(text).toContain('GIRO')
    expect(text).toContain('istantanea   pannello live con /coord pane')
    expect(text).toContain('3 attivi   3 finiti   1 fallito   1 negato')
  })
})

// ---------- pane ----------

describe('pane', () => {
  const makeActions = () => {
    const calls = []
    return { calls, setTab: k => calls.push(['setTab', k]), toggleNight: () => calls.push(['toggleNight']) }
  }

  test('five plain tabs with hotkeys 1-5, the current at full strength; no close button and no x hotkey, the tab row holds only the five tabs', () => {
    const actions = makeActions()
    const tree = paneView(fullVm(), fakeE('terminal'), { cols: 120, surface: 'terminal', tab: 'workers', actions })
    const tabs = all(tree, 'Button').filter(b => b.props.key.startsWith('tab-'))
    expect(tabs.map(b => b.props.key)).toEqual(TABS.map(k => 'tab-' + k))
    expect(tabs.map(b => b.props.hotkey)).toEqual(['1', '2', '3', '4', '5'])
    // the terminal draws a plain button as `1: Overview`, so the label carries no number of its own
    expect(tabs.map(b => b.props.label)).toEqual(['Overview', 'Workers', 'Merge', 'Flow', 'Night'])
    expect(tabs.every(b => b.props.plain === true)).toBe(true)
    // the current tab is at full strength, the others dim
    expect(tabs.map(b => b.props.dimColor)).toEqual([true, undefined, true, true, true])
    expect(tabs.map(b => b.props.variant)).toEqual(['secondary', 'primary', 'secondary', 'secondary', 'secondary'])
    // the pane draws its own close mark at the top right and Esc closes it: no close Button of ours, no `x` hotkey
    expect(button(tree, 'close')).toBeUndefined()
    // the tab row is the Box of the five tabs and nothing else, so the five tabs are the only Buttons on the overview
    const tabsRow = kids(tree)[0]
    expect(tabsRow.type).toBe('Box')
    expect(kids(tabsRow)).toHaveLength(5)
    expect(kids(tabsRow).every(k => k.type === 'Button')).toBe(true)
    expect(kids(tabsRow).map(k => k.props.key)).toEqual(TABS.map(k => 'tab-' + k))
    expect(tabsRow.props.justifyContent).toBeUndefined()
    expect(all(paneView(fullVm(), fakeE('terminal'), { cols: 120, tab: 'overview' }), 'Button')).toHaveLength(5)
  })
  test('no close Button, no x hotkey and no dismiss role on any tab, width or language', () => {
    for (const lang of ['en', 'it']) {
      for (const cols of [44, 60, 90, 120]) {
        for (const tab of TABS) {
          const buttons = all(paneView({ ...fullVm(), lang }, fakeE('terminal'), { cols, surface: 'terminal', tab }), 'Button')
          const where = [lang, cols, tab].join(' ')
          expect(buttons.map(b => b.props.hotkey), where).not.toContain('x')
          expect(buttons.map(b => b.props.role), where).not.toContain('dismiss')
          expect(buttons.map(b => b.props.key), where).not.toContain('close')
          expect(buttons.map(b => b.props.label), where).not.toContain('Close')
          expect(buttons.map(b => b.props.label), where).not.toContain('Chiudi')
        }
      }
    }
  })
  test('the i18n table no longer carries a close button text, in either language', () => {
    expect(KEYS).not.toContain('btn.close')
    for (const lang of ['en', 'it']) expect(has(lang, 'btn.close')).toBe(false)
  })
  test('a thin rule of ─ in the subtle color sits under the tab row, as wide as the pane', () => {
    for (const cols of [60, 90, 120]) {
      const tree = paneView(fullVm(), fakeE('terminal'), { cols, surface: 'terminal', tab: 'overview' })
      const rule = kids(tree)[1]
      expect(rule.type).toBe('Text')
      expect(rule.props.children).toBe('─'.repeat(cols - 2))
      expect(rule.props.color).toBe('subtle')
    }
    // the body follows at once, with no blank row between the rule and the first section
    expect(linesOf(paneView(quadroVm('it'), fakeE('terminal'), { cols: 90, tab: 'overview' }))[2]).toBe('BUDGET      verde')
  })
  test('buttons call the actions', () => {
    const actions = makeActions()
    const tree = paneView(fullVm(), fakeE('terminal'), { cols: 120, tab: 'overview', actions })
    button(tree, 'tab-merge').props.onPress()
    button(tree, 'tab-night').props.onPress()
    const night = paneView(fullVm(), fakeE('terminal'), { cols: 120, tab: 'night', actions })
    button(night, 'night-toggle').props.onPress()
    expect(actions.calls).toEqual([['setTab', 'merge'], ['setTab', 'night'], ['toggleNight']])
  })
  test('no actions given: pressing does nothing and does not throw', () => {
    const tree = paneView(fullVm(), fakeE('terminal'), { cols: 120, tab: 'night' })
    button(tree, 'tab-flow').props.onPress()
    button(tree, 'night-toggle').props.onPress()
  })
  test('tab can be a key, a number, or junk', () => {
    const primary = tab => all(paneView(fullVm(), fakeE('terminal'), { cols: 120, tab }), 'Button').find(b => b.props.variant === 'primary').props.key
    expect(primary('flow')).toBe('tab-flow')
    expect(primary(3)).toBe('tab-merge')
    expect(primary('5')).toBe('tab-night')
    expect(primary('nope')).toBe('tab-overview')
    expect(primary(undefined)).toBe('tab-overview')
  })
  test('the tab names are short at every width, and Italian', () => {
    const labels = (vm, cols) => all(paneView(vm, fakeE('terminal'), { cols }), 'Button').filter(b => b.props.key.startsWith('tab-')).map(b => b.props.label)
    for (const cols of [44, 60, 90, 120]) expect(labels(fullVm(), cols)).toEqual(['Overview', 'Workers', 'Merge', 'Flow', 'Night'])
    for (const cols of [44, 60, 90, 120]) expect(labels({ ...fullVm(), lang: 'it' }, cols)).toEqual(['Quadro', 'Worker', 'Merge', 'Flusso', 'Notte'])
    for (const lang of ['en', 'it']) for (const label of labels({ ...fullVm(), lang }, 90)) expect(label).not.toMatch(/^\d/)
  })
  test('overview: no Svg on any surface (the Svg bar is only in the /coord card)', () => {
    expect(hasSvg(paneView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal', tab: 'overview' }))).toBe(false)
    for (const tab of TABS) expect(hasSvg(paneView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal', tab }))).toBe(false)
    expect(hasSvg(paneView(fullVm(), fakeE('desktop'), { cols: 100, surface: 'desktop', tab: 'overview' }))).toBe(false)
    for (const tab of TABS) expect(hasSvg(paneView(fullVm(), fakeE('desktop'), { cols: 100, surface: 'desktop', tab }))).toBe(false)
    const text = textOf(paneView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal', tab: 'overview' }))
    expect(text).toContain('+4 more')
    // both bars are text in the pane: ━ filled, ─ empty, ╋ the pace mark on the week only
    expect(text).toMatch(/Week\s+━+─*╋?─*\s+17%\s+pace/)
    expect(text).toMatch(/5 hours\s+─{8,}\s+0%\s+resets in 4h 10m/)
    expect(text.match(/╋/g)).toHaveLength(1)
  })
  test('overview: the workers are a compact table, marks say the state, the 5-hour pause is a warning', () => {
    const lines = linesOf(paneView(fullVm(), fakeE('terminal'), { cols: 100, surface: 'terminal', tab: 'overview' }))
    const rows = lines.filter(l => /^ {12}[●○✓✗!] /.test(l))
    expect(rows).toHaveLength(4)
    // progress and model share one cell, the time is the last column, there is no state word
    expect(rows[0]).toMatch(/^ {12}● deep-review {2,}wf {6}7\/16 {2}5 sonnet 2 opus {2,}12m$/)
    expect(rows[1]).toMatch(/● review: auth {2,}agent {3}sonnet high {2,}20m$/)
    expect(rows.join('\n')).not.toMatch(/running|stalled/)
    const paused = paneView(fullVm({ budget: budgetFor({ five: 92 }) }), fakeE('terminal'), { cols: 100, tab: 'overview' })
    const five = all(paused, 'Text').find(x => /^ {3}wait 4h 10m$/.test(x.props.children))
    expect(five.props.color).toBe('warning')
    expect(textOf(paused)).toMatch(/5 hours\s+━+─*\s+92%\s+wait 4h 10m/)
    // with no reading the week says so in dim text, with no bar
    const none = textOf(paneView(quietVm(), fakeE('terminal'), { cols: 100, tab: 'overview' }))
    expect(none).toMatch(/Week\s+no reading yet/)
    expect(none).not.toMatch(/[━╋]/)
  })
  test('workers tab: header, aligned columns, every worker', () => {
    const lines = linesOf(paneView(fullVm(), fakeE('terminal'), { cols: 100, tab: 'workers' }))
    const header = lines.find(l => /^ {12}\s+name\s+kind\s+model/.test(l))
    expect(header).toBeDefined()
    const rows = lines.filter(l => /^ {12}[●○✓✗!] /.test(l))
    expect(rows).toHaveLength(8)
    const widths = new Set(rows.map(r => Array.from(r).length))
    expect(widths.size).toBe(1)
    const text = lines.join('\n')
    expect(text).toMatch(/^WORKERS {5}3 running {3}3 done {3}1 failed {3}1 denied/m)
    expect(text).toContain('5 sonnet 2 opus')
    expect(text).toContain('7/16')
    expect(text).toContain('sonnet high')
    expect(text).toContain('stalled')
    expect(text).toContain('denied')
    expect(text).toContain('1.4')
    const stalledRow = rows.find(r => r.includes('fix-ci'))
    expect(stalledRow.startsWith('            ! ')).toBe(true)
  })
  test('workers tab drops columns on a narrow pane but keeps names aligned', () => {
    const lines = linesOf(paneView(fullVm(), fakeE('terminal'), { cols: 44, tab: 'workers' }))
    const rows = lines.filter(l => /^ {12}[●○✓✗!] /.test(l))
    expect(rows).toHaveLength(8)
    for (const r of rows) expect(Array.from(r).length).toBeLessThanOrEqual(42)
    // aligned: every row is as wide as the others, the mark sits in the same column and the names start in the same column
    expect(new Set(rows.map(r => Array.from(r).length)).size).toBe(1)
    expect(new Set(rows.map(r => Array.from(r.slice(0, 14)).length)).size).toBe(1)
    for (const r of rows) {
      expect(/[●○✓✗!]/.test(Array.from(r)[12]), r).toBe(true)
      expect(Array.from(r)[13], r).toBe(' ')
      expect(Array.from(r)[14], r).not.toBe(' ')
    }
    // the first column is the name, so the names are there in full or cut with an ellipsis, never moved
    expect(rows[0].slice(14)).toMatch(/^deep-review/)
    expect(rows[2].slice(14)).toMatch(/^fix-ci: flaky/)
    // the header, when there is one, starts its first column where the names start
    const header = lines.find(l => /^ {12}\s+name/.test(l))
    expect(header.indexOf('name')).toBe(14)
  })
  test('merge tab: MERGE #42 then the steps with ✓ ○ and a dim probable mark, ROUND, PR', () => {
    const tree = paneView(fullVm(), fakeE('terminal'), { cols: 100, tab: 'merge' })
    const text = textOf(tree)
    expect(text).toMatch(/^MERGE {7}#42\n {12}✓ main merged in\n {12}✓ checks green\n {12}○ head pinned \?\n {12}○ merged\n/m)
    expect(text).toContain('checks green')
    expect(text).toContain('head pinned ?')
    expect(text).toContain('? probable')
    expect(text).toMatch(/^ROUND {7}since 3h\n {12}✓ main CI\n/m)
    expect(text).toContain('main CI')
    const done = textNode(tree, '✓ ')
    expect(done.props.color).toBe('success')
    const probableMark = all(tree, 'Text').find(x => x.props.children === '○ ' && x.props.dimColor)
    expect(probableMark).toBeDefined()
    expect(all(tree, 'Text').find(x => x.props.children === 'head pinned ?').props.dimColor).toBe(true)
    const todoMark = all(tree, 'Text').find(x => x.props.children === '○ ' && !x.props.dimColor)
    expect(todoMark).toBeDefined()
    expect(text).not.toContain('●')
    expect(text).toMatch(/#42\s+open\s+✓ green\s+feat\(auth\)/)
    expect(text).toMatch(/#43\s+open draft\s+✗ red\s+fix\(ci\)/)
    expect(text).toMatch(/#41\s+merged\s+–/)
    expect(text).toMatch(/^PR {10}3\n/m)
    expect(all(tree, 'Link').map(l => l.props.href)).toContain('https://github.com/acme/app/pull/42')
  })
  test('merge tab without a pull request number: the first step shares the label line; nothing in progress says so', () => {
    const noPr = fullVm({ merge: { pr: null, steps: [{ key: 'realign', done: true }, { key: 'checks', done: false }] } })
    expect(textOf(paneView(noPr, fakeE('terminal'), { cols: 100, tab: 'merge' }))).toMatch(/^MERGE {7}✓ main merged in\n {12}○ checks green\n/m)
    expect(textOf(paneView(quietVm(), fakeE('terminal'), { cols: 100, tab: 'merge' }))).toMatch(/^MERGE {7}No merge in progress$/m)
  })
  test('Italian pane: check states, pull request states and the worker kind are not English', () => {
    const it = { ...fullVm(), lang: 'it' }
    const merge = textOf(paneView(it, fakeE('terminal'), { cols: 100, tab: 'merge' }))
    expect(merge).toMatch(/#42\s+aperta\s+✓ verde\s+feat\(auth\)/)
    expect(merge).toMatch(/#43\s+bozza aperta\s+✗ rosso\s+fix\(ci\)/)
    expect(merge).not.toContain('aperta bozza')
    expect(merge).toMatch(/#41\s+unita/)
    expect(merge).toContain('worker inattivi')
    expect(merge).toMatch(/^MERGE {7}#42\n {12}✓ main integrato\n {12}✓ check verdi\n/m)
    expect(merge).not.toMatch(/fermi|green|red|open|draft|merged/)
    const workers = textOf(paneView(it, fakeE('terminal'), { cols: 100, tab: 'workers' }))
    expect(workers).toContain('agente')
    expect(workers).not.toMatch(/\bagent\b/)
  })
  test('flow tab: stages with ✓ ◉ ○, side skills, files, warnings', () => {
    const tree = paneView(fullVm(), fakeE('terminal'), { cols: 100, tab: 'flow' })
    const text = textOf(tree)
    expect(text).toMatch(/^FLOW {8}✓ grill\n {12}✓ spec\n {12}◉ tickets {2}now\n {12}○ build/m)
    expect(text).toMatch(/^ASIDE {7}triage {3}25m ago$/m)
    expect(text).toMatch(/prd\s+PRD\.md/)
    expect(text).toMatch(/context\s+CONTEXT\.md/)
    expect(text).toMatch(/^WARNINGS {4}! Issue created without a milestone$/m)
    expect(textNode(tree, '✓ ').props.color).toBe('success')
    expect(all(tree, 'Text').find(x => x.props.children === '◉ ')).toMatchObject({ props: { color: 'claude', bold: true } })
    expect(all(tree, 'Text').find(x => x.props.children === '○ ').props.dimColor).toBe(true)
  })
  test('flow tab: idle flow says so; unknown warning keys show their text', () => {
    const idle = textOf(paneView(quietVm(), fakeE('terminal'), { cols: 100, tab: 'flow' }))
    expect(idle).toContain('No skill flow yet')
    expect(idle).toContain('○ grill')
    const vm = fullVm()
    vm.flow = { ...vm.flow, warnings: [{ key: 'brandNew', text: 'something odd happened' }] }
    expect(textOf(paneView(vm, fakeE('terminal'), { cols: 100, tab: 'flow' }))).toContain('! something odd happened')
  })
  test('night tab: toggle button, cost, budget details, all with the label column', () => {
    const off = paneView(fullVm(), fakeE('terminal'), { cols: 100, tab: 'night' })
    const toggle = button(off, 'night-toggle')
    expect(toggle.props.label).toBe('Turn night on')
    expect(toggle.props.hotkey).toBe('n')
    expect(toggle.props.plain).toBe(true)
    const text = textOf(off)
    expect(text).toMatch(/^NIGHT {7}off$/m)
    expect(text).toMatch(/^RUN COST {4}0\.22 weekly points per Sonnet-sized agent {3}5 measured runs$/m)
    expect(text).toMatch(/A full run \(16 agents\) would cost about 3\.52 points {3}fits/)
    expect(text).toContain('last: deep-review   2 points   9 agents')
    expect(text).toMatch(/^BUDGET {6}green\n/m)
    expect(text).toMatch(/Week\s+17%   pace \d+%   margin -\d+   resets in 6d/)
    expect(text).toMatch(/5 hours\s+0%   resets in 4h 10m/)
    expect(text).toMatch(/Plan\s+Max 20x   reserve 10%   weekly reset until 2026-10-22/)
    expect(text).toMatch(/Reading\s+2m ago/)
    const on = paneView(fullVm({ night: nightOn() }), fakeE('terminal'), { cols: 100, tab: 'night' })
    expect(button(on, 'night-toggle').props.label).toBe('Turn night off')
    const onText = textOf(on)
    expect(onText).toMatch(/^NIGHT {7}on {3}since 3h$/m)
    expect(onText).toContain('next wake in 12m')
    expect(onText).toContain('4.2 weekly points spent')
    // the hint is its own dim rows, wrapped by hand so every row stays under its label column
    const narrow = linesOf(paneView(fullVm(), fakeE('terminal'), { cols: 50, tab: 'night' }))
    expect(narrow.filter(l => /Night mode only|it starts nothing/.test(l)).length).toBeGreaterThan(1)
    for (const l of narrow) expect(Array.from(l).length).toBeLessThanOrEqual(49)
  })
  test('night tab: no run measured yet, and a full run that does not fit', () => {
    const none = fullVm({ runCost: { unitPoints: null, samples: 0, last: null } })
    expect(textOf(paneView(none, fakeE('terminal'), { cols: 100, tab: 'night' }))).toContain('No run measured yet')
    const tight = fullVm({ budget: budgetFor({ weekly: 30 }), runCost: { unitPoints: 5, samples: 3, last: null } })
    expect(textOf(paneView(tight, fakeE('terminal'), { cols: 100, tab: 'night' }))).toContain('would cost about 80 points   does not fit')
    const roomy = fullVm({ budget: budgetFor({ weekly: 30 }), runCost: { unitPoints: 2, samples: 3, last: null } })
    const roomyTree = paneView(roomy, fakeE('terminal'), { cols: 100, tab: 'night' })
    expect(textOf(roomyTree)).toContain('would cost about 32 points   fits')
    expect(all(roomyTree, 'Text').find(x => x.props.children === '   fits').props.color).toBe('success')
    expect(all(paneView(tight, fakeE('terminal'), { cols: 100, tab: 'night' }), 'Text').find(x => x.props.children === '   does not fit').props.color).toBe('warning')
    const red = fullVm({ budget: budgetFor({ weekly: 85 }), runCost: { unitPoints: 2, samples: 3, last: null } })
    expect(textOf(paneView(red, fakeE('terminal'), { cols: 100, tab: 'night' }))).not.toContain('A full run')
  })
  test('robust: partial view models, odd text, every tab, both languages', () => {
    const odd = fullVm()
    odd.workers = [worker({ id: 'x', label: 'line one\nline two\tTab\u0007bell', status: 'running' }), worker({ id: 'y', label: '', status: 'done' })]
    odd.decisions = [{ at: NOW, kind: 'question', text: 'a\r\nb', pending: true }, { at: NOW, kind: 'brandNew', text: 'c', pending: true }]
    odd.prs = [{ number: 7, title: 'x\ny', state: 'open', checks: 'weird', url: 'http://not-https', draft: false }]
    const bare = { lang: 'en', now: NOW, budget: { color: 'unknown' } }
    const emptyish = { budget: undefined }
    for (const vm of [odd, bare, emptyish, quietVm(), fullVm()]) {
      for (const lang of ['en', 'it']) {
        for (const surface of ['terminal', 'desktop']) {
          const E = fakeE(surface)
          const v = { ...vm, lang }
          bandView(v, E, { cols: 100, surface })
          expect(cardView(v, E, { cols: 80, surface })).toBeDefined()
          for (const tab of TABS) paneView(v, E, { cols: 90, surface, tab })
          expect(summaryText(v).split('\n').length).toBeLessThanOrEqual(10)
          expect(budgetLine(v)).toStartWith('coordinator-lens budget: ')
        }
      }
    }
    const lines = linesOf(paneView(odd, fakeE('terminal'), { cols: 90, tab: 'workers' }))
    expect(lines.join('\n')).toContain('line one line two Tab bell')
    // several decisions waiting: the first after the count, the rest aligned under it, then '+n more'
    const many = fullVm({ decisions: ['a', 'b', 'c', 'd', 'e'].map(k => ({ at: NOW, kind: 'question', text: 'question ' + k, pending: true })) })
    const overview = linesOf(paneView(many, fakeE('terminal'), { cols: 100, tab: 'overview' }))
    const at = overview.findIndex(l => l.startsWith('DECISIONS   5 waiting: question a'))
    expect(at).toBeGreaterThan(-1)
    expect(overview.slice(at, at + 4).map(l => l.slice(12))).toEqual(['5 waiting: question a', '           question b', '           question c', '           +2 more'])
  })
})

// ---------- texts for the model ----------

describe('summaryText', () => {
  test('at most 10 lines, English, even for an Italian session', () => {
    const vm = { ...fullVm({ night: nightOn() }), lang: 'it' }
    const text = summaryText(vm)
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(10)
    expect(lines).toHaveLength(10)
    expect(lines[0]).toMatch(/^budget: green, margin -\d+, weekly 17% \(pace \d+\), 5h 0%, profile Max 20x$/)
    expect(lines[1]).toBe('workers: 3 running (deep-review wf 7/16, review: auth agent, fix-ci: flaky timeout cloud stalled), 3 done, 1 failed, 1 denied')
    expect(text).toContain('prs: #42 open green, #43 open red, #41 merged')
    expect(text).toContain('merge: #42 2/7 steps, next merged')
    expect(text).toContain('round: 2/5 checks, next duplicates')
    expect(text).toContain('flow: done grill, spec; now tickets')
    expect(text).toContain('decisions: 1 waiting: "Merge #42 now or wait for the diff review?"')
    expect(text).toContain('night: on, since 3h, next wake in 12m, 4.2 weekly points spent')
    expect(text).toContain('run cost: 0.22 weekly points per Sonnet-sized agent (5 samples), last deep-review 2 points')
    expect(text).toContain('warnings: gh issue create without --milestone')
    expect(text).not.toMatch(/verde|sett |ritmo|attiv/)
    // the person reads this row as it is when no card is drawn: no middle dot in it
    expect(text).not.toContain('·')
    for (const l of lines) expect(Array.from(l).length).toBeLessThanOrEqual(240)
  })
  test('a quiet session is short and still tells what is not happening', () => {
    expect(summaryText(quietVm()).split('\n')).toEqual([
      'budget: unknown, profile Max 20x',
      'workers: none',
      'merge: none in progress',
      'round: not started',
      'decisions: none waiting',
      'night: off',
      'run cost: no sample yet',
    ])
  })
  test('labels with new lines cannot add lines', () => {
    const vm = fullVm()
    vm.workers = [worker({ id: 'z', kind: 'workflow', label: 'a\nb\nc\nd', agents: { total: 1, sonnet: 1, opus: 0, fable: 0, other: 0 } })]
    vm.decisions = [{ at: NOW, kind: 'question', text: 'x\ny\nz', pending: true }]
    const lines = summaryText(vm).split('\n')
    expect(lines.length).toBeLessThanOrEqual(10)
    expect(lines[1]).toBe('workers: 1 running (a b c d wf 1/16)')
  })
})

describe('budgetLine', () => {
  test('green line has the documented shape', () => {
    const line = budgetLine(fullVm())
    expect(line).toMatch(
      /^coordinator-lens budget: green \(margin -\d+\) · profile Max 20x: 16 agents\/run, 3 cloud sessions · weekly 17% \(pace \d+\) · 5h 0% · weekly reset banked until 2026-10-22 · Fable window not readable$/,
    )
    expect(line).not.toContain('\n')
  })
  test('without a banked reset the line matches the example', () => {
    const vm = fullVm({ budget: budgetFor({ plan: 'Claude plan: Max 20x · reserve 10%' }) })
    expect(budgetLine(vm)).toBe(
      'coordinator-lens budget: green (margin ' + (vm.budget.margin > 0 ? '+' : '') + Math.round(vm.budget.margin) + ') · profile Max 20x: 16 agents/run, 3 cloud sessions · weekly 17% (pace ' + Math.round(vm.budget.pace) + ') · 5h 0% · Fable window not readable',
    )
  })
  test('yellow steps the profile down, red launches nothing, unknown says why', () => {
    expect(budgetLine(fullVm({ budget: budgetFor({ weekly: 45 }) }))).toMatch(/budget: yellow \(margin \+\d+\) · profile Max 5x: 8 agents\/run, 1 cloud session · weekly 45%/)
    expect(budgetLine(fullVm({ budget: budgetFor({ weekly: 60 }) }))).toMatch(/budget: red \(margin \+\d+\) · profile Red: no new launches · weekly 60%/)
    expect(budgetLine(fullVm({ budget: budgetFor({ weekly: 95 }) }))).toMatch(/budget: red \(over reserve, margin \+\d+\)/)
    const unknown = budgetLine(fullVm({ budget: budgetFor({ weekly: null, five: null }) }))
    expect(unknown).toMatch(/^coordinator-lens budget: unknown \(no reading\) · profile Max 20x: 16 agents\/run, 3 cloud sessions · weekly not readable · 5h not readable/)
  })
  test('5-hour pause names the reset time in UTC', () => {
    const line = budgetLine(fullVm({ budget: budgetFor({ five: 93 }) }))
    expect(line).toContain('5h 93% (paused, resets 16:10 UTC)')
  })
  test('in flight points show in the weekly part', () => {
    expect(budgetLine(fullVm({ budget: budgetFor({ inFlight: 3 }) }))).toMatch(/weekly 17% \(pace \d+, in flight \+3\)/)
  })
  test('stable between calls and between seconds', () => {
    const vm = fullVm()
    expect(budgetLine(vm)).toBe(budgetLine({ ...vm, now: vm.now + 1000 }))
  })
})

describe('paceSvg', () => {
  test('a small bar: used, pace marker, reserve line, hex colors only here', () => {
    const svg = paceSvg(fullVm(), 150, 12)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 150 12" width="150" height="12"/)
    expect(svg).toMatch(/<\/svg>$/)
    expect(svg).toContain('#2f9e63')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('<title>Week 17%, pace ' + PACE + '%, Reserve 10%</title>')
    expect(svg).not.toMatch(/<script|onload|onclick|href=/i)
    expect(svg.length).toBeLessThan(4000)
    const x = Number(/<rect x="0" y="0" width="([\d.]+)" height="12" fill="#2f9e63"/.exec(svg)[1])
    expect(Math.abs(x - 25.5)).toBeLessThan(0.1)
  })
  test('colors follow the pace color and an empty reading still draws a track', () => {
    expect(paceSvg(fullVm({ budget: budgetFor({ weekly: 45 }) }), 100, 10)).toContain('#d9a31c')
    expect(paceSvg(fullVm({ budget: budgetFor({ weekly: 60 }) }), 100, 10)).toContain('#d94b4b')
    const none = paceSvg(quietVm(), 100, 10)
    expect(none).toContain('no reading yet')
    expect(none).not.toContain('clip-path')
  })
  test('sizes are clamped and the title is escaped', () => {
    expect(paceSvg(fullVm(), 5, 1)).toContain('viewBox="0 0 40 6"')
    expect(paceSvg(fullVm(), undefined, undefined)).toContain('viewBox="0 0 200 12"')
    const vm = fullVm()
    vm.lang = 'it'
    expect(paceSvg(vm, 100, 10)).toContain('<title>Settimana 17%, ritmo ' + PACE + '%, Riserva 10%</title>')
  })
  test('textBar: ━ filled in the pace color, ─ empty and dim, ╋ at the pace position', () => {
    const bar = textBar(fullVm(), 20)
    expect(Array.from(bar.text)).toHaveLength(20)
    const cells = Array.from(bar.text)
    const mark = Math.floor((fullVm().budget.pace / 100) * 20)
    expect(cells[mark]).toBe('╋')
    expect(cells.filter(c => c === '╋')).toHaveLength(1)
    expect(bar.text.slice(0, 3)).toBe('━━━')
    expect(bar.text).toBe('━━━─╋───────────────')
    expect(bar.segs.map(s => s.text).join('')).toBe(bar.text)
    expect(bar.segs[0]).toMatchObject({ text: '━━━', color: 'success' })
    expect(bar.segs.find(s => s.text === '╋')).toMatchObject({ bold: true })
    expect(bar.segs.filter(s => /^─+$/.test(s.text)).every(s => s.dim === true)).toBe(true)
    expect(bar.text).not.toMatch(/[█░▓│]/)
    // the color is the pace color: warning at yellow, error at red
    expect(textBar(fullVm({ budget: budgetFor({ weekly: 45 }) }), 20).segs[0].color).toBe('warning')
    expect(textBar(fullVm({ budget: budgetFor({ weekly: 60 }) }), 20).segs[0].color).toBe('error')
    const none = textBar(quietVm(), 10)
    expect(none.text).toBe('──────────')
    expect(none.segs).toEqual([{ text: '──────────', dim: true }])
  })
  test('textBar for the 5 hours: the same bar without a pace mark, warning while paused', () => {
    const half = textBar(fullVm({ budget: budgetFor({ five: 50 }) }), 10, 'five')
    expect(half.text).toBe('━━━━━─────')
    expect(half.text).not.toContain('╋')
    expect(half.segs[0]).toMatchObject({ text: '━━━━━', color: 'success' })
    expect(textBar(fullVm({ budget: budgetFor({ five: 92 }) }), 10, 'five').segs[0].color).toBe('warning')
    expect(textBar(fullVm({ budget: budgetFor({ five: 18 }) }), 27, 'five').text).toBe('━━━━━' + '─'.repeat(22))
    // no 5-hour reading: an empty track
    expect(textBar(fullVm({ budget: budgetFor({ five: null }) }), 8, 'five').text).toBe('────────')
    // the width is clamped
    expect(Array.from(textBar(fullVm(), 3).text)).toHaveLength(6)
    expect(Array.from(textBar(fullVm(), 500).text)).toHaveLength(60)
  })
})

// ---------- through the engine, with the real surface tables ----------

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 11 }, view: {} }
const PANE_PROPS = { title: 'Coordinator', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} }

for (const surface of ['terminal', 'desktop']) {
  describe('engine on ' + surface, () => {
    test('band draws in one line', async ($, on) => {
      on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        if (e.props.hasSurvey) return next(e)
        return bandView(fullVm(), $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface }) || next(e)
      })
      const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'AbovePrompt', props: BAND_PROPS })
      // each section is a dim label Text and a value Text
      expect(await ui.find({ type: 'Text', text: 'Working ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '3 (wf deep-review 7/16)' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Budget ' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'green' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /●| · / })).toBeUndefined()
      // the whole drawn band is the one line of the format, in one row
      const drawn = await ui.drawn()
      expect(drawn.type).toBe('Box')
      expect(drawn.props.flexDirection).toBe('row')
      const line = (await ui.findAll({ type: 'Text' })).map(x => x.text).join('')
      expect(line).toBe('Budget green    Week 17% (pace ' + PACE + '%)    5h 0%    Working 3 (wf deep-review 7/16)    Stalled 1    To decide 1')
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
      await ui.unmount()
    })

    test('card draws, with the Svg bar only on desktop', async ($, on) => {
      on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
        if (!e.props.command.endsWith('viewcard')) return next(e)
        return cardView(fullVm(), $.ui.resolve(e), { cols: 100, surface: e.surface }) || next(e)
      })
      const ui = await $.ui.mount({
        plugin: 'coordinator-lens', surface, component: 'CommandOutput',
        props: { command: 'viewcard', args: '', text: summaryText(fullVm()), isErrored: false },
      })
      expect(await ui.find({ type: 'Text', text: 'snapshot   /coord pane for the live panel' })).toBeDefined()
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'desktop' ? 1 : 0)
      await ui.unmount()
    })

    test('pane: the buttons reach the actions, and each tab draws', async ($, on) => {
      // Elements drawn by a hook of the test belong to the plugin named 'test'. The test cannot
      // invalidate for the plugin, so each tab is drawn by a new mount, as a redraw would.
      let tab = 'overview'
      let night = false
      const actions = {
        setTab: k => {
          tab = k
        },
        toggleNight: () => {
          night = !night
        },
      }
      on('ui.render', { component: 'Pane' }, async ($, e, next) => {
        if (e.requestId !== 'viewpane') return next(e)
        const vm = fullVm({ night: night ? nightOn() : { on: false, since: null, nextWakeAt: null, pointsSince: null } })
        return paneView(vm, $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface, tab, actions }) || next(e)
      })
      const draw = () => $.ui.mount({ plugin: 'test', surface, component: 'Pane', requestId: 'viewpane', props: PANE_PROPS })
      let ui = await draw()
      expect(await ui.find({ type: 'Text', text: /deep-review/ })).toBeDefined()
      expect((await ui.find({ key: 'tab-overview' })).props.variant).toBe('primary')
      for (const [key, check] of [
        ['workers', () => ui.find({ type: 'Text', text: /name\s+kind/ })],
        ['merge', () => ui.find({ type: 'Text', text: 'head pinned ?' })],
        ['flow', () => ui.find({ type: 'Text', text: /PRD\.md/ })],
        ['night', () => ui.find({ key: 'night-toggle' })],
      ]) {
        await ui.press({ key: 'tab-' + key })
        expect(tab).toBe(key)
        await ui.unmount()
        ui = await draw()
        expect((await ui.find({ key: 'tab-' + key })).props.variant).toBe('primary')
        expect(await check(), 'tab ' + key).toBeDefined()
      }
      expect((await ui.find({ key: 'night-toggle' })).props.label).toBe('Turn night on')
      await ui.press({ key: 'night-toggle' })
      expect(night).toBe(true)
      await ui.unmount()
      ui = await draw()
      expect((await ui.find({ key: 'night-toggle' })).props.label).toBe('Turn night off')
      // the pane has no close Button of ours: the engine's close mark and Esc are the way out
      expect(await ui.find({ key: 'close' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Button' })).filter(b => !b.props.key.startsWith('tab-'))).toHaveLength(1)
      await ui.unmount()
    })
  })
}

test('engine: a narrow pane and an Italian session still draw on every surface that has a Pane', async ($, on) => {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== 'viewpane') return next(e)
    return paneView({ ...fullVm(), lang: 'it' }, $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface, tab: 'workers' }) || next(e)
  })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile']) {
    const ui = await $.ui.mount({ plugin: 'coordinator-lens', surface, component: 'Pane', requestId: 'viewpane', props: { ...PANE_PROPS, bodyColumns: 48 } })
    expect(await ui.find({ type: 'Text', text: /deep-review/ })).toBeDefined()
    expect(await ui.find({ key: 'tab-workers' })).toBeDefined()
    await ui.unmount()
  }
})

describe('Solo profile', () => {
  test('a Pro plan stepped down to Solo still allows one agent, unlike red', () => {
    const now = Date.parse('2026-10-07T12:00:00Z')
    const plan = parsePlanLine('Claude plan: Pro · reserve 25%')
    const rl = [
      { kind: 'seven_day', percentUsed: 35, resetsAt: '2026-10-13T00:00:00Z' },
      { kind: 'five_hour', percentUsed: 11, resetsAt: '2026-10-07T15:00:00Z' },
    ]
    const b = computeBudget({ rateLimits: rl, now, plan })
    expect(b.color).toBe('yellow')
    expect(b.profile.name).toBe('Solo')
    const vm = { lang: 'it', now, budget: { ...b, lastReadingAt: now }, workers: [], prs: [], merge: { pr: null, steps: [] }, round: { since: null, items: [] }, flow: { stages: [], side: [], current: null, artifacts: [], warnings: [] }, decisions: [], night: { on: false }, runCost: { unitPoints: null, samples: 0, last: null } }
    for (const cols of [60, 90, 140]) {
      const text = textOf(paneView(vm, fakeE('terminal'), { cols, surface: 'terminal', tab: 'overview', actions: { setTab() {}, toggleNight() {} } }))
      expect(text).toContain('Solo')
      expect(text).toContain('un agente al massimo')
      expect(text).not.toContain('nessun nuovo avvio')
    }
    expect(t('en', 'budget.profileSolo', { name: 'Solo' })).toBe('Solo   no workflows   one agent at most   no cloud sessions')
  })
})
