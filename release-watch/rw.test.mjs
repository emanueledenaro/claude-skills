// Run: node --test release-watch/rw.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDiff } from './rw.mjs'

const diff = (file, pairs) =>
  `diff --git a/${file} b/${file}\nindex 1..2 100644\n--- a/${file}\n+++ b/${file}\n` +
  pairs.map(([o, n]) => `@@ -1,1 +1,1 @@\n${o === null ? '' : `-${o}\n`}${n === null ? '' : `+${n}\n`}`).join('')
const verdict = (file, pairs) => classifyDiff(diff(file, pairs)).verdict

test('FACT: version, date, price, ratio, model id, url, quote on a source line', () => {
  assert.equal(verdict('model-mix/SKILL.md', [['`haiku` is Haiku 5.5 from v2.1.293', '`haiku` is Haiku 5.6 from v2.1.301']]), 'FACT')
  assert.equal(verdict('model-mix/SKILL.md', [['released 2026-10-07', 'released 2026-11-09']]), 'FACT')
  assert.equal(verdict('model-mix/SKILL.md', [['Max ($100/month)', 'Max ($120/month)']]), 'FACT')
  assert.equal(verdict('model-mix/SKILL.md', [['Fable 5.1 about 5× Sonnet', 'Fable 5.2 about 4× Sonnet']]), 'FACT')
  assert.equal(verdict('model-mix/SKILL.md', [['use `claude-haiku-5-5` here', 'use `claude-haiku-5-6` here']]), 'FACT')
  assert.equal(verdict('release-watch/sources.md', [['see https://a.example/x', 'see https://a.example/y']]), 'FACT')
  assert.equal(verdict('release-watch/sources.md', [['"old words" https://a.example/x', '"new words" https://a.example/x']]), 'FACT')
  assert.equal(verdict('release-watch/state.json', [['  "cli": "2.1.293",', '  "cli": "2.1.322",']]), 'FACT')
})

test('RULE: a family swap, a role change, a threshold, an always/never flip', () => {
  assert.equal(verdict('model-mix/SKILL.md', [['Sonnet 5.5 for implementation', 'Opus 5.5 for implementation']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['| Implementing a ticket | Sonnet | high |', '| Implementing a ticket | Opus | high |']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['| Ultra | 16 | 10% |', '| Ultra | 16 | 15% |']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['Never pin Haiku 4.5', 'Always pin Haiku 4.5']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['price steps up once a prompt passes 100K tokens', 'price steps up once a prompt passes 200K tokens']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['Green, margin ≤ 10', 'Green, margin ≤ 15']]), 'RULE')
})

test('RULE: a quote edit without a source url, added or removed lines, other files', () => {
  assert.equal(verdict('model-mix/SKILL.md', [['model: "sonnet"', 'model: "opus"']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [[null, 'a brand new sentence']]), 'RULE')
  assert.equal(verdict('model-mix/SKILL.md', [['a sentence that goes away', null]]), 'RULE')
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
