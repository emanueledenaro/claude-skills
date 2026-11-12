// Run: node --test release-watch/rw.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyDiff, classifyGit, applyState } from './rw.mjs'
import * as rw from './rw.mjs'

const diff = (file, pairs) =>
  `diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n` +
  pairs.map(([o, n]) => `@@ -1,1 +1,1 @@\n${o === null ? '' : `-${o}\n`}${n === null ? '' : `+${n}\n`}`).join('')
const verdict = (file, pairs) => classifyDiff(diff(file, pairs)).verdict
const MM = 'model-mix/SKILL.md'

test('FACT: version, date, price, ratio, model id, same-host url, quote on a source line', () => {
  assert.equal(verdict(MM, [['`haiku` is Haiku 5.5 from v2.1.293', '`haiku` is Haiku 5.6 from v2.1.301']]), 'FACT')
  assert.equal(verdict(MM, [['released 2026-10-07', 'released 2026-11-09']]), 'FACT')
  assert.equal(verdict(MM, [['Max ($100/month)', 'Max ($120/month)']]), 'FACT')
  assert.equal(verdict(MM, [['Fable 5.1 about 5× Sonnet', 'Fable 5.2 about 4× Sonnet']]), 'FACT')
  assert.equal(verdict(MM, [['use `claude-haiku-5-5` here', 'use `claude-haiku-5-6` here']]), 'FACT')
  assert.equal(verdict('release-watch/sources.md', [['see https://code.claude.com/docs/en/x', 'see https://code.claude.com/docs/en/y']]), 'FACT')
  assert.equal(verdict('release-watch/sources.md', [['"old words" https://a.example/x', '"new words" https://a.example/x']]), 'FACT')
})

test('RULE: a family swap, a role change, a threshold, an always/never flip', () => {
  assert.equal(verdict(MM, [['Sonnet 5.5 for implementation', 'Opus 5.5 for implementation']]), 'RULE')
  assert.equal(verdict(MM, [['| Implementing a ticket | Sonnet | high |', '| Implementing a ticket | Opus | high |']]), 'RULE')
  assert.equal(verdict(MM, [['| Ultra | 16 | 10% |', '| Ultra | 16 | 15% |']]), 'RULE')
  assert.equal(verdict(MM, [['Never pin Haiku 4.5', 'Always pin Haiku 4.5']]), 'RULE')
  assert.equal(verdict(MM, [['price steps up once a prompt passes 100K tokens', 'price steps up once a prompt passes 200K tokens']]), 'RULE')
  assert.equal(verdict(MM, [['Green, margin ≤ 10', 'Green, margin ≤ 15']]), 'RULE')
})

test('RULE: a rule word flips inside a quote of a source line', () => {
  assert.equal(verdict(MM, [['"Never merge without review" https://x.y/z', '"Always merge without review" https://x.y/z']]), 'RULE')
  assert.equal(verdict(MM, [['"merge only when green" https://x.y/z', '"merge unless red" https://x.y/z']]), 'RULE')
})

test('RULE: a unit, dollar or ratio number inside a rule or threshold sentence', () => {
  assert.equal(verdict(MM, [['Never wait more than 30 minutes', 'Never wait more than 120 minutes']]), 'RULE')
  assert.equal(verdict(MM, [['Stop when spend passes $50', 'Stop when spend passes $500']]), 'RULE')
  assert.equal(verdict(MM, [['Keep the cost under 2x Sonnet', 'Keep the cost under 10x Sonnet']]), 'RULE')
  assert.equal(verdict(MM, [['The weekly limit is 5× Pro', 'The weekly limit is 10× Pro']]), 'RULE')
})

test('RULE: a version going down, a url on another host', () => {
  assert.equal(verdict(MM, [['`haiku` is Haiku 5.5 here', '`haiku` is Haiku 4.5 here']]), 'RULE')
  assert.equal(verdict(MM, [['use claude-opus-5-5 here', 'use claude-opus-4-1-20250805 here']]), 'RULE')
  assert.equal(verdict(MM, [['from v2.1.293 on', 'from v2.1.200 on']]), 'RULE')
  assert.equal(verdict('release-watch/sources.md', [['see https://a.example/x', 'see https://b.example/x']]), 'RULE')
})

