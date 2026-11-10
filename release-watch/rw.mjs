#!/usr/bin/env node
// release-watch helper. No dependencies, Node 18 or later, no model calls.
//   node release-watch/rw.mjs probe [--local]   compare upstream with state.json, print JSON
//   node release-watch/rw.mjs classify <base> <head>   FACT or RULE for a git diff
//   node release-watch/rw.mjs apply-state <area>...    copy probed values into state.json
// Exit codes: probe 0 nothing to do, 10 something changed, 2 error. classify 0 FACT, 10 RULE, 2 error.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(HERE, 'state.json')
const OBSERVED = join(tmpdir(), 'release-watch-observed.json')
const sha = (s) => createHash('sha256').update(s).digest('hex')

// ---------- classify ----------

const STATE_FILE = 'release-watch/state.json'
// A changed file may be FACT only if it is prose or the state file.
const FACT_FILE = /(^|\/)[^/]+\.md$/
// The routine never rewrites its own instructions or tools: a change there is always a rule change.
const PROTECTED = /^release-watch\/(SKILL\.md|routine\.md|apply\.md|rw\.mjs|rw\.test\.mjs)$/

// A line that holds one of these words states a rule or a threshold, so on it only dates and URL hosts are
// masked: its numbers, quotes and words are compared as they are, and any change is a rule change.
const RULE_CONTEXT = /\b(always|never|only|must|at most|at least|unless|until|stop|budget|limit|reserve|cap|threshold|under|over|above|below|more than|less than|within|up to|maximum|minimum|exceed)\b/i

const URL_RE = /https?:\/\/([^/\s)>\]"'`]+)[^\s)>\]"'`]*/g
const DATE = [/\b\d{4}-\d{2}-\d{2}\b/g, '§D']
// Each token class becomes a placeholder; the family name of a model stays visible, so swapping Haiku
// for Sonnet is never hidden, and a URL keeps its host. Anything not listed is not a fact token.
const FACT_MASKS = [
  DATE,
  [/claude-(haiku|sonnet|opus|fable|mythos)-[0-9][0-9a-z-]*/gi, 'claude-$1-§V'],
  [/\b(Haiku|Sonnet|Opus|Fable|Mythos) \d+(\.\d+)*/g, '$1 §V'],
  [/\bv?\d+\.\d+(\.\d+)+\b/g, '§V'],
  [/\bv\d+\.\d+\b/g, '§V'],
  [/\$\d+(\.\d+)?/g, '$§N'],
  [/\b\d+(\.\d+)?\s?[×x](?=[\s,.;:)]|$)/g, '§N×'],
  [/\b1\/\d+\b/g, '1/§N'],
  [/\b\d+ (per hour|hours?|days?|minutes?)\b/g, '§N $1'],
  [/\b\d+-hour\b/g, '§N-hour'],
]
// On a line that carries a source URL, a short double-quoted passage is a quote of the source.
const QUOTE = /"[^"]{1,160}"/g

export function normalize(line) {
  const ruleLine = RULE_CONTEXT.test(line)
  let s = line
  if (!ruleLine && /https?:\/\//.test(s)) s = s.replace(QUOTE, '"§Q"')
  s = s.replace(URL_RE, 'https://$1/§P')
  for (const [re, to] of ruleLine ? [DATE] : FACT_MASKS) s = s.replace(re, to)
  return s.replace(/\s+/g, ' ').trim()
}

// Version-like tokens in order, as number lists, to catch a version going down.
const VERSION_RE = /claude-(?:haiku|sonnet|opus|fable|mythos)-(\d[\da-z-]*)|\b(?:Haiku|Sonnet|Opus|Fable|Mythos) (\d+(?:\.\d+)*)|\bv?(\d+\.\d+(?:\.\d+)+)\b|\bv(\d+\.\d+)\b/gi
export function versions(line) {
  return [...line.matchAll(VERSION_RE)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4]).split(/[.-]/).filter((p) => /^\d+$/.test(p)).map(Number))
}
const lower = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

