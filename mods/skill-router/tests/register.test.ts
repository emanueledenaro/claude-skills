import { describe, expect, test, tier } from 'claude-code/testing'

tier('user')

// Every routed skill installed; some carry a plugin prefix, as plugin skills do in the command list.
const ALL = [
  'compact', 'clear', 'model-mix', 'smart-ultracode', 'coordinator-method', 'smart-mods',
  'skills:overnight', 'skills:merge-gate', 'skills:cloud-worker', 'skills:mod-ui', 'skills:matt-bridge',
  'roadmap-tracker', 'context-hygiene', 'verified-research', 'release-watch', 'skill-audit', 'windows-ops',
  'grill-me', 'grill-with-docs', 'to-prd', 'to-issues', 'tdd', 'triage', 'diagnose', 'handoff', 'prototype',
  'improve-codebase-architecture', 'zoom-out', 'schedule', 'loop',
]
const without = (...names: string[]) => ALL.filter(n => !names.some(x => n === x || n.endsWith(':' + x)))

type World = {
  logs: { text: string; to: string }[]
  calls: any[]
  submits: any[]
  existing: Set<string>
  fsCalls: string[]
  failSkills: Set<string>
  denySkills: Set<string>
  messages: any[]
  reads: number
}

const canon = (p: string) => p.replace(/\\/g, '/').toLowerCase()

// The world beneath the plugin: the command list, transcript lines, tools, prompts, the file system,
// and the main conversation's transcript ($.session.messages()).
function world(on: any, commands: string[] | 'fail' = ALL): World {
  const w: World = {
    logs: [], calls: [], submits: [], existing: new Set(), fsCalls: [], failSkills: new Set(), denySkills: new Set(),
    messages: [], reads: 0,
  }
  on('command.list', async () => {
    if (commands === 'fail') throw new Error('command list unavailable')
    return { value: commands.map(name => ({ name, description: '', source: 'user' })) }
  })
  on('session.messages', async () => { w.reads++; return { value: w.messages } })
  on('ui.log', async ($: any, e: any) => { w.logs.push({ text: e.text, to: e.to }); return { value: undefined } })
  on('tool.call', async ($: any, e: any) => {
    w.calls.push(e)
    if (e.tool === 'Skill' && w.failSkills.has(e.skill)) return { result: 'Unknown skill', isError: true }
    if (e.tool === 'Skill' && w.denySkills.has(e.skill)) return { deny: 'refused by a hook beneath' }
    return { result: 'ran' }
  })
  on('prompt.submit', async ($: any, e: any) => {
    w.submits.push(e)
    return { text: e.text, ...(Array.isArray(e.context) ? { context: e.context } : {}), origin: e.origin }
  })
  on('fs.exists', async ($: any, e: any) => { w.fsCalls.push(e.path); return { value: w.existing.has(canon(e.path)) } })
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('skill.prompt', async ($: any, e: any) => ({ text: e.text }))
  on('classic.UserPromptExpansion', async () => ({}))
  on('classic.SessionStart', async () => ({}))
  return w
}

async function start($: any) {
  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
}

async function say($: any, text: string, origin: any = { kind: 'composer' }, context?: string[]) {
  return $.prompt.submit({ text, origin, wait: false, ...(context !== undefined ? { context } : {}) })
}

const last = (w: World) => w.submits[w.submits.length - 1]
const lineOf = (w: World) => {
  const c = last(w).context
  return Array.isArray(c) ? c[c.length - 1] : undefined
}

function isRefused(r: any): boolean {
  return !!(r && (typeof r.deny === 'string' || r.isError === true))
}

function denyText(r: any): string {
  return String((r && (r.deny ?? r.text)) || '')
}

async function load($: any, name: string, agentId?: string) {
  await $.tool.call({ tool: 'Skill', skill: name, ...(agentId ? { agentId } : {}) })
}

// A transcript row of the main conversation that loaded a skill with the Skill tool.
const skillUse = (skill: string, isError = false) => ({
  role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_' + skill, tool: 'Skill', input: { skill }, ...(isError ? { isError: true } : {}) }],
})