test('RULE: a quote edit without a source url, added or removed lines, other files', () => {
  assert.equal(verdict(MM, [['model: "sonnet"', 'model: "opus"']]), 'RULE')
  assert.equal(verdict(MM, [[null, 'a brand new sentence']]), 'RULE')
  assert.equal(verdict(MM, [['a sentence that goes away', null]]), 'RULE')
  assert.equal(verdict('mods/model-guard/index.js', [['const a = 1.1', 'const a = 1.2']]), 'RULE')
  assert.equal(verdict('release-watch/routine.md', [['version 2.1.293', 'version 2.1.294']]), 'RULE')
  assert.equal(verdict('release-watch/rw.mjs', [['// 2026-10-07', '// 2026-11-09']]), 'RULE')
})

test('a mixed diff is RULE and names the rule hunk', () => {
  const d = classifyDiff(diff('a.md', [['v2.1.1', 'v2.1.2']]) + diff('b.md', [['only X', 'never X']]))
  assert.equal(d.verdict, 'RULE')
  assert.equal(d.reasons.length, 1)
  assert.match(d.reasons[0], /^b\.md/)
})

// ---- review findings on PR #21 ----

const SRC = 'release-watch/sources.md'

test('finding 1: a GitHub owner or repo change, a quoted url, or any url change outside sources.md is RULE', () => {
  assert.equal(verdict(SRC, [['see https://github.com/mattpocock/skills', 'see https://github.com/evil/skills']]), 'RULE')
  assert.equal(verdict(SRC, [['see https://github.com/mattpocock/skills/blob/main/x', 'see https://github.com/mattpocock/skillz/blob/main/x']]), 'RULE')
  assert.equal(verdict(SRC, [['https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md', 'https://raw.githubusercontent.com/evil/claude-code/main/CHANGELOG.md']]), 'RULE')
  assert.equal(verdict(SRC, [['gh api https://api.github.com/repos/anthropics/claude-code/releases', 'gh api https://api.github.com/repos/evil/claude-code/releases']]), 'RULE')
  assert.equal(verdict(SRC, [['curl "https://github.com/mattpocock/skills/x"', 'curl "https://github.com/evil/skills/x"']]), 'RULE')
  assert.equal(verdict('README.md', [['git clone https://github.com/emanueledenaro/claude-skills.git', 'git clone https://github.com/evil/claude-skills.git']]), 'RULE')
  assert.equal(verdict(MM, [['read https://support.claude.com/en/articles/1-a', 'read https://support.claude.com/en/articles/2-b']]), 'RULE')
  // still a fact: a path change in sources.md that keeps the host and the GitHub owner/repo/branch
  assert.equal(verdict(SRC, [['https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md', 'https://raw.githubusercontent.com/anthropics/claude-code/main/docs/CHANGELOG.md']]), 'FACT')
})

test('finding 2: a duration outside sources.md is RULE, inside sources.md a fact', () => {
  assert.equal(verdict('coordinator-method/SKILL.md', [['a 30 minute fallback wakeup', 'a 1 minute fallback wakeup']]), 'RULE')
  assert.equal(verdict(MM, [['wait 30 minutes between wakes', 'wait 1 minutes between wakes']]), 'RULE')
  assert.equal(verdict(MM, [['the 5-hour window', 'the 50-hour window']]), 'RULE')
  assert.equal(verdict(SRC, [['turned off after 72 hours', 'turned off after 96 hours']]), 'FACT')
  assert.equal(verdict(SRC, [['scheduled runs 100 per hour per account', 'scheduled runs 50 per hour per account']]), 'FACT')
})

test('finding 6: a changed file with no hunk (binary, mode only) is RULE', () => {
  const bin = 'diff --git a/x.md b/x.md\nindex 1..2 100644\nBinary files a/x.md and b/x.md differ\n'
  assert.equal(classifyDiff(bin).verdict, 'RULE')
  assert.equal(classifyDiff(diff('a.md', [['v2.1.1', 'v2.1.2']]) + bin).verdict, 'RULE')
  const mode = 'diff --git a/x.md b/x.md\nold mode 100644\nnew mode 100755\n'
  assert.equal(classifyDiff(mode).verdict, 'RULE')
  const modeAndFact = 'diff --git a/x.md b/x.md\nold mode 100644\nnew mode 100755\nindex 1..2\n--- a/x.md\n+++ b/x.md\n@@ -1 +1 @@\n-v2.1.1\n+v2.1.2\n'
  assert.equal(classifyDiff(modeAndFact).verdict, 'RULE')
})