const KNOWN_KEYS = ['checkedAt', 'cli', 'npmTags', 'models', 'modsTypes', 'pageHashes', 'upstreamSkills']
const HEX64 = /^[0-9a-f]{64}$/
const VER = /^\d+\.\d+\.\d+$/
// The state file is judged by its shape, not by its lines: every change to it is a fact if it is well formed.
export function checkState(headText, baseText) {
  const bad = []
  let h, b = null
  try { h = JSON.parse(headText) } catch { return ['state.json does not parse'] }
  if (baseText) try { b = JSON.parse(baseText) } catch { /* a broken base is replaced */ }
  for (const k of Object.keys(h)) if (!KNOWN_KEYS.includes(k)) bad.push(`unknown key ${k}`)
  if (h.checkedAt !== undefined && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(h.checkedAt)) bad.push('checkedAt')
  if (h.cli !== undefined && !VER.test(h.cli)) bad.push('cli')
  if (h.npmTags !== undefined && !(h.npmTags && Object.values(h.npmTags).every((v) => VER.test(v)))) bad.push('npmTags')
  if (h.models !== undefined && !(Array.isArray(h.models) && h.models.every((m) => /^claude-[a-z0-9-]+$/.test(m)))) bad.push('models')
  if (h.modsTypes !== undefined && !HEX64.test(h.modsTypes)) bad.push('modsTypes')
  const pageIds = PAGES.map((p) => p.id)
  for (const [k, v] of Object.entries(h.pageHashes ?? {})) if (!pageIds.includes(k) || !HEX64.test(v)) bad.push(`pageHashes.${k}`)
  for (const [k, v] of Object.entries(h.upstreamSkills ?? {})) if (!['.claude-plugin/plugin.json', 'CHANGELOG.md'].includes(k) || !HEX64.test(v)) bad.push(`upstreamSkills.${k}`)
  if (b?.cli && VER.test(h.cli ?? '') && lower(h.cli.split('.').map(Number), b.cli.split('.').map(Number))) bad.push('cli went down')
  return bad
}

// Returns { verdict: 'FACT'|'RULE', reasons: [...] } for a unified diff (git diff -U0 output).
// opts.state = { head, base }: the text of release-watch/state.json on both sides, for checkState.
export function classifyDiff(diff, opts = {}) {
  const reasons = []
  let file = null
  let removed = []
  let added = []
  let inHunk = false
  const flush = () => {
    if (!removed.length && !added.length) return
    if (file === STATE_FILE) { removed = []; added = []; return }
    const a = removed.map(normalize)
    const b = added.map(normalize)
    const same = a.length === b.length && a.every((x, i) => x === b[i])
    if (!same) reasons.push(`${file}: ${removed.length} removed, ${added.length} added, not a pure fact substitution: ${(added[0] ?? removed[0]).slice(0, 80)}`)
    else {
      removed.forEach((r, i) => {
        const v = versions(r), w = versions(added[i])
        if (v.some((x, j) => w[j] && lower(w[j], x))) reasons.push(`${file}: a version went down: ${added[i].slice(0, 80)}`)
      })
    }
    removed = []
    added = []
  }
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      flush(); inHunk = false; file = line.split(' b/')[1]
      if (file === STATE_FILE) {
        const bad = opts.state ? checkState(opts.state.head ?? '', opts.state.base) : ['state.json text not supplied']
        if (bad.length) reasons.push(`${file}: ${bad.join(', ')}`)
      } else if (PROTECTED.test(file)) reasons.push(`${file}: release-watch's own instructions or tools`)
      else if (!FACT_FILE.test(file)) reasons.push(`${file}: not a prose or state file`)
      continue
    }
    if (line.startsWith('@@')) { flush(); inHunk = true; continue }
    if (!inHunk) {
      if (/^(new file|deleted file|rename|similarity)/.test(line)) reasons.push(`${file}: file created, deleted or renamed`)
      continue
    }
    if (line.startsWith('-')) removed.push(line.slice(1))
    else if (line.startsWith('+')) added.push(line.slice(1))
  }
  flush()
  return { verdict: reasons.length ? 'RULE' : 'FACT', reasons }
}

