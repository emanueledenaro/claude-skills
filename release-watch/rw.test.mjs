// Run: node --test release-watch/rw.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyDiff, classifyGit, applyState } from './rw.mjs'

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
  assert.equal(verdict('release-watch/sources.md', [['see https://a.example/x', 'see https://a.example/y']]), 'FACT')
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