test('finding 4: only open PRs whose head is in this repo count as release-watch PRs', () => {
  const pulls = [
    { ref: 'chore/release-watch-2026-11-12', repo: 'owner/claude-skills' },
    { ref: 'chore/release-watch-x', repo: 'stranger/claude-skills' },
    { ref: 'chore/release-watch-y', repo: null },
    { ref: 'feat/other', repo: 'owner/claude-skills' },
  ]
  assert.deepEqual(rw.releaseWatchRefs(pulls, 'owner/claude-skills'), ['chore/release-watch-2026-11-12'])
  assert.deepEqual(rw.releaseWatchRefs(pulls, null), [])
})

test('finding 3: a PASS counts only from the routine\'s own login, for the exact head', () => {
  const head = 'a'.repeat(40)
  const own = { login: 'routine-bot', body: `PASS ${head}\nall good` }
  const other = { login: 'stranger', body: `PASS ${head}` }
  assert.equal(rw.hasPass([other], 'routine-bot', head), false)
  assert.equal(rw.hasPass([other, own], 'routine-bot', head), true)
  assert.equal(rw.hasPass([own], '', head), false)
  assert.equal(rw.hasPass([own], 'routine-bot', 'b'.repeat(40)), false)
  assert.equal(rw.hasPass([{ login: 'routine-bot', body: `ok\nPASS ${head}` }], 'routine-bot', head), false)
  assert.equal(rw.hasPass([{ login: 'routine-bot', body: `PASS ${head}` }], 'routine-bot', 'PASS'), false)
})

// ---- second review of PR #21 ----

const RAW = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md'
const BLOB = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'

test('r2 finding 1: a dot segment, percent, backslash or double slash in a path keeps the whole url', () => {
  for (const [from, to] of [
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main/../../../evil/repo/main/CHANGELOG.md'],
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main/%2e%2e/%2e%2e/%2e%2e/evil/repo/main/CHANGELOG.md'],
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main/..\\..\\..\\evil\\repo\\main\\CHANGELOG.md'],
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main/./CHANGELOG.md'],
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main//CHANGELOG.md'],
    [BLOB, 'https://github.com/anthropics/claude-code/blob/main/../../../evil/repo/blob/main/CHANGELOG.md'],
    [BLOB, 'https://github.com/anthropics/claude-code/blob/%2e%2e/%2e%2e/%2e%2e/evil/repo/blob/main/CHANGELOG.md'],
    [BLOB, 'https://github.com/anthropics/claude-code/blob/..\\..\\..\\evil\\repo\\blob\\main\\CHANGELOG.md'],
    [RAW, 'https://raw.githubusercontent.com/anthropics/claude-code/main/docs\\CHANGELOG.md'],
    [BLOB, 'https://github.com/anthropics/claude-code/blob/main/docs\\CHANGELOG.md'],
    ['https://code.claude.com/docs/en/routines', 'https://code.claude.com/docs/en/../../evil'],
  ]) assert.equal(verdict(SRC, [[`see ${from}`, `see ${to}`]]), 'RULE', to)
})

test('r2 finding 2: a path may move only on Anthropic and GitHub hosts, matched on a dot boundary', () => {
  assert.equal(verdict(SRC, [['curl -s https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags', 'curl -s https://registry.npmjs.org/-/package/@evil/claude-code/dist-tags']]), 'RULE')
  assert.equal(verdict(SRC, [['see https://evilanthropic.com/a', 'see https://evilanthropic.com/b']]), 'RULE')
  assert.equal(verdict(SRC, [['see https://anthropic.com.evil.io/a', 'see https://anthropic.com.evil.io/b']]), 'RULE')
  assert.equal(verdict(SRC, [['see https://user@claude.com/a', 'see https://user@claude.com/b']]), 'RULE')
  assert.equal(verdict(SRC, [['see https://evil.io?x.github.com/a/b/c/d', 'see https://evil.io?x.github.com/a/b/c/e']]), 'RULE')
  for (const host of ['claude.com', 'support.claude.com', 'claude.ai', 'anthropic.com', 'docs.anthropic.com']) {
    assert.equal(verdict(SRC, [[`see https://${host}/a`, `see https://${host}/b`]]), 'FACT', host)
  }
})

test('r2 finding 3: a scheme change is RULE', () => {
  assert.equal(verdict(SRC, [['see https://code.claude.com/docs/en/a', 'see http://code.claude.com/docs/en/a']]), 'RULE')
  assert.equal(verdict(MM, [['see https://code.claude.com/docs/en/a', 'see http://code.claude.com/docs/en/a']]), 'RULE')
})