// A mod folder on disk: its manifest and hooks/.
function mod(w: World, root: string) {
  w.existing.add(canon(root + '\\.claude-plugin\\plugin.json'))
  w.existing.add(canon(root + '\\hooks'))
}

const MOD = 'C:\\repo\\mods\\demo'

describe('skill-router', () => {
  describe('suggestions', () => {
    test('a typed prompt gets one context line and a transcript line; the text is untouched', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'coordinator-method')
      const text = 'vado a dormire, mergia la PR 12 quando è verde'
      const r: any = await say($, text)
      expect(last(w).text).toBe(text)
      expect(r.text).toBe(text)
      expect(last(w).context).toEqual([
        'skill-router: skills relevant to this request, not loaded yet: overnight (going to sleep or away for hours), merge-gate (merging a PR). Load each with the Skill tool before acting.',
      ])
      expect(w.logs).toEqual([{ text: 'skill suggerite: overnight, merge-gate', to: 'transcript' }])
    })

    test('context already attached is kept', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'buonanotte', { kind: 'composer' }, ['earlier block'])
      expect(last(w).context[0]).toBe('earlier block')
      expect(last(w).context.length).toBe(2)
      expect(last(w).context[1]).toContain('overnight')
    })

    test('bridge and sdk prompts are the person\'s; notifications, plugins, schedules and peers are not', async ($, on) => {
      const w = world(on)
      await start($)
      for (const origin of [{ kind: 'task-notification' }, { kind: 'plugin', name: 'other' }, { kind: 'scheduled-trigger' }, { kind: 'peer' }, { kind: 'coordinator' }]) {
        await say($, 'vado a dormire', origin)
        expect(last(w).context).toBeUndefined()
      }
      expect(w.logs).toEqual([])
      await say($, 'vado a dormire', { kind: 'bridge' })
      expect(lineOf(w)).toContain('overnight')
      await say($, 'mergia la PR 3', { kind: 'sdk' })
      expect(lineOf(w)).toContain('merge-gate')
    })

    test('a skill is suggested once per 5 of the person\'s prompts', async ($, on) => {
      const w = world(on)
      await start($)
      const seen: boolean[] = []
      for (let i = 1; i <= 7; i++) {
        await say($, 'buonanotte')
        seen.push(Array.isArray(last(w).context))
        await say($, 'buonanotte', { kind: 'task-notification' }) // not counted
      }
      expect(seen).toEqual([true, false, false, false, false, false, true])
      expect(w.logs.length).toBe(2)
    })

    test('only installed skills are suggested', async ($, on) => {
      const w = world(on, without('merge-gate'))
      await start($)
      await say($, 'mergia la PR 12')
      expect(lineOf(w)).toContain('coordinator-method')
      expect(lineOf(w)).not.toContain('merge-gate')
    })

    test('with no command list, the table is used', async ($, on) => {
      const w = world(on, 'fail')
      await start($)
      await say($, 'mergia la PR 12')
      expect(lineOf(w)).toContain('merge-gate')
    })

    test('a command list with no skill in it is not trusted: the table is used', async ($, on) => {
      const w = world(on, ['compact', 'clear', 'help'])
      await start($)
      await say($, 'mergia la PR 12')
      expect(lineOf(w)).toContain('merge-gate')
    })

    test('nothing when every matching skill is loaded (Skill tool, slash command)', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'skills:coordinator-method')
      await load($, 'overnight')
      await $.classic.UserPromptExpansion({ expansion_type: 'slash_command', command_name: 'skills:merge-gate', command_args: '', prompt: '/merge-gate' })
      await say($, 'vado a dormire, mergia la PR 12')
      expect(last(w).context).toBeUndefined()
      expect(w.logs).toEqual([])
    })

    test('a Skill call that failed does not count as loaded', async ($, on) => {
      const w = world(on)
      await start($)
      w.failSkills.add('overnight')
      await load($, 'overnight')
      await say($, 'buonanotte')
      expect(lineOf(w)).toContain('overnight')
    })

    test('a Skill call a hook beneath denied does not count as loaded', async ($, on) => {
      const w = world(on)
      await start($)
      w.denySkills.add('overnight')
      await load($, 'overnight')
      await say($, 'buonanotte')
      expect(lineOf(w)).toContain('overnight')
    })

    test('skills a subagent loads (Skill tool, slash command, preload) do not count for the main conversation', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'overnight', 'agent-1')
      await $.classic.UserPromptExpansion({ expansion_type: 'slash_command', command_name: 'coordinator-method', command_args: '', prompt: '/coordinator-method', agent_id: 'agent-1' })
      await $.skill.prompt({ skill: 'overnight', text: 'preloaded into a subagent' })
      await say($, 'buonanotte')
      expect(lineOf(w)).toContain('coordinator-method (')
      expect(lineOf(w)).toContain('overnight (')
    })

    test('a typed slash command is not suggested for itself', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, '/grill-me il piano di rilascio')
      expect(lineOf(w)).toContain('matt-bridge')
      expect(lineOf(w)).not.toContain('grill-me (')
    })

    test('at most 3 skills, highest priority first', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'lancia un worker cloud stanotte e poi mergia la PR')
      expect(w.logs).toEqual([{ text: 'skill suggerite: model-mix, coordinator-method, overnight', to: 'transcript' }])
      expect(lineOf(w)).toContain('model-mix (model, effort and usage budget for delegated work), coordinator-method (')
    })

    test('zoom-out is offered as a command the person runs', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'dammi il quadro generale del progetto')
      expect(lineOf(w)).toBe('skill-router: Only the person can run /zoom-out (big picture of unfamiliar code): suggest it if it fits.')
      expect(w.logs[0].text).toBe('skill suggerite: /zoom-out')
    })

    test('suggest off: no line', { options: { suggest: 'off' } }, async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'buonanotte')
      expect(last(w).context).toBeUndefined()
      expect(w.logs).toEqual([])
    })

    test('language en: English transcript line', { options: { language: 'en' } }, async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'buonanotte')
      expect(w.logs[0].text).toBe('suggested skills: coordinator-method, overnight')
    })

    test('/clear starts over; compaction does not', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'overnight')
      await load($, 'coordinator-method')
      await $.classic.SessionStart({ source: 'compact' })
      await say($, 'buonanotte')
      expect(last(w).context).toBeUndefined()
      await $.classic.SessionStart({ source: 'clear' })
      await say($, 'buonanotte')
      expect(lineOf(w)).toContain('overnight')
    })

    test('/resume and a fork rebuild the loaded skills from the transcript (failed loads left out)', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'ciao') // the process start's read finds an empty transcript
      w.messages = [
        { role: 'user', text: 'vado a dormire', toolUses: [] },
        skillUse('skills:coordinator-method'),
        skillUse('overnight', true),
      ]
      await $.classic.SessionStart({ source: 'resume' })
      await say($, 'buonanotte')
      expect(lineOf(w)).not.toContain('coordinator-method')
      expect(lineOf(w)).toContain('overnight (')
      w.messages = [skillUse('coordinator-method'), skillUse('overnight')]
      await $.classic.SessionStart({ source: 'fork' })
      await say($, 'buonanotte')
      expect(last(w).context).toBeUndefined()
    })

    test('a process started with --resume reads its transcript once, slash commands included', async ($, on) => {
      const w = world(on)
      w.messages = [
        skillUse('model-mix'),
        { role: 'user', text: '<command-name>/overnight</command-name>\n<command-message>overnight</command-message>', toolUses: [] },
      ]
      await start($)
      expect(isRefused(await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'sonnet' } as any))).toBe(false)
      await say($, 'buonanotte')
      expect(lineOf(w)).not.toContain('overnight (')
      expect(w.reads).toBe(1)
      expect(w.logs.filter(l => l.text.includes('fermato')).length).toBe(0)
    })

    test('/clear reads nothing back: a skill loaded before it does not count', async ($, on) => {
      const w = world(on)
      await start($)
      await say($, 'ciao')
      w.messages = [skillUse('model-mix')]
      await $.classic.SessionStart({ source: 'clear' })
      expect(isRefused(await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'sonnet' } as any))).toBe(true)
      expect(w.reads).toBe(1)
    })

    test('failure path: a hook that throws passes the prompt on unchanged', async ($, on) => {
      const w = world(on)
      await start($)
      // A context that cannot be spread makes the hook throw after it matched the prompt.
      await say($, 'buonanotte', { kind: 'composer' }, 5 as any)
      expect(last(w).text).toBe('buonanotte')
      expect(last(w).context).toBe(5)
      expect(w.logs).toEqual([])
    })
  })

  describe('gates', () => {
    test('Workflow: held once naming model-mix and smart-ultracode, the retry passes', async ($, on) => {
      const w = world(on)
      await start($)
      const input = { tool: 'Workflow', script: 'export const meta = { name: "x" }' }
      const r1 = await $.tool.call(input as any)
      expect(isRefused(r1)).toBe(true)
      expect(denyText(r1)).toContain('load model-mix and smart-ultracode with the Skill tool, then retry this exact call')
      expect(w.logs).toEqual([{ text: 'skill-router: Workflow fermato una volta, da caricare prima: model-mix, smart-ultracode', to: 'transcript' }])
      const r2 = await $.tool.call(input as any)
      expect(isRefused(r2)).toBe(false)
      expect(w.calls.filter(c => c.tool === 'Workflow').length).toBe(1)
    })

    test('Agent: held once naming model-mix, the retry passes', async ($, on) => {
      const w = world(on)
      await start($)
      const input = { tool: 'Agent', description: 'Fix', prompt: 'Fix issue 12', model: 'sonnet' }
      expect(isRefused(await $.tool.call(input as any))).toBe(true)
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls.filter(c => c.tool === 'Agent').length).toBe(2)
    })

    test('no gate fires when its skills are loaded', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'model-mix')
      await load($, 'smart-ultracode')
      expect(isRefused(await $.tool.call({ tool: 'Workflow', name: 'review' } as any))).toBe(false)
      expect(isRefused(await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' } as any))).toBe(false)
      expect(w.logs).toEqual([])
    })

    test('cloud and merge gates do not fire when their skills are loaded', async ($, on) => {
      const w = world(on)
      await start($)
      await load($, 'model-mix')
      await load($, 'skills:cloud-worker')
      await $.classic.UserPromptExpansion({ expansion_type: 'slash_command', command_name: 'merge-gate', command_args: '12', prompt: '/merge-gate 12' })
      expect(isRefused(await $.tool.call({ tool: 'Bash', command: 'claude --cloud "x"' } as any))).toBe(false)
      expect(isRefused(await $.tool.call({ tool: 'PowerShell', command: 'gh pr merge 12 --squash' } as any))).toBe(false)
      expect(w.logs).toEqual([])
    })

    test('a subagent\'s Agent, Workflow, merge, cloud launch or mod write passes and leaves the gates armed', async ($, on) => {
      const w = world(on)
      await start($)
      mod(w, MOD)
      const sub = [
        { tool: 'Agent', description: 'd', prompt: 'p', model: 'sonnet' },
        { tool: 'Workflow', name: 'review' },
        { tool: 'Bash', command: 'gh pr merge 12 --squash' },
        { tool: 'PowerShell', command: 'claude --cloud "x"' },
        { tool: 'Write', file_path: MOD + '\\hooks\\register.js', content: 'x' },
      ]
      for (const input of sub) expect(isRefused(await $.tool.call({ ...input, agentId: 'agent-7' } as any))).toBe(false)
      expect(w.logs).toEqual([])
      for (const input of sub) expect(isRefused(await $.tool.call(input as any))).toBe(true)
    })

    test('a follow-up to a cloud worker is not held', async ($, on) => {
      const w = world(on)
      await start($)
      const steer = { tool: 'Bash', command: 'claude -p "Fix the failing test on your PR" --cloud session_01ABC --output-format json' }
      expect(isRefused(await $.tool.call(steer as any))).toBe(false)
      expect(isRefused(await $.tool.call({ tool: 'Bash', command: 'claude -p "refactor the parser"' } as any))).toBe(false)
      expect(w.logs).toEqual([])
      expect(isRefused(await $.tool.call({ tool: 'Bash', command: 'claude --cloud "new task"' } as any))).toBe(true)
    })

    test('Monitor commands are gated like Bash; a Monitor watch without a command passes', async ($, on) => {
      const w = world(on)
      await start($)
      const ws = { tool: 'Monitor', description: 'ws', timeout_ms: 1000, ws: { url: 'wss://example.test/feed' } }
      expect(isRefused(await $.tool.call(ws as any))).toBe(false)
      const merge = { tool: 'Monitor', description: 'm', timeout_ms: 1000, command: 'gh pr merge 12 --squash' }
      expect(denyText(await $.tool.call(merge as any))).toContain('before merging a PR, load merge-gate')
      expect(isRefused(await $.tool.call(merge as any))).toBe(false)
      expect(w.calls.map(c => c.tool)).toEqual(['Monitor', 'Monitor'])
    })

    test('a quoted pwsh -Command or cmd /c script followed by a redirection is still read', async ($, on) => {
      world(on)
      await start($)
      expect(denyText(await $.tool.call({ tool: 'PowerShell', command: 'pwsh -NoProfile -Command "gh pr merge 3" 2>&1' } as any))).toContain('merge-gate')
      expect(denyText(await $.tool.call({ tool: 'PowerShell', command: 'cmd /c "claude --cloud x" 2>&1' } as any))).toContain('cloud session')
    })

    test('a Workflow resume finishes open work: not held, the gate stays armed', async ($, on) => {
      const w = world(on)
      await start($)
      expect(isRefused(await $.tool.call({ tool: 'Workflow', resumeFromRunId: 'wf_1' } as any))).toBe(false)
      expect(isRefused(await $.tool.call({ tool: 'Workflow', name: 'new' } as any))).toBe(true)
      expect(w.calls.length).toBe(1)
    })

    test('cloud launch from Bash: held once naming model-mix and cloud-worker', async ($, on) => {
      const w = world(on)
      await start($)
      const input = { tool: 'Bash', command: 'claude --model sonnet --cloud "fix the build"' }
      const r = await $.tool.call(input as any)
      expect(isRefused(r)).toBe(true)
      expect(denyText(r)).toContain('before launching a cloud session, load model-mix and cloud-worker')
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls).toEqual([expect.objectContaining(input)])
    })

    test('cloud launch from PowerShell (launch.ps1) and launch.exp are held', async ($, on) => {
      world(on)
      await start($)
      const r = await $.tool.call({ tool: 'PowerShell', command: 'powershell.exe -NoProfile -File "$HOME\\.claude\\skills\\cloud-worker\\launch.ps1" t.txt none w.log sonnet high' } as any)
      expect(isRefused(r)).toBe(true)
    })

    test('launch.exp is a cloud launch too', async ($, on) => {
      world(on)
      await start($)
      const r = await $.tool.call({ tool: 'Bash', command: 'expect ~/.claude/skills/coordinator-method/launch.exp t r l sonnet high' } as any)
      expect(isRefused(r)).toBe(true)
    })

    for (const command of [
      "Start-Process claude -ArgumentList '--cloud','\"fix the -p flag parsing\"'",
      "Start-Process claude -ArgumentList '--model','fable','--cloud','\"explain -p\"'",
    ]) {
      test('Start-Process with -p only inside a quoted prompt is a cloud launch: held once: ' + command, async ($, on) => {
        const w = world(on)
        await start($)
        const r = await $.tool.call({ tool: 'PowerShell', command } as any)
        expect(denyText(r)).toContain('before launching a cloud session, load model-mix and cloud-worker')
        expect(isRefused(await $.tool.call({ tool: 'PowerShell', command } as any))).toBe(false)
        expect(w.calls).toEqual([expect.objectContaining({ command })])
      })
    }

    test('the cloud gate skips cloud-worker when it is not installed', async ($, on) => {
      world(on, without('cloud-worker'))
      await start($)
      const r = await $.tool.call({ tool: 'Bash', command: 'claude --cloud "x"' } as any)
      expect(denyText(r)).toContain('load model-mix with the Skill tool')
      expect(denyText(r)).not.toContain('cloud-worker')
    })

    test('gh pr merge: held once naming merge-gate', async ($, on) => {
      const w = world(on)
      await start($)
      const input = { tool: 'PowerShell', command: 'gh pr merge 12 --squash --match-head-commit abc123' }
      const r = await $.tool.call(input as any)
      expect(denyText(r)).toContain('before merging a PR, load merge-gate')
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls.length).toBe(1)
    })

    test('merges pass when merge-gate is not installed or the command list is unknown', async ($, on) => {
      const w = world(on, without('merge-gate'))
      await start($)
      expect(isRefused(await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12 --squash' } as any))).toBe(false)
      expect(w.logs).toEqual([])
    })

    test('merges pass with the command list unknown', async ($, on) => {
      world(on, 'fail')
      await start($)
      expect(isRefused(await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12 --squash' } as any))).toBe(false)
    })

    test('heredoc bodies, here-strings and quoted mentions hold nothing', async ($, on) => {
      const w = world(on)
      await start($)
      const inputs = [
        { tool: 'Bash', command: "git commit -F - <<'EOF'\ngh pr merge 12\nclaude --cloud now\nEOF" },
        { tool: 'Bash', command: "gh pr create --title x --body-file - <<'EOF'\nthen gh pr merge 12 --squash\nEOF" },
        { tool: 'PowerShell', command: "@'\ngh pr merge 12\nclaude --cloud \"x\"\n'@ | Set-Content notes.md" },
        { tool: 'Bash', command: 'git commit -m "docs: run claude --cloud, then gh pr merge"' },
        { tool: 'Bash', command: 'cat ~/.claude/skills/cloud-worker/launch.ps1' },
        { tool: 'Bash', command: "git commit -m \"$(cat <<'EOF'\nfeat: add guard\n\nThe 5\" screen case.\ngh pr merge 5 runs after review\nEOF\n)\"" },
        { tool: 'Bash', command: "gh pr create --title \"x\" --body \"$(cat <<'EOF'\nIt's the user's \"fix\nclaude --cloud brief\nEOF\n)\"" },
      ]
      for (const input of inputs) expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls.length).toBe(inputs.length)
      expect(w.logs).toEqual([])
    })

    test('Write in a mod: held once naming smart-mods', async ($, on) => {
      const w = world(on)
      await start($)
      mod(w, MOD)
      const input = { tool: 'Write', file_path: MOD + '\\hooks\\register.js', content: 'export function register(on) {}' }
      const r = await $.tool.call(input as any)
      expect(denyText(r)).toContain("before writing a mod's files, load smart-mods")
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(isRefused(await $.tool.call({ ...input, file_path: MOD + '\\tests\\a.test.ts' } as any))).toBe(false)
    })

    test('an Edit that draws (ui.render) in a mod also asks for mod-ui, once', async ($, on) => {
      const w = world(on)
      await start($)
      mod(w, MOD)
      await load($, 'smart-mods')
      const input = { tool: 'Edit', file_path: MOD + '\\hooks\\register.js', old_string: '}', new_string: "on('ui.render', { component: 'AbovePrompt' }, draw)\n}" }
      const r = await $.tool.call(input as any)
      expect(denyText(r)).toContain("before drawing a mod's interface, load mod-ui")
      expect(denyText(r)).not.toContain('smart-mods')
      expect(isRefused(await $.tool.call(input as any))).toBe(false)
    })

    test('a new mod: writing under hooks/ next to a manifest counts before hooks/ exists', async ($, on) => {
      const w = world(on)
      await start($)
      w.existing.add(canon(MOD + '\\.claude-plugin\\plugin.json'))
      const r = await $.tool.call({ tool: 'Write', file_path: MOD + '\\hooks\\hooks.json', content: '{ "modules": ["./register.js"] }' } as any)
      expect(isRefused(r)).toBe(true)
    })

    test('files outside a mod, and plugins without hooks/, pass', async ($, on) => {
      const w = world(on)
      await start($)
      w.existing.add(canon('C:\\repo\\skills-plugin\\.claude-plugin\\plugin.json'))
      expect(isRefused(await $.tool.call({ tool: 'Write', file_path: 'C:\\repo\\src\\app.ts', content: 'x' } as any))).toBe(false)
      expect(isRefused(await $.tool.call({ tool: 'Write', file_path: 'C:\\repo\\skills-plugin\\skills\\a\\SKILL.md', content: 'x' } as any))).toBe(false)
      expect(w.logs).toEqual([])
    })

    test('with smart-mods loaded a plain Write checks no file at all', async ($, on) => {
      const w = world(on)
      await start($)
      mod(w, MOD)
      await load($, 'smart-mods')
      expect(isRefused(await $.tool.call({ tool: 'Write', file_path: MOD + '\\hooks\\register.js', content: 'x' } as any))).toBe(false)
      expect(w.fsCalls).toEqual([])
    })

    test('gate off: nothing is held', { options: { gate: 'off' } }, async ($, on) => {
      const w = world(on)
      await start($)
      mod(w, MOD)
      const inputs = [
        { tool: 'Workflow', name: 'x' }, { tool: 'Agent', description: 'd', prompt: 'p' },
        { tool: 'Bash', command: 'claude --cloud x' }, { tool: 'Bash', command: 'gh pr merge 1' },
        { tool: 'Write', file_path: MOD + '\\hooks\\register.js', content: 'x' },
      ]
      for (const input of inputs) expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls.length).toBe(inputs.length)
    })

    test('failure paths pass on: malformed calls reach the tool', async ($, on) => {
      const w = world(on)
      await start($)
      const inputs = [
        { tool: 'Bash', command: 42 },
        { tool: 'PowerShell', command: { claude: '--cloud' } },
        { tool: 'Monitor', description: 'w', timeout_ms: 1000, command: 42 },
        { tool: 'Write', file_path: 42, content: 'x' },
        { tool: 'Workflow', resumeFromRunId: 42 },
        { tool: 'Skill', skill: 42 },
      ]
      for (const input of inputs) expect(isRefused(await $.tool.call(input as any))).toBe(false)
      expect(w.calls.length).toBe(inputs.length)
    })

    test('unrelated tools pass untouched', async ($, on) => {
      const w = world(on)
      await start($)
      const inputs = [
        { tool: 'Read', file_path: 'C:/repo/a.txt' },
        { tool: 'Bash', command: 'ls -la && git status' },
        { tool: 'PowerShell', command: 'Get-ChildItem C:\\repo' },
        { tool: 'SendMessage', to: 'worker-1', message: 'fix the test' },
      ]
      for (const input of inputs) await $.tool.call(input as any)
      for (let i = 0; i < inputs.length; i++) expect(w.calls[i]).toMatchObject(inputs[i])
      expect(w.logs).toEqual([])
    })
  })

  describe('observers pass on unchanged', () => {
    test('session.start and skill.prompt return what lies beneath', async ($, on) => {
      world(on)
      const s = await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true } as any)
      expect(s).toEqual({ cwd: 'C:/repo' })
      const p = await $.skill.prompt({ skill: 'model-mix', text: 'the skill text' })
      expect(p).toEqual({ text: 'the skill text' })
    })
  })
})
