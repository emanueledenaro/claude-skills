# Workflow for verified research

Schemas, a minimal script and prompt skeletons for `SKILL.md`. Script rules (plain JavaScript, `meta` as a pure literal, no `Date.now()`, no `Math.random()`, pass today's date in `args`) are in `workflow-authoring`. Model, effort and width per stage are `model-mix`'s: the values below are the table's rows, not a new table.

## Claim line

The notation for notes and for the report. One claim per line:

```
- [c3|confirmed|max5x] <claim, one fact> <source URL ; page date ; read date>
- [c4|refuted|pro] <wrong claim> => CORR: <corrected fact> <source URL ; date>
- [c5|unverified|all] <claim> => missing: <what is needed> | check: <command or page>
```

`scope` is the plan, platform or version the claim holds for. Verifier extras go under `MISSED:` (facts found, each with a source) and `OPEN:` (questions nobody answered).

## Schemas

```js
const CLAIMS = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    claims: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },          // c1, c2 ... unique inside the area
      claim: { type: 'string' },       // one atomic fact
      scope: { type: 'string' },       // plan, platform, version
      source: { type: 'string' },      // URL, or "local: <command>"
      sourceDate: { type: 'string' },  // page's own date, or "undated"
      quote: { type: 'string' },       // under 15 words
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      kind: { type: 'string', enum: ['security', 'money', 'consent', 'other'] },  // who can read what, what costs credits, what needs a yes
    }, required: ['id', 'claim', 'scope', 'source', 'sourceDate', 'confidence', 'kind'] } },
    unreadSources: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'claims', 'open'],
}

const VERDICTS = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    verdicts: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['confirmed', 'refuted', 'unverified'] },
      correction: { type: 'string' },  // refuted: the right fact
      evidence: { type: 'string' },    // source opened, date, quote under 15 words
      missing: { type: 'string' },     // unverified: what would settle it
    }, required: ['id', 'status', 'evidence'] } },
    missed: { type: 'array', items: { type: 'string' } },  // each with a source
    open: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'verdicts', 'missed', 'open'],
}

const GAPS = {
  type: 'object',
  properties: {
    gaps: { type: 'array', items: { type: 'object', properties: {
      gap: { type: 'string' },
      importance: { type: 'string', enum: ['high', 'medium', 'low'] },
      settled: { type: 'boolean' },
      answer: { type: 'string' },      // with source or local check
    }, required: ['gap', 'importance', 'settled'] } },
  },
  required: ['gaps'],
}
```

## Skeleton

`args`: `{ goal, today, perArea, areas: [{ name, question, sources: [] }] }`. The areas array is the list you scouted and scoped inline, already merged to the profile's width (one reader per area, its verifiers, plus the critic). `perArea` is `true` below Max 20x: one verifier per area with all its claims. On Max 20x it is `false`: one verifier per small group of claims that cite the same source (`model-mix`, `smart-ultracode` section 4). On every profile a claim of kind security, money or consent gets its own verifier.

```js
export const meta = {
  name: 'verified-research',
  description: 'Read, verify and critique claims per research area',
  phases: [
    { title: 'Read and verify', detail: 'Sonnet reader then Opus verifier per area' },
    { title: 'Critic', detail: 'Opus completeness critic' },
  ],
}

const { goal, today, perArea, areas } = args

const readerPrompt = (a) => `Today is ${today}. Goal: ${goal}
Area: ${a.name}. Question: ${a.question}. Start from: ${a.sources.join(', ')}.
Return atomic claims only, one fact each. Each needs a source you opened, the source's own date, a quote under 15 words, a confidence and a kind (security, money, consent or other). Official sources first; third-party pages are low confidence. Never use memory for prices, limits, versions, flags or APIs. List what you looked for and could not find under "open".`

const verifierPrompt = (a, claims) => `Today is ${today}. You did not write these claims. For each one open the cited source yourself (or rerun the local check) and try to refute it. confirmed: the source says it, in scope and current. refuted: give the corrected fact and its evidence. unverified: the source cannot be opened or does not say it; say what would settle it. Then add facts you found that the claims missed, with sources.
Area: ${a.name}.
Claims: ${JSON.stringify(claims)}`

const isOwn = (k) => ['security', 'money', 'consent'].includes(k.kind)
const splitClaims = (claims) => {
  const own = claims.filter(isOwn).map(k => [k])
  const rest = claims.filter(k => !isOwn(k))
  if (perArea) return rest.length ? [...own, rest] : own
  const bySource = {}
  rest.forEach(k => { (bySource[k.source] = bySource[k.source] || []).push(k) })
  return [...own, ...Object.values(bySource)]
}

// Stage 2 merges the reader's output with the verdicts: pipeline() returns only the last stage's result.
const verifyArea = async (c, a) => {
  if (!c) return null
  const groups = splitClaims(c.claims)
  const rs = (await parallel(groups.map((g, i) => () =>
    agent(verifierPrompt(a, g), { label: `verify ${a.name} ${i + 1}/${groups.length}`, phase: 'Read and verify', schema: VERDICTS, model: 'opus', effort: 'high' })))).filter(Boolean)
  if (!rs.length) return null
  const verdicts = rs.flatMap(v => v.verdicts)
  const seen = new Set(verdicts.map(v => v.id))
  return {
    area: a.name, claims: c.claims, unreadSources: c.unreadSources || [], verdicts,
    unchecked: c.claims.filter(k => !seen.has(k.id)).map(k => k.id),  // a verifier died: unverified
    missed: rs.flatMap(v => v.missed || []), open: [...(c.open || []), ...rs.flatMap(v => v.open || [])],
  }
}

phase('Read and verify')
const verified = (await pipeline(
  areas,
  (a) => agent(readerPrompt(a), { label: 'read ' + a.name, phase: 'Read and verify', schema: CLAIMS, model: 'sonnet', effort: 'medium' }),
  verifyArea,
)).filter(Boolean)
log(`${verified.length}/${areas.length} areas verified`)

phase('Critic')
const gaps = await agent(`Today is ${today}. Goal: ${goal}
Areas: ${areas.map(a => a.name).join(', ')}.
Verified results (claims, verdicts and open questions per area; join verdicts to claims by id; unchecked ids count as unverified): ${JSON.stringify(verified)}
Name what the goal needs and no claim covers, what stayed unverified, and what contradicts. Rank the gaps. Settle the top ones yourself with an official source or a local check, and mark each settled or not.`,
  { label: 'critic', phase: 'Critic', schema: GAPS, model: 'opus', effort: 'high' })

return { verified, gaps, droppedAreas: areas.length - verified.length }
```

Notes on the skeleton:

- Use `pipeline` so a fast area's verifier starts without waiting for the slowest reader. The critic is the one barrier, because it needs every area.
- A dead reader drops its area (`null`), and `droppedAreas` makes the drop visible. A dead verifier leaves its claims in `unchecked`; if all of an area's verifiers die the area drops. Put both under "not covered" or "unverified" in the answer.
- Max 5x is the `perArea: true` shape. On Pro (`model-mix`): verifier and critic at `effort: 'medium'`, one final verify stage, workflow only when the person asks.
- Add `agentType`, tools and working directory only if all agents of a stage share them: the cache is shared only between identical settings.
- Rerun a failed run with `resumeFromRunId`: unchanged prefixes come from cache.
- Read the whole result before writing the answer. Each item holds the reader's `claims` plus the `verdicts`: join them by `id` to get claim, scope, source and date next to the status. A reader's claim is a lead; only a verifier's `confirmed` makes it a fact.

## Report footer

```
fleet: 4 readers (Sonnet medium) + 4 verifiers (Opus high) + 1 critic (Opus high)
weekly points: <after> - <before> = N (five-hour: M)
facts read on: <today>
not covered: <dropped areas, unreadable sources>
```