test('r2 finding 4: a quote is masked only in sources.md', () => {
  assert.equal(verdict(MM, [['"wake every hour" https://code.claude.com/docs/en/a', '"wake every day" https://code.claude.com/docs/en/a']]), 'RULE')
  assert.equal(verdict(SRC, [['"wake every hour" https://code.claude.com/docs/en/a', '"wake every day" https://code.claude.com/docs/en/a']]), 'FACT')
})

test('r2 finding 5: the latest comment from the routine for the head decides, and a FAIL after a PASS is no pass', () => {
  const head = 'c'.repeat(40)
  const pass = { login: 'routine-bot', body: `PASS ${head}` }
  const fail = { login: 'routine-bot', body: `FAIL ${head}\nfinding` }
  assert.equal(rw.hasPass([pass, fail], 'routine-bot', head), false)
  assert.equal(rw.hasPass([fail, pass], 'routine-bot', head), true)
  assert.equal(rw.hasPass([pass, { login: 'stranger', body: `FAIL ${head}` }], 'routine-bot', head), true)
  assert.equal(rw.hasPass([{ id: 2, ...fail }, { id: 1, ...pass }], 'routine-bot', head), false)
})

// ---- third review of PR #21 ----

const GH = 'https://github.com/anthropics/claude-code'
const SHA = 'f'.repeat(40)

test('r3 finding 1: a GitHub ref change, or any GitHub url shape other than blob/tree on github.com and owner/repo/ref on raw, is RULE', () => {
  const rule = [
    ['blob ref', `${GH}/blob/main/mods/x.d.ts`, `${GH}/blob/${SHA}/mods/x.d.ts`],
    ['tree ref', `${GH}/tree/main/mods`, `${GH}/tree/${SHA}/mods`],
    ['raw form', `${GH}/raw/main/x.md`, `${GH}/raw/${SHA}/x.md`],
    ['commits', `${GH}/commits/main/x.md`, `${GH}/commits/${SHA}/x.md`],
    ['release tag', `${GH}/releases/tag/v2.1.1/x`, `${GH}/releases/tag/evil/x`],
    ['archive', `${GH}/archive/main/x.zip`, `${GH}/archive/${SHA}/x.zip`],
    ['compare', `${GH}/compare/main/x`, `${GH}/compare/main/y`],
    ['raw refs/heads', 'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/x.md', 'https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/evil/x.md'],
    ['api', 'https://api.github.com/repos/anthropics/claude-code/git/blobs/a', 'https://api.github.com/repos/anthropics/claude-code/git/blobs/b'],
    ['other github host', 'https://codeload.github.com/anthropics/claude-code/zip/main/a', 'https://codeload.github.com/anthropics/claude-code/zip/main/b'],
  ]
  for (const [name, from, to] of rule) assert.equal(verdict(SRC, [[`see ${from}`, `see ${to}`]]), 'RULE', name)
  assert.equal(verdict(SRC, [[`see ${GH}/blob/main/mods/types/a.d.ts`, `see ${GH}/blob/main/mods/types/b.d.ts`]]), 'FACT', 'blob path below the ref')
})

test('r3 finding 2: a url with a query is compared whole on every host', () => {
  const rule = [
    ['blob ?repo', `${GH}/blob/main/x.md`, `${GH}/blob/main/x.md?repo=evil`],
    ['anthropic query', 'https://code.claude.com/docs/en/a?v=1', 'https://code.claude.com/docs/en/a?v=2'],
    ['raw query', 'https://raw.githubusercontent.com/anthropics/claude-code/main/x.md?a=1', 'https://raw.githubusercontent.com/anthropics/claude-code/main/x.md?a=2'],
    ['api ?ref', 'https://api.github.com/repos/anthropics/claude-code/contents/x.md?ref=main', `https://api.github.com/repos/anthropics/claude-code/contents/x.md?ref=${SHA}`],
    ['query in the host part', 'https://code.claude.com?a', 'https://code.claude.com?b'],
  ]
  for (const [name, from, to] of rule) assert.equal(verdict(SRC, [[`see ${from}`, `see ${to}`]]), 'RULE', name)
})