// Diff two git revisions in a repository and classify it.
export function classifyGit(base, head, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  const show = (rev) => { try { return git('show', `${rev}:${STATE_FILE}`) } catch { return null } }
  const diff = git('diff', '-U0', '--no-color', '--no-renames', `${base}...${head}`)
  return classifyDiff(diff, { state: { head: show(head), base: show(git('merge-base', base, head).trim()) } })
}

// ---------- probe ----------

const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'release-watch' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}
const lines = (t, re) => t.split('\n').filter((l) => re.test(l))
const articleText = (html) => {
  const h = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
  const m = h.match(/<article[\s\S]*?<\/article>/)
  if (!m) throw new Error('no <article> found')
  return m[0].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

const DOCS = 'https://code.claude.com/docs/en'
const PLATFORM = 'https://platform.claude.com/docs/en/about-claude'
const SUPPORT = 'https://support.claude.com/en/articles'
// Each watched page is hashed on the slice a skill states a fact from, never the whole page when a slice exists.
const PAGES = [
  { id: 'models-overview', area: 'models', url: `${PLATFORM}/models/overview.md`, slice: (t) => [...(t.match(/\$\d+(\.\d+)?/g) ?? []), ...(t.match(/\b(\d+(\.\d+)?)% /g) ?? [])].join(' ') },
  { id: 'models-deprecations', area: 'models', url: `${PLATFORM}/model-deprecations.md`, slice: (t) => (t.match(/\d{4}-\d{2}-\d{2}/g) ?? []).join(' ') },
  { id: 'model-config', area: 'models', url: `${DOCS}/model-config.md`, slice: (t) => lines(t, /claude-(haiku|sonnet|opus|fable)|(haiku|sonnet|opus|fable).*v?\d+\.\d+\.\d+/i).join('\n') },
  { id: 'plan-max', area: 'limits', url: `${SUPPORT}/11049741-what-is-the-max-plan`, text: articleText },
  { id: 'plan-ultra', area: 'limits', url: `${SUPPORT}/17728952-what-is-the-ultra-plan`, text: articleText },
  { id: 'claude-code-on-plan', area: 'limits', url: `${SUPPORT}/11145838-use-claude-code-with-your-pro-or-max-plan`, text: articleText },
  { id: 'fable-on-plan', area: 'limits', url: `${SUPPORT}/15424964-claude-fable-models-on-your-plan`, text: articleText },
  { id: 'usage-credits', area: 'limits', url: `${SUPPORT}/12429409-manage-usage-credits`, text: articleText },
  { id: 'routines', area: 'limits', url: `${DOCS}/routines.md`, slice: (t) => lines(t, /per hour|72 hours|minimum|limit/i).join('\n') },
  ...['api', 'reference', 'events', 'interface', 'create', 'admin'].map((p) => ({ id: `mods-${p}`, area: 'mods', url: `${DOCS}/plugins/mods/${p}.md` })),
]
const RAW = (repo, path) => `https://raw.githubusercontent.com/${repo}/main/${path}`

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
const cmpVersion = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0 }