// ---- the routine's documents stay in line with model-mix ----

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('finding 5: the routine has a budget gate after the probe, with an agent cap no wider than model-mix allows', () => {
  const routine = read('./routine.md')
  const gate = routine.indexOf('## Budget gate')
  assert.ok(gate > routine.indexOf('## Step 1') && gate < routine.indexOf('## Step 3'), 'budget gate sits between the probe and the first agent')
  const section = routine.slice(gate, routine.indexOf('\n## ', gate + 1))
  const cap = Number(section.match(/at most (\d+) Agent calls per run/)?.[1])
  const maxWidth = Number(read('../model-mix/SKILL.md').match(/^\| Max \| (\d+) \|/m)?.[1])
  assert.ok(cap > 0 && maxWidth > 0 && cap <= maxWidth, `cap ${cap} within model-mix Max width ${maxWidth}`)
  assert.match(section, /usage credits/)
  assert.match(section, /open nothing/i)
  assert.match(read('./SKILL.md'), /budget gate/i)
})

test('finding 7: verifiers follow model-mix (Opus for verify stages) unless the owner sets otherwise', () => {
  const verifyModel = read('../model-mix/SKILL.md').match(/\{ model: '(\w+)', effort: '\w+' \}` on verify and judge stages/)?.[1]
  assert.equal(verifyModel, 'opus')
  const apply = read('./apply.md')
  const line = apply.split('\n').find((l) => /^\s*- verifiers:/.test(l))
  assert.match(line, /Opus/)
  assert.match(line, /model-mix/)
  assert.match(line, /unless the owner sets otherwise/)
  assert.doesNotMatch(apply, /owner's call/)
  assert.doesNotMatch(read('./routine.md'), /verifiers? (use|at) Sonnet|Sonnet verifier/)
  assert.doesNotMatch(read('./SKILL.md'), /Sonnet verifier/)
})

test('a diff line that looks like a header inside a hunk is content', () => {
  const d = `diff --git a/a.md b/a.md\nindex 1..2 100644\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n--- old\n+++ new\n`
  assert.equal(classifyDiff(d).verdict, 'RULE')
})

// ---- state.json: judged by shape, using a real apply-state diff in a throwaway repo ----

const HEX = (c) => c.repeat(64)
function stateRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'rw-test-'))
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q', '-b', 'main')
  mkdirSync(join(cwd, 'release-watch'))
  const statePath = join(cwd, 'release-watch', 'state.json')
  const seed = { checkedAt: '2026-11-10T00:00:00Z', cli: '2.1.293', models: ['claude-opus-5-5'], modsTypes: HEX('a'), npmTags: { latest: '2.1.293', next: '2.1.293', stable: '2.1.285' }, pageHashes: { 'plan-max': HEX('b') }, upstreamSkills: {} }
  writeFileSync(statePath, JSON.stringify(seed, null, 2) + '\n')
  git('add', '-A'); git('commit', '-q', '-m', 'seed')
  git('switch', '-q', '-c', 'work')
  const observedPath = join(mkdtempSync(join(tmpdir(), 'rw-obs-')), 'observed.json')
  writeFileSync(observedPath, JSON.stringify({ cli: '2.1.322', cliProcessed: '2.1.322', npmTags: { latest: '2.1.322', next: '2.1.322', stable: '2.1.311' }, modelsIds: ['claude-fable-5-2', 'claude-opus-5-5'], modsTypes: HEX('c'), pageHashes: { 'plan-max': HEX('d'), 'models-overview': HEX('e') }, upstreamSkills: {} }))
  const commit = () => { git('add', '-A'); git('commit', '-q', '-m', 'work') }
  return { cwd, statePath, observedPath, commit, git }
}

test('FACT: the diff a real apply-state writes to state.json', () => {
  const r = stateRepo()
  applyState(['cli', 'models', 'limits'], r)
  r.commit()
  const c = classifyGit('main', 'HEAD', r.cwd)
  assert.deepEqual(c.reasons, [])
  assert.equal(c.verdict, 'FACT')
})

test('RULE: a state.json with an unknown key, a bad hash, or a cli that went down', () => {
  for (const mutate of [
    (s) => { s.surprise = 1 },
    (s) => { s.pageHashes['plan-max'] = 'not-a-hash' },
    (s) => { s.pageHashes['made-up-page'] = HEX('f') },
    (s) => { s.cli = '2.1.200' },
  ]) {
    const r = stateRepo()
    applyState(['cli'], r)
    const s = JSON.parse(execFileSync('cat', [r.statePath], { encoding: 'utf8' }))
    mutate(s)
    writeFileSync(r.statePath, JSON.stringify(s, null, 2) + '\n')
    r.commit()
    assert.equal(classifyGit('main', 'HEAD', r.cwd).verdict, 'RULE', JSON.stringify(mutate.toString()))
  }
})