export async function probe({ local }) {
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
  const obs = { cli: null, npmTags: null, modelsIds: null, modsTypes: null, pageHashes: {}, upstreamSkills: {} }
  const notChecked = []
  const changed = []
  const baseline = []
  const tryStep = async (name, fn) => { try { await fn() } catch (e) { notChecked.push({ area: name, why: String(e.message ?? e) }) } }

  await tryStep('cli', async () => {
    obs.npmTags = JSON.parse(await get('https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags'))
    obs.cli = obs.npmTags.latest
    if (!state.cli) baseline.push('cli')
    else if (cmpVersion(obs.cli, state.cli) > 0) {
      const log = await get(RAW('anthropics/claude-code', 'CHANGELOG.md'))
      const parts = log.split(/^## /m).slice(1).map((s) => ({ v: s.split('\n')[0].trim(), body: s }))
      const between = parts.filter((p) => /^\d+\.\d+\.\d+$/.test(p.v) && cmpVersion(p.v, state.cli) > 0 && cmpVersion(p.v, obs.cli) <= 0)
      const re = /claude-(haiku|sonnet|opus|fable|mythos)|\b(Haiku|Sonnet|Opus|Fable|Mythos) \d|default model|\balias|retir|deprecat|\$\.(model|session|tool|mcp)|agent\.spawn|\bmods\b|--cloud|--ref|--on-branch|--effort|\beffort level|scheduled task|routine|\/schedule|\/usage|usage limit|rate limit|weekly limit|autoUpdatesChannel|promptCacheTtl|skillOverrides|CRLF|PowerShell|Windows:|Desktop app/i
      const hits = between.flatMap((p) => p.body.split('\n').filter((l) => re.test(l)).map((l) => `${p.v}: ${l.trim().slice(0, 200)}`))
      changed.push({ area: 'cli', old: state.cli, new: obs.cli, versions: between.length, relevant: hits.length, hits: hits.slice(0, 40) })
      obs.cliHits = hits
      if (!hits.length) changed.pop()
      obs.cliProcessed = obs.cli
    }
    if (state.npmTags && JSON.stringify(state.npmTags) !== JSON.stringify(obs.npmTags)) obs.npmTagsChanged = true
  })

  await tryStep('models', async () => {
    const ids = new Set()
    for (const p of PAGES.filter((x) => x.id.startsWith('models-'))) (await get(p.url)).match(/claude-(haiku|sonnet|opus|fable|mythos)-[0-9][0-9a-z-]*/g)?.forEach((i) => ids.add(i))
    obs.modelsIds = [...ids].sort()
    if (!state.models) baseline.push('models')
    else {
      const added = obs.modelsIds.filter((i) => !state.models.includes(i))
      const gone = state.models.filter((i) => !obs.modelsIds.includes(i))
      if (added.length || gone.length) changed.push({ area: 'models-ids', added, gone })
    }
  })

  await tryStep('mods-types', async () => {
    obs.modsTypes = sha(await get(RAW('anthropics/claude-code', 'mods/types/claude-code.d.ts')))
    if (!state.modsTypes) baseline.push('modsTypes')
    else if (state.modsTypes !== obs.modsTypes) changed.push({ area: 'mods-types', old: state.modsTypes.slice(0, 12), new: obs.modsTypes.slice(0, 12) })
  })

  for (const p of PAGES) {
    await tryStep(p.id, async () => {
      const raw = await get(p.url)
      const text = p.text ? p.text(raw) : p.slice ? p.slice(raw) : raw
      if (!text) throw new Error('slice came back empty')
      obs.pageHashes[p.id] = sha(text)
      const old = state.pageHashes?.[p.id]
      if (!old) baseline.push(p.id)
      else if (old !== obs.pageHashes[p.id]) changed.push({ area: p.area, page: p.id, url: p.url })
    })
  }

  await tryStep('upstream-skills', async () => {
    for (const f of ['.claude-plugin/plugin.json', 'CHANGELOG.md']) obs.upstreamSkills[f] = sha(await get(RAW('mattpocock/skills', f)))
    for (const [f, h] of Object.entries(obs.upstreamSkills)) {
      const old = state.upstreamSkills?.[f]
      if (!old) baseline.push(`upstream:${f}`)
      else if (old !== h) changed.push({ area: 'upstream-skills', file: f })
    }
  })

  if (local) {
    obs.localCli = sh('claude', ['--version'])?.split(' ')[0] ?? null
    if (!obs.localCli) notChecked.push({ area: 'local-cli', why: 'claude not on PATH' })
  } else {
    notChecked.push({ area: 'local', why: 'cloud run: installed CLI, Desktop bundle and installed skill copies are not visible' })
  }

  // A change already held by an OPEN release-watch PR is covered: do not open a second one.
  // Branches alone are not enough: a closed, unmerged branch stays on the remote and must not hide a change.
  const covered = []
  const origin = sh('git', ['remote', 'get-url', 'origin'])
  const repo = origin?.replace(/\.git$/, '').match(/([^/:]+\/[^/]+)$/)?.[1]
  const refs = repo ? sh('gh', ['api', `repos/${repo}/pulls?state=open&per_page=100`, '--jq', '.[].head.ref']) : null
  if (refs === null) notChecked.push({ area: 'covered-by-open-pr', why: 'could not list open PRs (gh api failed)' })
  else {
    for (const ref of refs.split('\n').filter((r) => r.startsWith('chore/release-watch-'))) {
      const fetched = sh('git', ['fetch', '-q', 'origin', `${ref}:refs/remotes/rw-check/${ref}`])
      const txt = fetched === null ? null : sh('git', ['show', `refs/remotes/rw-check/${ref}:release-watch/state.json`])
      if (!txt) { notChecked.push({ area: 'covered-by-open-pr', why: `could not read state.json of open PR branch ${ref}` }); continue }
      const s = JSON.parse(txt)
      covered.push({ ref, cli: s.cli, models: s.models, modsTypes: s.modsTypes, pageHashes: s.pageHashes, upstreamSkills: s.upstreamSkills })
    }
  }
  const isCovered = (c) => covered.some((s) => {
    if (c.area === 'cli') return s.cli === c.new
    if (c.area === 'models-ids') return JSON.stringify(s.models) === JSON.stringify(obs.modelsIds)
    if (c.area === 'mods-types') return s.modsTypes === obs.modsTypes
    if (c.page) return s.pageHashes?.[c.page] === obs.pageHashes[c.page]
    if (c.file) return s.upstreamSkills?.[c.file] === obs.upstreamSkills[c.file]
    return false
  })
  const open = changed.filter((c) => !isCovered(c))
  const result = { checkedAt: new Date().toISOString(), mode: local ? 'local' : 'cloud', changed: open, coveredByOpenPr: changed.length - open.length, baseline, notChecked, skippedIrrelevantCli: obs.cli && state.cli && cmpVersion(obs.cli, state.cli) > 0 && !changed.some((c) => c.area === 'cli') }
  writeFileSync(OBSERVED, JSON.stringify(obs, null, 2))
  result.observedFile = OBSERVED
  return result
}

// ---------- state ----------

const AREAS = {
  cli: (s, o) => { if (o.cli) { s.cli = o.cliProcessed ?? s.cli ?? o.cli; s.npmTags = o.npmTags } },
  models: (s, o) => { if (o.modelsIds) s.models = o.modelsIds; for (const k of Object.keys(o.pageHashes)) if (k.startsWith('models-') || k === 'model-config') (s.pageHashes ??= {})[k] = o.pageHashes[k] },
  limits: (s, o) => { for (const k of ['plan-max', 'plan-ultra', 'claude-code-on-plan', 'fable-on-plan', 'usage-credits', 'routines']) if (o.pageHashes[k]) (s.pageHashes ??= {})[k] = o.pageHashes[k] },
  mods: (s, o) => { if (o.modsTypes) s.modsTypes = o.modsTypes; for (const k of Object.keys(o.pageHashes)) if (k.startsWith('mods-')) (s.pageHashes ??= {})[k] = o.pageHashes[k] },
  upstream: (s, o) => { if (Object.keys(o.upstreamSkills).length) s.upstreamSkills = o.upstreamSkills },
}
const sortDeep = (v) => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v

export function applyState(areas, { statePath = STATE, observedPath = OBSERVED } = {}) {
  if (!existsSync(observedPath)) throw new Error('run probe first')
  const obs = JSON.parse(readFileSync(observedPath, 'utf8'))
  const s = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
  for (const a of areas) { if (!AREAS[a]) throw new Error(`unknown area ${a}`); AREAS[a](s, obs) }
  s.checkedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  writeFileSync(statePath, JSON.stringify(sortDeep(s), null, 2) + '\n')
}

// ---------- cli ----------

const [cmd, ...rest] = process.argv.slice(2)
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (cmd === 'probe') {
      const r = await probe({ local: rest.includes('--local') })
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.changed.length || r.baseline.length ? 10 : 0)
    } else if (cmd === 'classify') {
      const [base, head] = rest
      const r = classifyGit(base, head)
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.verdict === 'FACT' ? 0 : 10)
    } else if (cmd === 'apply-state') {
      applyState(rest)
    } else {
      console.error('usage: rw.mjs probe [--local] | classify <base> <head> | apply-state <cli|models|limits|mods|upstream>...')
      process.exit(2)
    }
  } catch (e) {
    console.error(String(e.message ?? e))
    process.exit(2)
  }
}
