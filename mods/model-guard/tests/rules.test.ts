import { describe, expect, test } from 'claude-code/testing'
import {
  bodyModels, claudeLaunch, decideAgent, decideRemoteTrigger, decideShell, decideSpawn, decideWorkflow, decideWorkflowAgent, fiveHourBanked,
  forbiddenModel, haikuAlias, haikuKind, launchGate, parseVersion, planFromFiles, planFromOption, scanShell, spawnModel, statusText, texts,
  tokenize, tokenizeFull,
} from '../hooks/rules.js'
import { computeBudget, estimatePoints, modelFamily } from '../hooks/budget.js'
import * as budgetModule from '../hooks/budget.js'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const reading = (weekly: number, five = 10) => [
  { kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(NOW + 4 * DAY).toISOString() },
  { kind: 'five_hour', percentUsed: five, resetsAt: new Date(NOW + 60 * 60 * 1000).toISOString() },
]
const budget = (weekly: number | null, plan: any = null, five = 10) =>
  computeBudget({ rateLimits: weekly === null ? [] : reading(weekly, five), now: NOW, plan, inFlight: 0, readingAt: NOW })
const ctx = (b: any, extra: any = {}) => ({ budget: b, redPolicy: 'deny', lang: 'en', unknownLogged: false, ...extra })
const run = (width: number, admitted: number[] = [], name = 'Max 5x') => ({ admitted: new Set(admitted), width, name })

describe('rules', () => {
  test('tokenize keeps quoted text whole and splits on separators', () => {
    const segs = tokenize('cd "C:\\My Repo" && claude --cloud \'fix it\'; echo done | tee x')
    expect(segs.map(s => s.map(t => t.value))).toEqual([
      ['cd', 'C:\\My Repo'], ['claude', '--cloud', 'fix it'], ['echo', 'done'], ['tee', 'x'],
    ])
  })

  test('tokenize never throws on an unclosed quote', () => {
    expect(tokenize('claude --cloud "never closed').map(s => s.map(t => t.value))).toEqual([['claude', '--cloud', 'never closed']])
  })

  test('scanShell finds launches only at a command position', () => {
    // A claude word after a program that never runs its arguments is data.
    expect(scanShell('echo claude --cloud x')).toEqual([])
    expect(scanShell('echo "claude --cloud x"')).toEqual([])
    expect(scanShell('git log --grep "claude --cloud"')).toEqual([])
    expect(scanShell('claude --version')).toEqual([])
    expect(scanShell('FOO=1 claude --cloud x').length).toBe(1)
    expect(scanShell('npx claude --cloud x').length).toBe(1)
    expect(scanShell('x=$(claude --cloud task)').length).toBe(1)
    expect(scanShell('claude --cloud a; claude --model opus --cloud b')).toEqual([
      expect.objectContaining({ kind: 'cloud', hasModel: false }),
      expect.objectContaining({ kind: 'cloud', hasModel: true, model: 'opus' }),
    ])
  })

  test('scanShell reads launch.exp 4th argument, run directly or through expect with flags', () => {
    expect(scanShell('./launch.exp t r l fable high')).toEqual([{ kind: 'launchExp', model: 'fable' }])
    expect(scanShell('expect -f ~/.claude/skills/coordinator-method/launch.exp t - l sonnet high')).toEqual([{ kind: 'launchExp', model: 'sonnet' }])
    expect(scanShell('expect launch.exp t r')).toEqual([{ kind: 'launchExp', model: null }])
  })

  test('scanShell refuses a command that is not text', () => {
    expect(() => scanShell(42 as any)).toThrow('command is not text')
  })

  test('decideShell inserts --model sonnet after each claude token lacking one', () => {
    const d: any = decideShell({ tool: 'Bash', command: 'claude --cloud a && claude --cloud b' }, ctx(budget(40)))
    expect(d.action).toBe('rewrite')
    expect(d.input.command).toBe('claude --model sonnet --cloud a && claude --model sonnet --cloud b')
  })

  test('forbiddenModel: any Fable, the bare haiku alias and any Haiku 4.5 id; a Haiku 5.5 id passes', () => {
    expect(forbiddenModel('fable')).toBe('fable')
    expect(forbiddenModel('claude-fable-5-1')).toBe('fable')
    expect(forbiddenModel('HAIKU')).toBe('haiku')
    expect(forbiddenModel('claude-haiku-5-5')).toBeNull()
    expect(forbiddenModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
    expect(forbiddenModel('claude-haiku-4-5')).toBe('haiku-4-5')
    expect(forbiddenModel('sonnet')).toBeNull()
  })

  test('plan from CLAUDE.md files (kind user only) and from the option', () => {
    expect(planFromFiles([{ path: 'p', kind: 'project', content: 'Claude plan: Pro' }])).toBeNull()
    expect(planFromFiles([{ path: 'u', kind: 'user', content: 'x\nClaude plan: Max 20x · reserve 10%' }])).toMatchObject({ name: 'Max 20x', reserve: 10 })
    expect(planFromOption('Max 5x · reserve 15%')).toMatchObject({ name: 'Max 5x', reserve: 15 })
    expect(planFromOption('Claude plan: Pro')).toMatchObject({ name: 'Pro' })
    expect(planFromOption('')).toBeNull()
  })

  test('launchGate: red denies, warn notes, paused denies, unknown notes once', () => {
    expect(launchGate(ctx(budget(80)))).toMatchObject({ deny: expect.stringContaining('Budget red') })
    expect(launchGate(ctx(budget(80), { redPolicy: 'warn' }))).toMatchObject({ note: expect.stringContaining('launch allowed (only flagged)') })
    expect(launchGate(ctx(budget(40, null, 95)))).toMatchObject({ deny: expect.stringContaining('Wait until 13:00 UTC') })
    expect(launchGate(ctx(budget(null)))).toMatchObject({ unknownNoted: true })
    expect(launchGate(ctx(budget(null), { unknownLogged: true }))).toBeNull()
    expect(launchGate(ctx(budget(40)))).toBeNull()
  })

  test('launchGate: an unknown color never denies, interactive or not (an API-key session has no reading)', () => {
    for (const extra of [{}, { interactive: false }, { redPolicy: 'warn' }]) {
      const g: any = launchGate(ctx(budget(null), extra))
      expect(g.deny).toBeUndefined()
      expect(g.note).toContain('no budget reading yet')
    }
  })

  test('decideAgent keeps a fork untouched and logs it to debug', () => {
    const d: any = decideAgent({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'fork' }, ctx(budget(40)))
    expect(d).toMatchObject({ action: 'allow', to: 'debug' })
  })

  test('decideRemoteTrigger gates only launching actions', () => {
    for (const action of ['list', 'get', 'list_runs', 'get_run_log']) {
      expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action }, ctx(budget(80))).action).toBe('allow')
    }
    for (const action of ['create', 'update', 'run', 'create_webhook_trigger']) {
      expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action }, ctx(budget(80))).action).toBe('deny')
    }
  })

  test('decideRemoteTrigger: an update that only disables a routine passes while red or paused', () => {
    const off = { tool: 'RemoteTrigger', action: 'update', trigger_id: 'trig_1', body: { enabled: false } }
    expect(decideRemoteTrigger(off, ctx(budget(80))).action).toBe('allow')
    expect(decideRemoteTrigger(off, ctx(budget(40, null, 95))).action).toBe('allow')
    expect(decideRemoteTrigger({ ...off, body: { enabled: true } }, ctx(budget(80))).action).toBe('deny')
    expect(decideRemoteTrigger({ ...off, body: { cron_expression: '0 * * * *' } }, ctx(budget(80))).action).toBe('deny')
    expect(decideRemoteTrigger({ ...off, action: 'run', body: { enabled: false } }, ctx(budget(80))).action).toBe('deny')
  })

  test('decideWorkflow: a resume finishes open work (allowed red and on Solo), denied while paused', () => {
    const resume = { tool: 'Workflow', resumeFromRunId: 'wf_abc' }
    const red: any = decideWorkflow(resume, ctx(budget(80)))
    expect(red).toMatchObject({ action: 'allow', log: expect.stringContaining('workflow resume allowed') })
    expect(decideWorkflow(resume, ctx(budget(60, planFromOption('Pro')))).action).toBe('allow')
    expect(decideWorkflow(resume, ctx(budget(40, null, 95))).reason).toContain('Wait until 13:00 UTC')
    expect(decideWorkflow(resume, ctx(budget(40, null, 95))).action).toBe('deny')
    expect(decideWorkflow({ tool: 'Workflow', name: 'review' }, ctx(budget(80))).action).toBe('deny')
    expect(decideWorkflow({ tool: 'Workflow', name: 'review', resumeFromRunId: '' }, ctx(budget(80))).action).toBe('deny')
  })

  test('decideWorkflowAgent counts only admitted agents and validates the event', () => {
    const b = budget(40, planFromOption('Pro'))
    const r = run(4, [1, 2, 3, 4], 'Pro')
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_1', agentIndex: 5 } }, ctx(b), r)).toMatchObject({ action: 'deny' })
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_1', agentIndex: 2 } }, ctx(b), r)).toMatchObject({ action: 'allow' })
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_2', agentIndex: 1 } }, ctx(b), undefined))
      .toMatchObject({ action: 'allow', admit: true, startRun: { width: 4, name: 'Pro' } })
    expect(() => decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 7, agentIndex: 1 } }, ctx(b), undefined)).toThrow()
    expect(() => decideWorkflowAgent({ model: 'sonnet' }, ctx(b), undefined)).toThrow()
  })

  test('decideWorkflowAgent: red blocks a new run only; a run started before keeps its own width', () => {
    const red = budget(80)
    const fresh: any = decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_new', agentIndex: 1 } }, ctx(red), undefined)
    expect(fresh).toMatchObject({ action: 'deny', reason: expect.stringContaining('no new workflow runs') })
    expect(fresh.startRun).toBeUndefined()
    const started = run(8, [1, 2, 3])
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_old', agentIndex: 4 } }, ctx(red), started)).toMatchObject({ action: 'allow', admit: true })
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_old', agentIndex: 4 } }, ctx(red), started).startRun).toBeUndefined()
    const full = run(8, [1, 2, 3, 4, 5, 6, 7, 8])
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_old', agentIndex: 9 } }, ctx(red), full))
      .toMatchObject({ action: 'deny', reason: expect.stringContaining('Max 5x, which applied when the run started, allows 8') })
    // A step down after the run started does not narrow it either.
    const yellow20 = budget(60, planFromOption('Max 20x'))
    const wide = run(16, [1, 2, 3, 4, 5, 6, 7, 8], 'Max 20x')
    expect(decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_w', agentIndex: 9 } }, ctx(yellow20), wide).action).toBe('allow')
  })

  test('decideWorkflowAgent records a run first seen through a model refusal, unless its width is 0', () => {
    const green = budget(40)
    expect(decideWorkflowAgent({ model: 'fable', workflow: { runId: 'wf_f', agentIndex: 1 } }, ctx(green), undefined))
      .toMatchObject({ action: 'deny', startRun: { width: 8, name: 'Max 5x' } })
    expect(decideWorkflowAgent({ model: 'fable', workflow: { runId: 'wf_f', agentIndex: 1 } }, ctx(budget(80)), undefined).startRun).toBeUndefined()
  })

  test('the width lines name no agent number (they repeat for every refused agent)', () => {
    const d: any = decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf_1', agentIndex: 9 } }, ctx(budget(40)), run(8, [1, 2, 3, 4, 5, 6, 7, 8]))
    expect(d.log).toBe('model-guard: workflow past width 8 (Max 5x), further agents blocked')
  })

  test('statusText only while red, in the person\'s language', () => {
    expect(statusText(budget(40), 'deny', 'it')).toBeUndefined()
    expect(statusText(budget(80), 'deny', 'it')).toContain('nuovi lanci bloccati')
    expect(statusText(budget(80), 'warn', 'en')).toContain('launches only flagged')
  })
})

describe('nested shells', () => {
  test('bash -lc, pwsh -Command and cmd /c scripts are read', () => {
    expect(scanShell('bash -lc "cd repo && claude --cloud task"')).toEqual([expect.objectContaining({ kind: 'cloud', hasModel: false })])
    expect(scanShell("pwsh -Command 'claude --model fable --cloud x'")).toEqual([expect.objectContaining({ model: 'fable' })])
    expect(scanShell('cmd /c "expect launch.exp t r l haiku low"')).toEqual([{ kind: 'launchExp', model: 'haiku' }])
    expect(scanShell('bash -c "echo claude --cloud"')).toEqual([])
    expect(scanShell('bash -c "echo \'claude --cloud\'"')).toEqual([])
  })

  test('a plain quoted script gets --model sonnet in place; an escaped one is denied', () => {
    const b = computeBudget({ rateLimits: reading(40), now: NOW, plan: null, inFlight: 0, readingAt: NOW })
    const plain: any = decideShell({ tool: 'Bash', command: 'bash -c "claude --cloud task"' }, ctx(b))
    expect(plain.input.command).toBe('bash -c "claude --model sonnet --cloud task"')
    const escaped: any = decideShell({ tool: 'Bash', command: 'bash -c "claude --cloud \\"task\\""' }, ctx(b))
    expect(escaped.action).toBe('deny')
    expect(escaped.reason).toContain('--model sonnet')
  })

  test('unquoted cmd /c, cmd /k and pwsh -Command scripts run to the end of the segment and get --model in place', () => {
    const b = budget(40)
    for (const [cmd, out] of [
      ['cmd /c claude --cloud "task"', 'cmd /c claude --model sonnet --cloud "task"'],
      ['cmd /K claude --cloud task', 'cmd /K claude --model sonnet --cloud task'],
      ['pwsh -NoProfile -Command claude --cloud "task"', 'pwsh -NoProfile -Command claude --model sonnet --cloud "task"'],
      ['powershell.exe -c claude --cloud x', 'powershell.exe -c claude --model sonnet --cloud x'],
    ]) {
      const d: any = decideShell({ tool: 'PowerShell', command: cmd }, ctx(b))
      expect(d.action).toBe('rewrite')
      expect(d.input.command).toBe(out)
    }
    expect(scanShell('cmd /c claude --model fable --cloud x')).toEqual([expect.objectContaining({ model: 'fable' })])
    // bash -c takes one word as its script; the rest are $0, $1...
    expect(scanShell('bash -c claude --cloud x')).toEqual([])
  })

  test('xargs launches are seen and rewritten in place', () => {
    const x: any = decideShell({ tool: 'Bash', command: 'echo t | xargs claude --cloud' }, ctx(budget(40)))
    expect(x.input.command).toBe('echo t | xargs claude --model sonnet --cloud')
  })
})

describe('heredocs and here-strings are data', () => {
  const TEXTS = [
    "gh pr create --title \"x\" --body-file - <<'EOF'\nSteps:\nclaude --cloud \"fix the bug\"\nEOF",
    "git commit -F - <<'EOF'\nclaude --cloud now gets --model\nEOF",
    "cat > brief.md <<'EOF'\nclaude --model sonnet --cloud \"task\"\nEOF",
    "@'\nDon't stop.\nclaude --cloud \"x\"\n'@ | Set-Content brief.md",
    "git commit -F - <<'EOF'\nexpect launch.exp t r l fable high\nEOF",
    'cat <<EOF > brief.md\nclaude --cloud "unquoted delimiter"\nEOF',
    'cat <<-"END"\n\tclaude --cloud x\n\tEND\necho done',
    'cat <<A <<B\nclaude --cloud a\nA\nclaude --cloud b\nB\n',
    "git commit -F - <<'EOF'\r\nclaude --cloud x\r\nEOF\r\n",
    '@"\nclaude --cloud $task\n"@ | Out-File brief.md',
  ]

  test('a body that only mentions a launch holds no launch', () => {
    for (const command of TEXTS) expect(scanShell(command)).toEqual([])
  })

  test('decideShell allows them in every color, even red and paused', () => {
    for (const b of [budget(40), budget(80), budget(40, null, 95), budget(null)]) {
      for (const command of TEXTS) expect(decideShell({ tool: 'Bash', command }, ctx(b)).action).toBe('allow')
    }
  })

  test('a launch after the body ends is still found and rewritten in place', () => {
    const command = "cat <<'EOF' > x\nhi\nEOF\nclaude --cloud \"t\""
    expect(scanShell(command)).toEqual([expect.objectContaining({ kind: 'cloud', hasModel: false })])
    const d: any = decideShell({ tool: 'Bash', command }, ctx(budget(40)))
    expect(d.input.command).toBe("cat <<'EOF' > x\nhi\nEOF\nclaude --model sonnet --cloud \"t\"")
    expect(scanShell('cat <<EOF; claude --cloud same-line\nbody\nEOF')).toEqual([expect.objectContaining({ kind: 'cloud' })])
  })

  test('an unterminated body, a here-string <<< and a bit shift are scanned as commands', () => {
    expect(scanShell('cat <<EOF\nclaude --cloud x')).toEqual([expect.objectContaining({ kind: 'cloud' })])
    expect(scanShell('echo $((1<<2))\nclaude --cloud x')).toEqual([expect.objectContaining({ kind: 'cloud' })])
    expect(scanShell('cat <<< "claude --cloud x"')).toEqual([])
    expect(tokenize('cat <<< word').map(s => s.map(t => t.value))).toEqual([['cat', '<<<', 'word']])
  })

  test('a here-string given to pwsh -Command is read as its script (no edit in place: denied without --model)', () => {
    const command = "pwsh -Command @'\nclaude --cloud x\n'@"
    expect(scanShell(command)).toEqual([expect.objectContaining({ kind: 'cloud', insertAt: null })])
    expect(decideShell({ tool: 'PowerShell', command }, ctx(budget(40))).action).toBe('deny')
  })
})

describe('cloud-session column of the stepped-down profile', () => {
  test('Pro yellow is Solo: no new cloud session or launch.exp; Max 20x yellow (Max 5x) still allows one', () => {
    const proYellow = budget(60, planFromOption('Pro'))
    expect(proYellow.profile.name).toBe('Solo')
    for (const command of ['claude --model sonnet --cloud "x"', 'claude --cloud "x"', 'expect launch.exp t r l sonnet high']) {
      const d: any = decideShell({ tool: 'Bash', command }, ctx(proYellow))
      expect(d.action).toBe('deny')
      expect(d.reason).toContain('no new cloud sessions')
      expect(d.log).toContain('Solo')
    }
    expect(decideShell({ tool: 'Bash', command: 'claude --model sonnet --cloud "x"' }, ctx(budget(60, planFromOption('Max 20x')))).action).toBe('allow')
    // Red is the gate's: with redPolicy warn it only flags.
    expect(decideShell({ tool: 'Bash', command: 'claude --model sonnet --cloud "x"' }, ctx(budget(80), { redPolicy: 'warn' })).action).toBe('allow')
  })
})

describe('cloud follow-ups steer open work (D1)', () => {
  const STEERS = [
    'claude -p "Fix the failing lint on your PR #12" --cloud session_01ABC --output-format json',
    'claude --print "x" --cloud https://claude.ai/code/session_01ABC',
    'claude -p "x" --cloud cse_0123',
    'claude --cloud session_01ABC -p "rebase on main"',
    'claude -p "x" --cloud=session_01ABC',
    'bash -lc "claude -p \\"x\\" --cloud session_1"',
  ]

  test('scanShell finds no launch in a follow-up', () => {
    for (const c of STEERS) expect(scanShell(c), c).toEqual([])
  })

  test('decideShell allows it untouched in red, paused, Solo and green', () => {
    for (const b of [budget(80), budget(40, null, 95), budget(60, planFromOption('Pro')), budget(40)]) {
      for (const command of STEERS) {
        const d: any = decideShell({ tool: 'Bash', command }, ctx(b))
        expect(d.action).toBe('allow')
        expect(d.input).toBeUndefined()
      }
    }
  })

  test('a new cloud session stays a launch: no -p, or -p with --environment', () => {
    expect(scanShell('claude --cloud "fix"')).toEqual([expect.objectContaining({ kind: 'cloud' })])
    expect(scanShell('claude -p "task" --environment ccpool_x --cloud')).toEqual([expect.objectContaining({ kind: 'cloud', hasModel: false })])
    expect(decideShell({ tool: 'Bash', command: 'claude -p "t" --environment ccpool_x --cloud' }, ctx(budget(80))).action).toBe('deny')
  })
})

describe('local headless sessions are launches (D5)', () => {
  test('claude -p, --print, --bg and --background are local launches; --model is read', () => {
    expect(scanShell('claude -p "refactor the parser" --max-turns 30')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6 }])
    expect(scanShell('claude --bg "run the nightly sweep"')).toEqual([expect.objectContaining({ kind: 'local' })])
    expect(scanShell('claude --print --model opus "x"')).toEqual([expect.objectContaining({ kind: 'local', hasModel: true, model: 'opus' })])
  })

  test('management commands and plain sessions are not launches', () => {
    for (const c of [
      'claude --version', 'claude -v', 'claude --help', 'claude plugin validate mods/x --strict', 'claude plugin test mods/x',
      'claude mcp list', 'claude auth status --text', 'claude update', 'claude agents --json', 'claude doctor',
      'claude config list', 'claude', 'claude --resume abc', 'claude > out.txt', 'claude ultrareview --help',
    ]) expect(scanShell(c), c).toEqual([])
    expect(claudeLaunch(['plugin', 'test', '-p', 'x'])).toBeNull()
  })

  test('decideShell: --model sonnet in green, denied while red or paused, fable and haiku denied, Solo allowed', () => {
    const c = 'claude -p "x" --max-turns 3'
    const green: any = decideShell({ tool: 'Bash', command: c }, ctx(budget(40)))
    expect(green.input.command).toBe('claude --model sonnet -p "x" --max-turns 3')
    expect(green.log).toContain('claude -p/--bg')
    expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(80))).reason).toContain('Budget red')
    expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(40, null, 95))).reason).toContain('Wait until')
    expect(decideShell({ tool: 'Bash', command: 'claude -p "x" --model fable' }, ctx(budget(40))).reason).toContain('Headless and background sessions (claude -p, --bg) never run Fable')
    expect(decideShell({ tool: 'Bash', command: 'claude --bg --model haiku' }, ctx(budget(40))).reason).toContain('the bare haiku alias')
    expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(60, planFromOption('Pro')))).action).toBe('rewrite')
  })
})

describe('a local session resume finishes open work', () => {
  const RESUMES = ['claude --resume abc -p "x"', 'claude -c -p "x"', 'claude --bg --resume abc']

  test('-r/--resume, -c/--continue or --from-pr with -p or --bg is a resume; --fork-session keeps it local', () => {
    expect(scanShell('claude --resume abc -p "x"')).toEqual([{ kind: 'resume', hasModel: false, model: null, insertAt: 6 }])
    for (const c of [...RESUMES, 'claude --background --resume abc', 'claude --from-pr 12 --print "x"', 'claude --continue --bg']) {
      expect(scanShell(c), c).toEqual([expect.objectContaining({ kind: 'resume' })])
    }
    expect(claudeLaunch(['-r', 'abc', '-p', 'x'])).toBe('resume')
    expect(claudeLaunch(['--resume=abc', '--print', 'x'])).toBe('resume')
    expect(scanShell('claude --resume abc -p "x" --fork-session')).toEqual([expect.objectContaining({ kind: 'local', hasModel: false })])
    // An interactive resume (no -p, no --bg) is no delegated launch.
    expect(scanShell('claude --resume abc')).toEqual([])
    expect(scanShell('claude -c')).toEqual([])
  })

  test('red allows it with the resume note, green adds no --model, paused denies it', () => {
    for (const command of RESUMES) {
      const red: any = decideShell({ tool: 'Bash', command }, ctx(budget(80)))
      expect(red, command).toMatchObject({ action: 'allow', log: expect.stringContaining('session resume allowed (open work)') })
      expect(red.input).toBeUndefined()
      expect(decideShell({ tool: 'Bash', command }, ctx(budget(80), { redPolicy: 'warn' })).action).toBe('allow')
      const green: any = decideShell({ tool: 'Bash', command }, ctx(budget(40)))
      expect(green, command).toMatchObject({ action: 'allow', log: '' })
      expect(green.input).toBeUndefined()
      const paused: any = decideShell({ tool: 'Bash', command }, ctx(budget(40, null, 95)))
      expect(paused, command).toMatchObject({ action: 'deny', reason: expect.stringContaining('Wait until 13:00 UTC') })
    }
    expect(decideShell({ tool: 'Bash', command: RESUMES[0] }, ctx(budget(80), { lang: 'it' })).log).toContain('ripresa della sessione consentita')
  })

  test('no cloud-column check: Solo (Pro yellow) allows it', () => {
    const solo = budget(60, planFromOption('Pro'))
    for (const command of RESUMES) expect(decideShell({ tool: 'Bash', command }, ctx(solo)).action).toBe('allow')
  })

  test('an explicit Fable or bare haiku is still denied, red included', () => {
    for (const b of [budget(40), budget(80)]) {
      const fable: any = decideShell({ tool: 'Bash', command: 'claude --resume abc -p x --model fable' }, ctx(b))
      expect(fable).toMatchObject({ action: 'deny', reason: expect.stringContaining('never run Fable') })
      expect(decideShell({ tool: 'Bash', command: 'claude -c --bg --model haiku' }, ctx(b)).reason).toContain('the bare haiku alias')
    }
    expect(decideShell({ tool: 'Bash', command: 'claude --resume abc -p x --model opus' }, ctx(budget(80))).action).toBe('allow')
  })

  test('--fork-session is a new session: --model sonnet in green, denied while red', () => {
    const fork = 'claude --resume abc -p "x" --fork-session'
    expect((decideShell({ tool: 'Bash', command: fork }, ctx(budget(40))) as any).input.command).toBe('claude --model sonnet --resume abc -p "x" --fork-session')
    expect(decideShell({ tool: 'Bash', command: fork }, ctx(budget(80))).reason).toContain('Budget red')
  })

  test('next to a new launch the command goes through the gate as a whole; only the new one gets --model', () => {
    const mixed = 'claude --resume abc -p x && claude -p y'
    expect(decideShell({ tool: 'Bash', command: mixed }, ctx(budget(80))).reason).toContain('Budget red')
    expect((decideShell({ tool: 'Bash', command: mixed }, ctx(budget(40))) as any).input.command).toBe('claude --resume abc -p x && claude --model sonnet -p y')
  })
})

describe('heredoc inside "$(...)" is data (D2)', () => {
  const BODIES = [
    "git commit -m \"$(cat <<'EOF'\nfeat: support 5\" displays\nclaude --cloud docs\nEOF\n)\"",
    "gh pr create --title t --body \"$(cat <<'EOF'\nSet `\"enabled\": false` in config.\n\n```\nclaude -p \"msg\" --cloud abc\n```\nEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\nfeat: add guard\n\nThe 5\" screen case.\ngh pr merge 5 runs after review\nEOF\n)\"",
    "gh pr create --title \"x\" --body \"$(cat <<'EOF'\nIt's the user's \"fix\nclaude --cloud brief\nEOF\n)\"",
    "git commit -m \"$(cat <<-EOF\n\tclaude --cloud \"x\n\tEOF\n)\"",
  ]

  test('an odd quote or a backtick-quote code span in the body holds no launch', () => {
    for (const command of BODIES) expect(scanShell(command), command).toEqual([])
  })

  test('decideShell allows them in every color', () => {
    for (const b of [budget(40), budget(80), budget(40, null, 95), budget(60, planFromOption('Pro'))]) {
      for (const command of BODIES) expect(decideShell({ tool: 'Bash', command }, ctx(b)).action).toBe('allow')
    }
  })

  test('the body stays in the quoted token; a launch after the string is still found and rewritten in place', () => {
    const segs = tokenize("git commit -m \"$(cat <<'EOF'\na \" b\nEOF\n)\" && echo ok")
    expect(segs.map(s => s.map(t => t.value))).toEqual([['git', 'commit', '-m', "$(cat <<'EOF'\na \" b\nEOF\n)"], ['echo', 'ok']])
    const command = "git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && claude --cloud t"
    const d: any = decideShell({ tool: 'Bash', command }, ctx(budget(40)))
    expect(d.input.command).toBe("git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && claude --model sonnet --cloud t")
    // `<<` in plain double quotes, outside a `$(...)`, is text.
    expect(tokenize('echo "a <<EOF b"').map(s => s.map(t => t.value))).toEqual([['echo', 'a <<EOF b']])
  })
})

describe('cmd /c and pwsh -Command with more words after a quoted script (D11)', () => {
  test('the quoted script is read, and rewritten in place', () => {
    const b = budget(40)
    for (const [cmd, out] of [
      ['cmd /c "claude --cloud x" 2>&1', 'cmd /c "claude --model sonnet --cloud x" 2>&1'],
      ['pwsh -NoProfile -Command "claude --cloud x" 2>&1', 'pwsh -NoProfile -Command "claude --model sonnet --cloud x" 2>&1'],
      ["powershell -Command \"claude --cloud 'task'\" -ErrorAction Stop", "powershell -Command \"claude --model sonnet --cloud 'task'\" -ErrorAction Stop"],
      ['cmd /c "claude" --cloud x', 'cmd /c "claude" --model sonnet --cloud x'],
    ]) {
      const d: any = decideShell({ tool: 'PowerShell', command: cmd }, ctx(b))
      expect(d.action).toBe('rewrite')
      expect(d.input.command).toBe(out)
    }
  })

  test('a forbidden model there is denied, red denies them all', () => {
    expect(decideShell({ tool: 'PowerShell', command: 'cmd /c "claude --cloud --model fable x" > out.txt' }, ctx(budget(40))).action).toBe('deny')
    expect(decideShell({ tool: 'PowerShell', command: 'pwsh -Command "claude --cloud --model fable x" > o' }, ctx(budget(40))).action).toBe('deny')
    expect(decideShell({ tool: 'PowerShell', command: 'cmd /c "claude --cloud x" 2>&1' }, ctx(budget(80))).action).toBe('deny')
  })
})

describe('Agent: Fable, remote isolation (D3, D6)', () => {
  test('fable becomes opus on Max 20x, green, foreground; the line once, then to debug', () => {
    const b = budget(30, planFromOption('Max 20x'))
    const first: any = decideAgent({ tool: 'Agent', model: 'fable', run_in_background: false }, ctx(b))
    expect(first).toMatchObject({ action: 'rewrite', input: { model: 'opus' }, to: 'transcript', fableNoted: true })
    const later: any = decideAgent({ tool: 'Agent', model: 'fable', run_in_background: false }, ctx(b, { fableLogged: true }))
    expect(later).toMatchObject({ action: 'rewrite', input: { model: 'opus' }, to: 'debug' })
    expect(later.fableNoted).toBeUndefined()
  })

  test('isolation remote needs a cloud slot: denied on Solo, allowed on Max 20x yellow (Max 5x)', () => {
    const remote = { tool: 'Agent', description: 'd', prompt: 'p', model: 'sonnet', isolation: 'remote' }
    const solo: any = decideAgent(remote, ctx(budget(60, planFromOption('Pro'))))
    expect(solo.action).toBe('deny')
    expect(solo.reason).toContain('no new cloud sessions')
    expect(decideAgent({ ...remote, isolation: 'worktree' }, ctx(budget(60, planFromOption('Pro')))).action).toBe('allow')
    expect(decideAgent(remote, ctx(budget(60, planFromOption('Max 20x')))).action).toBe('allow')
    expect(decideAgent(remote, ctx(budget(80))).reason).toContain('Budget red')
  })
})

describe('Haiku 5.5 (model-mix)', () => {
  const OK = { ok: true }
  const OLD = { ok: false, why: 'old' }
  const AGENT = { tool: 'Agent', description: 'd', prompt: 'p' }

  test('parseVersion reads the release base, else the full version', () => {
    expect(parseVersion({ version: '2.1.293-dev.20261007.t101500.sha1a2b3c4', base: '2.1.293-dev' })).toEqual([2, 1, 293])
    expect(parseVersion({ version: '2.1.293' })).toEqual([2, 1, 293])
    expect(parseVersion({ version: 'nightly' })).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })

  test('haikuAlias: 2.1.293 or later on the Anthropic API; older, unknown or another provider is not', () => {
    for (const version of ['2.1.293', '2.1.300', '2.2.0', '3.0.0']) expect(haikuAlias({ version }, {})).toEqual(OK)
    expect(haikuAlias({ version: '2.1.293-dev.x', base: '2.1.293-dev' }, {})).toEqual(OK)
    for (const version of ['2.1.292', '2.0.999', '1.9.400']) expect(haikuAlias({ version }, {})).toEqual(OLD)
    expect(haikuAlias(null, {})).toEqual({ ok: false, why: 'unknown' })
    expect(haikuAlias({ version: '2.1.293' }, null)).toEqual({ ok: false, why: 'env' })
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001' })).toEqual({ ok: false, why: 'remapped' })
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'sonnet' })).toEqual({ ok: false, why: 'remapped' })
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' })).toEqual(OK)
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_DEFAULT_HAIKU_MODEL: ' ' })).toEqual(OK)
    expect(haikuAlias({ version: '2.1.292' }, { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' })).toEqual(OLD)
    for (const name of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD', 'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_GATEWAY']) {
      expect(haikuAlias({ version: '2.1.293' }, { [name]: '1' })).toEqual({ ok: false, why: 'provider' })
      expect(haikuAlias({ version: '2.1.293' }, { [name]: '0' })).toEqual(OK)
      expect(haikuAlias({ version: '2.1.293' }, { [name]: 'false' })).toEqual(OK)
    }
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_BASE_URL: 'https://api.anthropic.com/' })).toEqual(OK)
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_BASE_URL: 'https://proxy.example.com' })).toEqual({ ok: false, why: 'provider' })
    expect(haikuAlias({ version: '2.1.293' }, { ANTHROPIC_BASE_URL: '' })).toEqual(OK)
  })

  test('haikuKind tells the alias, Haiku 5.5 ids and older Haiku ids apart, any case', () => {
    expect(haikuKind(' Haiku ')).toBe('alias')
    expect(haikuKind('claude-haiku-5-5')).toBe('current')
    expect(haikuKind('CLAUDE-HAIKU-5-5-20261007')).toBe('current')
    expect(haikuKind('us.anthropic.claude-haiku-5-5')).toBe('current')
    expect(haikuKind('claude-haiku-4-5-20251001')).toBe('old')
    expect(haikuKind('claude-3-5-haiku-20241022')).toBe('old')
    expect(haikuKind('sonnet')).toBeNull()
    expect(haikuKind(undefined)).toBeNull()
  })

  test('decideAgent: haiku kept where it is Haiku 5.5, else sonnet with the reason', () => {
    const kept: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40), { haiku: OK }))
    expect(kept).toMatchObject({ action: 'rewrite', input: { model: 'haiku', effort: 'medium' }, to: 'debug' })
    expect(decideAgent({ ...AGENT, model: 'haiku', effort: 'high' }, ctx(budget(40), { haiku: OK })).action).toBe('allow')
    const env: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40), { haiku: { ok: false, why: 'env' } }))
    expect(env.reason).toContain('could not read the environment')
    const remapped: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40), { haiku: { ok: false, why: 'remapped' } }))
    expect(remapped.reason).toContain('ANTHROPIC_DEFAULT_HAIKU_MODEL')
    const old: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40), { haiku: OLD }))
    expect(old).toMatchObject({ action: 'rewrite', input: { model: 'sonnet' } })
    expect(old.reason).toContain('older than 2.1.293')
    expect(old.log).toBe('model-guard: haiku -> sonnet (before Claude Code 2.1.293 haiku is Haiku 4.5)')
    const none: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40)))
    expect(none.input.model).toBe('sonnet')
    expect(none.reason).toContain('could not read the Claude Code version')
    const provider: any = decideAgent({ ...AGENT, model: 'haiku' }, ctx(budget(40), { haiku: { ok: false, why: 'provider' } }))
    expect(provider.reason).toContain('Bedrock')
    const remote: any = decideAgent({ ...AGENT, model: 'haiku', isolation: 'remote' }, ctx(budget(40), { haiku: OK }))
    expect(remote.input.model).toBe('sonnet')
    expect(remote.reason).toContain('its own Claude Code version')
  })

  test('decideAgent: Explore without a model gets haiku at effort medium, a given effort stays', () => {
    const d: any = decideAgent({ ...AGENT, subagent_type: 'Explore' }, ctx(budget(40), { haiku: OK }))
    expect(d).toMatchObject({ action: 'rewrite', input: { model: 'haiku', effort: 'medium' } })
    const low: any = decideAgent({ ...AGENT, subagent_type: 'Explore', effort: 'low' }, ctx(budget(40), { haiku: OK }))
    expect(low.input).toMatchObject({ model: 'haiku', effort: 'low' })
    const old: any = decideAgent({ ...AGENT, subagent_type: 'Explore' }, ctx(budget(40), { haiku: OLD }))
    expect(old.input.model).toBe('sonnet')
    expect(old.input.effort).toBeUndefined()
    expect(old.reason).toContain('Not haiku')
    for (const type of [undefined, 'general-purpose', 'Plan']) {
      const input: any = type ? { ...AGENT, subagent_type: type } : { ...AGENT }
      expect((decideAgent(input, ctx(budget(40), { haiku: OK })) as any).input.model).toBe('sonnet')
    }
  })

  test('decideAgent: a Haiku 4.5 id becomes sonnet, a Haiku 5.5 id is kept, also where the alias is not 5.5', () => {
    const old: any = decideAgent({ ...AGENT, model: 'claude-haiku-4-5-20251001' }, ctx(budget(40), { haiku: OK }))
    expect(old).toMatchObject({ action: 'rewrite', input: { model: 'sonnet' } })
    expect(old.reason).toContain('never pins Haiku 4.5')
    expect(decideAgent({ ...AGENT, model: 'claude-haiku-5-5' }, ctx(budget(40), { haiku: OLD }))).toMatchObject({ action: 'rewrite', input: { model: 'claude-haiku-5-5', effort: 'medium' } })
    expect(decideAgent({ ...AGENT, model: 'claude-haiku-5-5', effort: 'low' }, ctx(budget(40), { haiku: OLD })).action).toBe('allow')
  })

  test('decideAgent: full Fable ids, any case, become opus', () => {
    for (const model of ['claude-fable-5-1', 'claude-fable-5', 'CLAUDE-FABLE-5-1', 'Fable']) {
      const d: any = decideAgent({ ...AGENT, model }, ctx(budget(40)))
      expect(d, model).toMatchObject({ action: 'rewrite', input: { model: 'opus' } })
    }
    const later: any = decideAgent({ ...AGENT, model: 'claude-fable-5-1' }, ctx(budget(40), { fableLogged: true }))
    expect(later.to).toBe('debug')
  })

  test('decideWorkflowAgent: haiku where it is 5.5, denied otherwise; Haiku 4.5 ids denied', () => {
    const wf = (model: string, i = 1) => ({ model, workflow: { runId: 'wf', agentIndex: i } })
    expect(decideWorkflowAgent(wf('haiku'), ctx(budget(40), { haiku: OK }), undefined)).toMatchObject({ action: 'allow', admit: true })
    const old: any = decideWorkflowAgent(wf('haiku'), ctx(budget(40), { haiku: OLD }), undefined)
    expect(old.action).toBe('deny')
    expect(old.reason).toContain('older than 2.1.293')
    expect(old.log).toBe('model-guard: workflow agent on haiku blocked (before Claude Code 2.1.293 haiku is Haiku 4.5), pin sonnet')
    const h45: any = decideWorkflowAgent(wf('claude-haiku-4-5'), ctx(budget(40), { haiku: OK }), undefined)
    expect(h45.reason).toContain("{ model: 'haiku', effort: 'medium' }")
    const h45old: any = decideWorkflowAgent(wf('claude-haiku-4-5'), ctx(budget(40), { haiku: OLD }), undefined)
    expect(h45old.reason).not.toContain("model: 'haiku'")
    expect(decideWorkflowAgent(wf('claude-haiku-5-5'), ctx(budget(40), { haiku: OLD }), undefined).action).toBe('allow')
    const inh = (parentModel: string) => ({ parentModel, workflow: { runId: 'wf', agentIndex: 9 } })
    const inhOld: any = decideWorkflowAgent(inh('haiku'), ctx(budget(40), { haiku: OLD }), undefined)
    expect(inhOld.action).toBe('deny')
    expect(inhOld.reason).toContain("inherit the session's haiku alias")
    const inh45: any = decideWorkflowAgent(inh('claude-haiku-4-5-20251001'), ctx(budget(40), { haiku: OK }), undefined)
    expect(inh45.action).toBe('deny')
    expect(inh45.reason).toContain('inherited from the session')
    expect(decideWorkflowAgent(inh('haiku'), ctx(budget(40), { haiku: OK }), undefined).action).toBe('allow')
    expect(decideWorkflowAgent({ model: 'sonnet', parentModel: 'haiku', workflow: { runId: 'wf', agentIndex: 8 } }, ctx(budget(40), { haiku: OLD }), undefined).action).toBe('allow')
  })

  test('decideShell: the bare alias tells to pin claude-haiku-5-5; Haiku 4.5 ids are refused', () => {
    const cloud: any = decideShell({ tool: 'Bash', command: 'claude --model haiku --cloud x' }, ctx(budget(40), { haiku: OK }))
    expect(cloud.action).toBe('deny')
    expect(cloud.reason).toContain('Pin the full id --model claude-haiku-5-5')
    const exp: any = decideShell({ tool: 'Bash', command: 'expect launch.exp t r l haiku medium' }, ctx(budget(40)))
    expect(exp.reason).toContain('Pin the full id claude-haiku-5-5')
    const h45: any = decideShell({ tool: 'Bash', command: 'claude --bg --model claude-haiku-4-5-20251001' }, ctx(budget(40)))
    expect(h45.reason).toContain('never pins Haiku 4.5')
    expect(h45.log).toBe('model-guard: headless session on Haiku 4.5 blocked')
    expect(decideShell({ tool: 'Bash', command: 'claude --model claude-haiku-5-5 --cloud x' }, ctx(budget(40))).action).toBe('allow')
  })

  test('estimatePoints counts a haiku agent as 0.05 of a Sonnet one', () => {
    expect(modelFamily('claude-haiku-5-5')).toBe('haiku')
    expect(Math.round(estimatePoints({ haiku: 20 }, 1)! * 1000)).toBe(1000)
    expect(Math.round(estimatePoints({ haiku: 20, sonnet: 1, opus: 1, fable: 1 }, 2)! * 1000)).toBe(18000)
    expect(estimatePoints({ haiku: 1 }, 0)).toBeNull()
  })
})

describe('budget texts (D10, 5-hour banked)', () => {
  test('the red reason names a redemption only with a counted weekly reset and use at or past 100 - reserve', () => {
    const banked = planFromOption('Max 5x · reserve 15% · banked: weekly reset, expires 2026-10-30')
    expect((launchGate(ctx(budget(80))) as any).deny).not.toContain('redeem')
    // Red by pace (84% used, the banked reset lifts the pace to about 56) but under 100 - reserve.
    expect((launchGate(ctx(budget(84, banked))) as any).deny).not.toContain('redeem')
    expect((launchGate(ctx(budget(90, banked))) as any).deny).toContain('A weekly reset is banked and at least 2 days are left')
    const expired = planFromOption('Max 5x · reserve 15% · banked: weekly reset, expires 2026-10-01')
    expect((launchGate(ctx(budget(90, expired))) as any).deny).not.toContain('redeem')
  })

  test('a paused window offers a banked 5-hour reset only while the week is green', () => {
    expect((launchGate(ctx(budget(40, null, 95), { fiveHourBanked: true })) as any).deny).toContain('A 5-hour reset is banked')
    expect((launchGate(ctx(budget(40, null, 95))) as any).deny).not.toContain('5-hour reset is banked')
    expect((launchGate(ctx(budget(60, null, 95), { fiveHourBanked: true })) as any).deny).not.toContain('5-hour reset is banked')
    expect(fiveHourBanked(planFromOption('Max 20x · banked: 5-hour reset, no expiry'), NOW)).toBe(true)
    expect(fiveHourBanked(planFromOption('Max 20x · banked: 5-hour reset, expires 2026-10-01'), NOW)).toBe(false)
    expect(fiveHourBanked(planFromOption('Max 20x · banked: weekly reset, expires 2026-10-30'), NOW)).toBe(false)
    expect(fiveHourBanked(null, NOW)).toBe(false)
  })
})

describe('workflow runs admitted under redPolicy warn', () => {
  test('record the plan width, not Red\'s 0', () => {
    const d: any = decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf', agentIndex: 1 } }, ctx(budget(80), { redPolicy: 'warn' }), undefined)
    expect(d).toMatchObject({ action: 'allow', admit: true, startRun: { width: 8, name: 'Max 5x' } })
    const pro: any = decideWorkflowAgent({ model: 'sonnet', workflow: { runId: 'wf', agentIndex: 1 } }, ctx(budget(80, planFromOption('Pro')), { redPolicy: 'warn' }), undefined)
    expect(pro.startRun).toEqual({ width: 4, name: 'Pro' })
  })
})

describe('indirect launches: claude run by Start-Process or cmd start is refused, its arguments never read', () => {
  // The reviewer's inputs: an apostrophe, an escaped quote with backticks, a backslash before a quote, an array.
  const REVIEWER = [
    `Start-Process claude -ArgumentList "Fix the user's login","--cloud","--model","fable"`,
    "Start-Process claude -ArgumentList '\\\"fix `parseArgs`\\\"','--cloud','--model','fable'",
    `Start-Process claude -ArgumentList '--add-dir "C:\\My Proj\\\\"','--cloud','--model','fable'`,
    "Start-Process claude -ArgumentList @('--cloud','x')",
  ]
  const INDIRECT = [
    ...REVIEWER,
    // What the arguments hold does not matter: cloud with or without a model, a follow-up, a resume, -p, --version.
    "Start-Process claude -ArgumentList '--cloud','task'",
    "Start-Process claude -ArgumentList '--model','opus','--cloud','task'",
    "Start-Process claude -ArgumentList '--cloud','\"fix the -p flag parsing\"'",
    "Start-Process claude -ArgumentList '-p','x','--cloud','session_1'",
    `Start-Process claude -ArgumentList "-p","what's","--cloud","cse_1"`,
    "Start-Process claude -ArgumentList '--resume','abc','-p','x'",
    "Start-Process claude -ArgumentList '-p','do it'",
    "Start-Process claude -ArgumentList '--version'",
    `Start-Process claude -WorkingDirectory "C:\\Users\\O'Neil\\proj" -ArgumentList '--cloud','task'`,
    // The program named by -FilePath (any prefix, the colon form) or as the first positional word.
    'Start-Process -FilePath claude.exe -ArgumentList "--model fable --cloud task"',
    "Start-Process -NoNewWindow -Wait -File 'C:\\Tools\\claude.exe' -ArgumentList '--cloud'",
    'Start-Process -FilePath:"C:\\Tools\\claude.cmd"',
    "Start-Process -ArgumentList @('--cloud','x') -FilePath claude",
    "Start-Process -ArgumentList '--cloud', 'x' -WindowStyle Hidden claude",
    "Start-Process (Get-Command claude).Source -ArgumentList '--cloud'",
    "Start-Process `\n  -FilePath claude `\n  -ArgumentList '--cloud','x'",
    "saps claude -ArgumentList '--cloud','x'",
    // cmd's start, its window title and switches, nested in cmd /c or pwsh -Command, among other commands.
    'start claude --cloud x',
    'start "" claude --cloud x',
    'start "worker" /D C:\\repo /MIN claude.exe --cloud x',
    'cmd /c start "" claude --cloud x',
    "pwsh -Command \"Start-Process claude -ArgumentList '--cloud','x'\"",
    "cd repo; Start-Process claude -ArgumentList '--cloud','x'; echo started",
    // After the program word the words are claude's own: its -p is no prefix of -Path (the Bash tool's
    // start is cmd's). Only a -FilePath of two letters or more is still read there, as PowerShell binds it.
    'start claude -p x --model fable',
    'cmd /c start claude -p x --model fable',
    'start "" claude -p "m" --cloud s',
    'start /b claude -p x',
    'start claude --bg -p x',
    'Start-Process claude -p x',
    'bash -lc "start claude -p x"',
    'Start-Process notepad -FilePath claude',
    'Start-Process notepad -File claude',
    // `-Name:` before a space takes the next word; -vb, -db, -cf are switches; a hashtable is one value.
    "Start-Process -FilePath: claude -ArgumentList '-p','x','--model','fable'",
    "Start-Process -ArgumentList: '--cloud', 'x' claude",
    "Start-Process -Wait: $true claude -ArgumentList '--cloud','x'",
    "Start-Process -vb claude -ArgumentList '--cloud','x'",
    "Start-Process -db claude -ArgumentList '--cloud','x'",
    "Start-Process -cf claude -ArgumentList '--cloud','x'",
    "Start-Process -Environment @{ A = 'b' } claude -ArgumentList '--cloud','x'",
    "Start-Process -Environment @{A='b';C='d'} claude -ArgumentList '--cloud','x'",
    // A hashtable whose braces stand alone, with `;` or newlines inside it.
    "Start-Process -Environment @{ A = 'b'; C = 'd' } claude -ArgumentList '--cloud','x'",
    "Start-Process -Environment @{\n  A = 'b'\n  C = 'd'\n} claude -ArgumentList '--cloud','x'",
    // A bare path cannot be told from claude.exe, and a file:// URL runs it.
    'start D:\\x\\claude',
    'Start-Process file:///C:/Tools/claude.exe',
  ]
  const MENTIONS = [
    "git commit -F - <<'EOF'\nStart-Process claude -ArgumentList '--cloud','x'\nEOF",
    "git commit -m \"$(cat <<'EOF'\nfix: refuse Start-Process claude\n\nStart-Process claude -ArgumentList '--cloud'\nEOF\n)\"",
    "@'\nStart-Process claude -ArgumentList '--cloud','x'\n'@ | Set-Content notes.md",
    'git commit -m "docs: never Start-Process claude --cloud"',
    "gh pr create --title t --body 'run Start-Process claude -ArgumentList --cloud'",
    "Write-Output 'Start-Process claude --cloud x'",
    'echo Start-Process claude',
    "git commit -m 'start claude'",
    "git commit -F - <<'EOF'\nstart claude -p x\nEOF",
  ]
  const OTHER_PROGRAMS = [
    'Start-Process notepad',
    'Start-Process notepad claude',
    'Start-Process -FilePath notepad claude.exe',
    'Start-Process code D:\\Progetti\\claude',
    'Start-Process -WorkingDirectory D:\\claude notepad',
    'start "" notepad claude',
    "Start-Process notepad -ArgumentList 'claude'",
    'start chrome https://claude.ai',
    'start notepad -p claude',
    'npm start',
    'pm2 start claude',
    'docker start claude',
    // A URL or a folder is not claude.
    'Start-Process https://www.anthropic.com/claude',
    'Start-Process -FilePath https://www.anthropic.com/claude',
    'start https://claude.ai/claude',
    'Start-Process D:\\x\\claude\\',
  ]
  const COLORS: [string, any, any?][] = [
    ['green', budget(40)], ['red', budget(80)], ['red with redPolicy warn', budget(80), { redPolicy: 'warn' }],
    ['paused', budget(40, null, 95)], ['unknown', budget(null)], ['Solo', budget(60, planFromOption('Pro'))],
  ]

  test('scanShell sees each one as an indirect launch', () => {
    for (const c of INDIRECT) expect(scanShell(c), c).toEqual([{ kind: 'indirect' }])
  })

  test('decideShell denies each one in every color with the run-it-directly reason', () => {
    for (const [color, b, extra] of COLORS) {
      for (const command of INDIRECT) {
        const d: any = decideShell({ tool: 'PowerShell', command }, ctx(b, extra))
        expect(d.action, color + ': ' + command).toBe('deny')
        expect(d.reason).toContain('model-guard does not read claude launches started through Start-Process (start, saps) or cmd\'s start')
        expect(d.reason).toContain('Run the same launch directly as a claude command; start a new cloud session from a real terminal tab (cloud-worker).')
        expect(d.input).toBeUndefined()
        expect(d).toMatchObject({ log: 'model-guard: claude launch through Start-Process or start blocked, run it directly', to: 'transcript' })
      }
    }
    expect(decideShell({ tool: 'PowerShell', command: REVIEWER[0] }, ctx(budget(40), { lang: 'it' })).log).toContain('va lanciato direttamente')
  })

  test('the reviewer\'s inputs are all denied', () => {
    for (const command of REVIEWER) {
      for (const b of [budget(40), budget(80), budget(40, null, 95)]) expect(decideShell({ tool: 'PowerShell', command }, ctx(b)).reason).toContain('Run the same launch directly')
    }
  })

  test('next to a direct launch the whole command is denied, never rewritten', () => {
    const d: any = decideShell({ tool: 'PowerShell', command: "claude --cloud a; Start-Process claude -ArgumentList '--cloud','b'" }, ctx(budget(40)))
    expect(d.action).toBe('deny')
    expect(d.reason).toContain('Run the same launch directly')
  })

  test('mentions in heredocs, here-strings and quoted text pass in every color', () => {
    for (const [, b, extra] of COLORS) {
      for (const command of MENTIONS) {
        expect(scanShell(command), command).toEqual([])
        expect(decideShell({ tool: 'PowerShell', command }, ctx(b, extra)).action).toBe('allow')
      }
    }
  })

  test('Start-Process of other programs passes, even when claude is one of their arguments', () => {
    for (const command of OTHER_PROGRAMS) {
      expect(scanShell(command), command).toEqual([])
      expect(decideShell({ tool: 'PowerShell', command }, ctx(budget(80))).action).toBe('allow')
    }
  })
})

describe('line continuations join lines (backslash in Bash, backtick in PowerShell)', () => {
  test('a launch broken over lines is one launch, rewritten in place', () => {
    for (const [command, out] of [
      ['claude \\\n  --cloud "fix the bug"', 'claude --model sonnet \\\n  --cloud "fix the bug"'],
      ['claude `\n  --cloud "x"', 'claude --model sonnet `\n  --cloud "x"'],
      ['claude `\r\n  --cloud "x"', 'claude --model sonnet `\r\n  --cloud "x"'],
    ]) {
      expect(scanShell(command), command).toEqual([expect.objectContaining({ kind: 'cloud', hasModel: false, insertAt: 6 })])
      expect((decideShell({ tool: 'Bash', command }, ctx(budget(40))) as any).input.command).toBe(out)
    }
  })

  test('a Fable --model on a continuation line is denied', () => {
    const d: any = decideShell({ tool: 'Bash', command: 'claude --cloud \\\n  --model fable "task"' }, ctx(budget(40)))
    expect(d.action).toBe('deny')
    expect(d.reason).toContain('Cloud sessions never run Fable')
  })

  test('a follow-up to a cloud session split over lines is open work: allowed while red', () => {
    const command = 'claude -p "address the review comment" \\\n  --cloud cse_123'
    expect(scanShell(command)).toEqual([])
    expect(decideShell({ tool: 'Bash', command }, ctx(budget(80))).action).toBe('allow')
  })
})

describe('launches behind wrappers, in loop and if bodies, brace groups and script blocks', () => {
  // [command, the same command with --model sonnet added after the claude word]
  const WRAPPED = [
    ['timeout 600 claude --cloud "x"', 'timeout 600 claude --model sonnet --cloud "x"'],
    ['gtimeout -s KILL -k 5 60 claude -p x', 'gtimeout -s KILL -k 5 60 claude --model sonnet -p x'],
    ['timeout --signal=TERM 10m claude -p x', 'timeout --signal=TERM 10m claude --model sonnet -p x'],
    ['caffeinate -is claude -p hi', 'caffeinate -is claude --model sonnet -p hi'],
    ['caffeinate -t 3600 claude -p hi', 'caffeinate -t 3600 claude --model sonnet -p hi'],
    ['nice claude -p hi', 'nice claude --model sonnet -p hi'],
    ['nice -n 10 claude -p hi', 'nice -n 10 claude --model sonnet -p hi'],
    ['nohup claude -p hi &', 'nohup claude --model sonnet -p hi &'],
    ['setsid claude -p hi', 'setsid claude --model sonnet -p hi'],
    ['stdbuf -o L claude -p hi', 'stdbuf -o L claude --model sonnet -p hi'],
    ['stdbuf -oL claude -p hi', 'stdbuf -oL claude --model sonnet -p hi'],
    ['time -p claude -p hi', 'time -p claude --model sonnet -p hi'],
    ['env -i claude -p hi', 'env -i claude --model sonnet -p hi'],
    ['env -u FOO claude --cloud "x"', 'env -u FOO claude --model sonnet --cloud "x"'],
    ['env -C /tmp FOO=1 claude -p hi', 'env -C /tmp FOO=1 claude --model sonnet -p hi'],
    ['sudo -E claude --cloud x', 'sudo -E claude --model sonnet --cloud x'],
    ['sudo -u x claude -p hi', 'sudo -u x claude --model sonnet -p hi'],
    ['sudo -u x -g staff -- claude -p hi', 'sudo -u x -g staff -- claude --model sonnet -p hi'],
    ['xargs -I{} claude -p {}', 'xargs -I{} claude --model sonnet -p {}'],
    ['xargs -I {} claude -p {}', 'xargs -I {} claude --model sonnet -p {}'],
    ['cat l | xargs -n1 -P 4 claude -p', 'cat l | xargs -n1 -P 4 claude --model sonnet -p'],
    ['command claude -p hi', 'command claude --model sonnet -p hi'],
    ['exec -a w claude -p hi', 'exec -a w claude --model sonnet -p hi'],
    ['watch claude -p hi', 'watch claude --model sonnet -p hi'],
    ['watch -n 5 claude -p hi', 'watch -n 5 claude --model sonnet -p hi'],
    ['sudo -E timeout 60 nice -n 5 claude -p hi', 'sudo -E timeout 60 nice -n 5 claude --model sonnet -p hi'],
    ['! claude -p x', '! claude --model sonnet -p x'],
    ['for t in a b; do claude -p "$t"; done', 'for t in a b; do claude --model sonnet -p "$t"; done'],
    ['if true; then claude --cloud "x"; fi', 'if true; then claude --model sonnet --cloud "x"; fi'],
    ['if false; then :; else claude -p x; fi', 'if false; then :; else claude --model sonnet -p x; fi'],
    ['if a; then b; elif c; then claude -p x; fi', 'if a; then b; elif c; then claude --model sonnet -p x; fi'],
    ['while read t; do claude -p "$t"; done < list', 'while read t; do claude --model sonnet -p "$t"; done < list'],
    ['{ claude --cloud "x"; }', '{ claude --model sonnet --cloud "x"; }'],
    ['1..3 | ForEach-Object { claude -p "t $_" }', '1..3 | ForEach-Object { claude --model sonnet -p "t $_" }'],
    ['1..3 | %{claude -p "t $_"}', '1..3 | %{claude --model sonnet -p "t $_"}'],
    ['foreach ($t in $list) { claude -p $t }', 'foreach ($t in $list) { claude --model sonnet -p $t }'],
    ['Invoke-Command -ScriptBlock { claude -p x }', 'Invoke-Command -ScriptBlock { claude --model sonnet -p x }'],
    ['npx -y @anthropic-ai/claude-code -p hi', 'npx -y @anthropic-ai/claude-code --model sonnet -p hi'],
    ['bunx @anthropic-ai/claude-code@latest -p hi', 'bunx @anthropic-ai/claude-code@latest --model sonnet -p hi'],
    ['npx -p @anthropic-ai/claude-code claude -p hi', 'npx -p @anthropic-ai/claude-code claude --model sonnet -p hi'],
  ]

  test('each one is found and gets --model sonnet in place in green', () => {
    for (const [command, out] of WRAPPED) {
      expect(scanShell(command).length, command).toBe(1)
      const d: any = decideShell({ tool: 'Bash', command }, ctx(budget(40)))
      expect(d.action, command).toBe('rewrite')
      expect(d.input.command).toBe(out)
    }
  })

  test('each one is denied while red, and with --model fable', () => {
    for (const [command, out] of WRAPPED) {
      expect(decideShell({ tool: 'Bash', command }, ctx(budget(80))).reason, command).toContain('Budget red')
      const fable = out.replace('--model sonnet', '--model fable')
      expect(decideShell({ tool: 'Bash', command: fable }, ctx(budget(40))).reason, fable).toMatch(/never run Fable/)
    }
  })

  test('a mention in quoted text still holds no launch', () => {
    for (const command of [
      'echo "claude -p x"', "printf '%s\\n' 'claude --cloud x'", 'grep -rn "claude --cloud" .', 'cat claude.md',
      'echo claude', 'git log --grep "claude -p"', '$x -replace "a","b"', 'Get-Content C:\\s\\launch.ps1', 'cat launch.ps1',
    ]) {
      expect(scanShell(command), command).toEqual([])
      expect(decideShell({ tool: 'Bash', command }, ctx(budget(80))).action).toBe('allow')
    }
  })
})

describe('nested scripts are read; no edit in place: a missing --model is denied, never a silent pass', () => {
  const NESTED = [
    'eval "claude -p x"',
    'eval claude -p x',
    'iex "claude -p x"',
    'Invoke-Expression -Command "claude -p x"',
    "@'\nclaude -p x\n'@ | iex",
    '"claude -p x" | Invoke-Expression',
    "bash <<'EOF'\nclaude --cloud \"x\"\nEOF",
    'sh -s <<EOF\nclaude --cloud x\nEOF',
    "cat <<'EOF' | bash\nclaude -p x\nEOF",
    'echo "claude -p x" | sh',
    'bash <<< "claude -p x"',
    'X="$(claude --cloud x)"',
    'echo "result: $(claude -p x)"',
    'echo "`claude -p x`"',
    'echo `claude -p x` done',
    'tmux new -d "claude -p hi"',
    'tmux send-keys -t w "claude -p hi" Enter',
    'screen -dmS w bash -c "claude -p hi"',
    'ssh host "claude -p x"',
    "parallel 'claude -p {}' ::: a b",
    "find . -exec sh -c 'claude -p x' \;",
    'script -q -c "claude -p hi" /dev/null',
    'watch -n 5 "claude -p hi"',
    'env -S "claude -p x"',
    `osascript -e 'do shell script "claude -p hi"'`,
    `osascript -e 'tell application "Terminal" to do script "claude --cloud x"'`,
  ]

  test('each one is found with insertAt null', () => {
    for (const command of NESTED) {
      const found = scanShell(command)
      expect(found.length, command).toBeGreaterThan(0)
      for (const l of found) expect(l, command).toMatchObject({ insertAt: null })
    }
  })

  test('denied in green without --model; with a model named it goes through the gate', () => {
    for (const command of NESTED) {
      const d: any = decideShell({ tool: 'Bash', command }, ctx(budget(40)))
      expect(d.action, command).toBe('deny')
      expect(d.reason).toContain('inside a nested shell script without --model')
    }
    const named = 'eval "claude --model sonnet -p x"'
    expect(decideShell({ tool: 'Bash', command: named }, ctx(budget(40))).action).toBe('allow')
    expect(decideShell({ tool: 'Bash', command: named }, ctx(budget(80))).action).toBe('deny')
    expect(decideShell({ tool: 'Bash', command: "bash <<'EOF'\nclaude --model fable -p x\nEOF" }, ctx(budget(40))).reason).toContain('never run Fable')
  })

  test('a substitution inside a nested shell script is read once, with the script (rewritten in place)', () => {
    const d: any = decideShell({ tool: 'Bash', command: 'bash -c "echo $(claude -p x)"' }, ctx(budget(40)))
    expect(d.input.command).toBe('bash -c "echo $(claude --model sonnet -p x)"')
  })

  test('scripts nested past 3 levels that name claude are unparsed', () => {
    let command = 'claude -p x'
    for (let n = 0; n < 4; n++) command = 'eval "' + command.replace(/["\\]/g, '\\$&') + '"'
    expect(scanShell(command)).toEqual([{ kind: 'unparsed' }])
  })

  test('a heredoc fed to a program that is not a shell stays data', () => {
    expect(scanShell("cat <<'EOF' > brief.md\nclaude -p x\nEOF")).toEqual([])
    expect(scanShell("cat <<'EOF' | tee brief.md\nclaude -p x\nEOF")).toEqual([])
  })
})

describe('a claude word after a program that never runs it is data, in every color', () => {
  const DATA = [
    'echo claude --cloud x', 'git log --grep claude -p', 'git log -S claude -p', 'git log --author claude -p',
    'git grep -n claude -p', 'ls claude -p', 'cat notes/claude -p', 'which claude -p', 'echo hello # claude -p',
    'grep claude -r . --bg', 'cd x # claude -p', 'git.exe log --grep claude -p', 'gh issue create -t claude -p roadmap',
  ]
  test('none is a launch, and each one passes green and red', () => {
    for (const command of DATA) {
      expect(scanShell(command), command).toEqual([])
      for (const b of [budget(40), budget(80)]) expect((decideShell({ tool: 'Bash', command }, ctx(b)) as any).action, command).toBe('allow')
    }
  })
  test('a pipe into a shell still reads the echoed launch', () => {
    expect(scanShell('echo claude -p x | sh')).toEqual([expect.objectContaining({ kind: 'local' })])
  })
})

describe('fail closed: a claude word with a launch flag model-guard cannot read is denied', () => {
  const UNPARSED = [
    'screen -dmS w claude -p hi',
    'tmux new-session -d -s w claude -p hi',
    'script -q /dev/null claude -p hi',
    'find . -exec claude -p hi \;',
    'parallel claude -p ::: a b',
    'git bisect run claude -p x',
    'git rebase -x claude -p',
    'cmd /c "mystery # claude -p x"',
    'mystery <# c #> claude -p x',
    '/opt/tools/run claude --bg x',
    'mystery-wrapper claude ultrareview',
    '$CLAUDE -p x',
    '"$CLAUDE" --cloud x',
    '${CLAUDE_BIN:-claude} -p x',
    '`which claude` -p x',
    '$(which claude) -p x',
    "& C:\\s\\launch.ps1 -ExeArgs @('-p') t none l fable",
  ]
  const COLORS: [string, any, any?][] = [
    ['green', budget(40)], ['red with redPolicy warn', budget(80), { redPolicy: 'warn' }], ['unknown', budget(null)],
  ]

  test('each one is unparsed and denied in every color with the run-it-directly reason', () => {
    for (const command of UNPARSED) {
      expect(scanShell(command), command).toContainEqual({ kind: 'unparsed' })
      for (const [color, b, extra] of COLORS) {
        const d: any = decideShell({ tool: 'Bash', command }, ctx(b, extra))
        expect(d.action, color + ': ' + command).toBe('deny')
        expect(d.reason).toContain('Run claude directly as the command word with --model')
        expect(d.log).toBe('model-guard: claude with -p, --cloud or --bg where model-guard cannot read it, blocked: run claude directly with --model')
      }
    }
    expect(decideShell({ tool: 'Bash', command: UNPARSED[0] }, ctx(budget(40), { lang: 'it' })).log).toContain('va lanciato claude direttamente con --model')
  })

  test('tmux, screen, script, find -exec, parallel, osascript, -pc and $VAR -p are never allowed silently', () => {
    for (const command of [
      'tmux new -d "claude -p hi"', 'tmux new -s w claude -p hi', 'screen -dm claude -p hi', 'script -q /dev/null claude -p hi',
      'find . -exec claude -p hi \;', 'parallel claude -p ::: a', `osascript -e 'do shell script "claude -p hi"'`,
      'claude -pn w "task"', '$VAR -p x',
    ]) {
      expect(scanShell(command).length, command).toBeGreaterThan(0)
      expect(decideShell({ tool: 'Bash', command }, ctx(budget(40))).action, command).not.toBe('allow')
    }
    // Grouped short flags are read one by one: -pc is -p with --continue, a resume of open work.
    expect(scanShell('claude -pc "go on"')).toEqual([expect.objectContaining({ kind: 'resume' })])
    expect(claudeLaunch(['-pc', 'go on'])).toBe('resume')
  })
})

describe('review round: redirections with &, bash -c --, and quoted claude words', () => {
  test('a redirection holding & or | before the flags keeps the launch whole: budget gate, --model, Fable check', () => {
    expect(scanShell('claude 2>&1 -p "x" --model fable')).toEqual([{ kind: 'local', hasModel: true, model: 'fable', insertAt: 6 }])
    expect(scanShell('claude 2>&1 --cloud "task" --model fable')).toEqual([{ kind: 'cloud', hasModel: true, model: 'fable', insertAt: 6 }])
    expect(scanShell('claude &>log -p x --model fable')).toEqual([{ kind: 'local', hasModel: true, model: 'fable', insertAt: 6 }])
    expect(scanShell('claude >/dev/null 2>&1 "fix the bug"')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6 }])
    expect(scanShell('claude >| log "fix the bug"')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6 }])
    expect(scanShell('claude &> log "fix the bug"')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6 }])
    for (const c of ['claude 2>&1 -p "x" --model fable', 'claude 2>&1 --cloud "task" --model fable', 'claude &>log -p x --model fable']) {
      expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(40))).reason, c).toContain('never run Fable')
      expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(80))).reason, c).toContain('Budget red')
    }
    const green: any = decideShell({ tool: 'Bash', command: 'claude >/dev/null 2>&1 "fix the bug"' }, ctx(budget(40)))
    expect(green.input.command).toBe('claude --model sonnet >/dev/null 2>&1 "fix the bug"')
    // The target of `&>`, `>&` and `>|` in the next word is no prompt: a bare claude stays no launch.
    for (const c of ['claude &> log', 'claude >& log', 'claude >| log', 'claude 2>&1 > log']) expect(scanShell(c), c).toEqual([])
    // A lone & still runs the next command in the background.
    expect(scanShell('echo hi & claude -p x')).toEqual([expect.objectContaining({ kind: 'local' })])
  })

  test('bash -c reads past -- and its options to the script', () => {
    expect(scanShell('bash -c -- "claude --cloud x --model fable"')).toEqual([{ kind: 'cloud', hasModel: true, model: 'fable', insertAt: 18 }])
    expect(decideShell({ tool: 'Bash', command: 'bash -c -- "claude --cloud x --model fable"' }, ctx(budget(40))).reason).toContain('never run Fable')
    expect(decideShell({ tool: 'Bash', command: 'bash -c -- "claude --cloud x --model fable"' }, ctx(budget(80))).reason).toContain('Budget red')
    for (const [c, out] of [
      ['sh -c -- "claude -p x"', 'sh -c -- "claude --model sonnet -p x"'],
      ['zsh -c -e "claude -p x"', 'zsh -c -e "claude --model sonnet -p x"'],
      ['bash -c -o pipefail "claude -p x"', 'bash -c -o pipefail "claude --model sonnet -p x"'],
    ]) {
      expect(scanShell(c), c).toEqual([expect.objectContaining({ kind: 'local', hasModel: false })])
      expect((decideShell({ tool: 'Bash', command: c }, ctx(budget(40))) as any).input.command, c).toBe(out)
      expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(80))).action, c).toBe('deny')
    }
  })

  test('a shell whose script holds no launch while the words it may run as "$@" do is unparsed', () => {
    expect(scanShell(`sh -c 'exec "$@"' sh claude -p x`)).toEqual([{ kind: 'unparsed' }])
    expect(scanShell('bash -c "$CMD" claude -p x')).toEqual([{ kind: 'unparsed' }])
    expect(decideShell({ tool: 'Bash', command: `sh -c 'exec "$@"' sh claude -p x` }, ctx(budget(40))).action).toBe('deny')
    expect(scanShell('bash -c "echo hi" x y')).toEqual([])
  })

  test('a quoted claude word is text: git log -S "claude" -p, grep "claude" -p pass', () => {
    for (const c of ['git log -S "claude" -p', 'git log --author "claude" -p', 'grep -rn "claude" -p .', "rg 'claude' -p", 'git log -S "/usr/bin/claude" --print']) {
      expect(scanShell(c), c).toEqual([])
      for (const w of [40, 80]) expect(decideShell({ tool: 'Bash', command: c }, ctx(budget(w))).action, c).toBe('allow')
    }
    // Unquoted behind a program that may run it, the same word may be the program: denied with the
    // run-it-directly reason. (Behind git log it is data: see the data-command tests.)
    const d: any = decideShell({ tool: 'Bash', command: 'mystery-run -S claude -p' }, ctx(budget(40)))
    expect(d.action).toBe('deny')
    expect(d.reason).toContain('the unquoted word claude')
  })
})

describe('headless by redirection: a prompt word from the Bash, PowerShell or Monitor tool runs without a terminal', () => {
  test('claude "<prompt>" is a local launch: --model sonnet in green, denied while red, Fable and haiku denied', () => {
    expect(scanShell('claude "fix the ticket"')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6 }])
    const green: any = decideShell({ tool: 'Bash', command: 'claude "fix the ticket" > out.txt' }, ctx(budget(40)))
    expect(green.input.command).toBe('claude --model sonnet "fix the ticket" > out.txt')
    expect(decideShell({ tool: 'Bash', command: 'claude "x"' }, ctx(budget(80))).reason).toContain('Budget red')
    expect(decideShell({ tool: 'Bash', command: 'claude --model fable "fix the ticket" > out.txt' }, ctx(budget(40))).reason).toContain('never run Fable')
    expect(decideShell({ tool: 'PowerShell', command: 'claude --model haiku "x" | tee log' }, ctx(budget(40))).reason).toContain('the bare haiku alias')
  })

  test('options and their values are skipped to find the prompt', () => {
    for (const c of ['claude --worktree w "x" &', 'claude --effort high --permission-mode plan "x"', 'claude --add-dir ../x "fix"', 'claude -- "x"', 'claude 2>/dev/null "x"']) {
      expect(scanShell(c), c).toEqual([expect.objectContaining({ kind: 'local' })])
    }
    for (const c of ['claude -c "keep going"', 'claude --resume abc "go on"', 'claude --from-pr 12 "x"']) {
      expect(scanShell(c), c).toEqual([expect.objectContaining({ kind: 'resume' })])
    }
  })

  test('no prompt, a management subcommand, --version or --help stay as they were', () => {
    for (const c of ['claude', 'claude --resume abc', 'claude -c', 'claude > out.txt', 'claude --debug api', 'claude --version', 'claude plugin list', 'claude ultrareview --help']) {
      expect(scanShell(c), c).toEqual([])
    }
  })
})

describe('--fallback-model and unreadable --model values', () => {
  test('a forbidden --fallback-model is denied like --model, each comma-separated name', () => {
    const local: any = decideShell({ tool: 'Bash', command: 'claude -p "x" --model sonnet --fallback-model fable' }, ctx(budget(40)))
    expect(local.action).toBe('deny')
    expect(local.reason).toContain('Headless and background sessions (claude -p, --bg) never run Fable (model-mix), not even as --fallback-model')
    expect(local.reason).toContain('--fallback-model sonnet')
    const cloud: any = decideShell({ tool: 'Bash', command: 'claude --cloud "task" --model sonnet --fallback-model haiku' }, ctx(budget(40)))
    expect(cloud.reason).toContain('Cloud sessions never run the bare haiku alias')
    expect(decideShell({ tool: 'Bash', command: 'claude -p x --model sonnet --fallback-model opus,claude-haiku-4-5' }, ctx(budget(40))).reason).toContain('Haiku 4.5')
    expect(decideShell({ tool: 'Bash', command: 'claude -p x --model sonnet --fallback-model=opus,claude-haiku-5-5' }, ctx(budget(40))).action).toBe('allow')
    expect(scanShell('claude -p x --fallback-model=sonnet,opus')).toEqual([{ kind: 'local', hasModel: false, model: null, insertAt: 6, fallback: ['sonnet', 'opus'] }])
  })

  test('an empty, missing or variable --model names no model, and is denied: --model sonnet would lose to it', () => {
    for (const c of ['claude --model= -p hi', 'claude -p hi --model', 'claude --cloud --model "$M" x', 'claude -p x --model `cat m`', 'claude --model -p x']) {
      expect(scanShell(c), c).toEqual([expect.objectContaining({ hasModel: false, model: null, modelUnread: true })])
      const d: any = decideShell({ tool: 'Bash', command: c }, ctx(budget(40)))
      expect(d.action, c).toBe('deny')
      expect(d.reason).toContain('Name the model literally')
      expect(d.log).toBe('model-guard: claude launch with an empty or variable --model, blocked')
    }
    expect(decideShell({ tool: 'Bash', command: 'claude -p hi --model' }, ctx(budget(40), { lang: 'it' })).log).toBe('model-guard: lancio di claude con un --model vuoto o variabile, bloccato')
  })

  test('the last --model wins, as in claude itself', () => {
    expect(scanShell('claude --model sonnet -p x --model fable')).toEqual([expect.objectContaining({ model: 'fable' })])
    expect(decideShell({ tool: 'Bash', command: 'claude --model sonnet -p x --model fable' }, ctx(budget(40))).action).toBe('deny')
  })
})

describe("cloud-worker's launch.ps1 is read like launch.exp", () => {
  const PS1 = 'powershell.exe -NoProfile -File "$HOME\\.claude\\skills\\cloud-worker\\launch.ps1"'

  test('the -File operand, & call, dot-sourcing and a pwsh -Command script; the model is the 4th positional or -Model', () => {
    for (const [command, model] of [
      [PS1 + ' task.txt none w.log fable high', 'fable'],
      ['& "C:\\s\\launch.ps1" task.txt none w.log haiku medium', 'haiku'],
      ['pwsh -ExecutionPolicy Bypass -File C:\\s\\launch.ps1 t none l sonnet high', 'sonnet'],
      ['. C:\\s\\launch.ps1 t none l opus', 'opus'],
      ['& C:\\s\\launch.ps1 -Ref main t none l fable', 'fable'],
      ['& C:\\s\\launch.ps1 t none l -Model fable', 'fable'],
      ['& C:\\s\\launch.ps1 t none l -mod:fable', 'fable'],
      ["& C:\\s\\launch.ps1 t none l -ExeArgs '-p', '--environment' fable", 'fable'],
      ['& C:\\s\\launch.ps1 t none l -Force -NoTty fable *> log.txt', 'fable'],
      ['& C:\\s\\launch.ps1 t none l', null],
      ["powershell -Command \"& 'C:\\s\\launch.ps1' t none l fable high\"", 'fable'],
    ] as [string, string | null][]) {
      expect(scanShell(command), command).toEqual([{ kind: 'launchExp', model, script: 'launch.ps1' }])
    }
  })

  test('a forbidden model is denied naming launch.ps1, red denies, Solo has no cloud slot, -DryRun launches nothing', () => {
    const d: any = decideShell({ tool: 'PowerShell', command: PS1 + ' task.txt none w.log fable high' }, ctx(budget(40)))
    expect(d.action).toBe('deny')
    expect(d.reason).toContain("launch.ps1's model argument (the 4th) is fable")
    expect(d.log).toBe('model-guard: launch.ps1 on fable blocked')
    expect(decideShell({ tool: 'PowerShell', command: PS1 + ' t none l fable' }, ctx(budget(40), { lang: 'it' })).log).toBe('model-guard: launch.ps1 con modello fable bloccato')
    const sonnet = PS1 + ' task.txt none w.log sonnet high'
    expect(decideShell({ tool: 'PowerShell', command: sonnet }, ctx(budget(40))).action).toBe('allow')
    expect(decideShell({ tool: 'PowerShell', command: sonnet }, ctx(budget(80))).reason).toContain('Budget red')
    expect(decideShell({ tool: 'PowerShell', command: sonnet }, ctx(budget(60, planFromOption('Pro')))).reason).toContain('no new cloud sessions')
    expect(decideShell({ tool: 'PowerShell', command: '& C:\\s\\launch.ps1 t none l $m' }, ctx(budget(40))).reason).toContain('Name the model literally')
    expect(scanShell(PS1 + ' t none l fable -DryRun')).toEqual([])
    expect(scanShell('& C:\\s\\launch.ps1 t none l fable -Dry')).toEqual([])
  })
})

describe('claude ultrareview is a cloud launch for the budget gate', () => {
  test('denied while red or paused, allowed in green; it names no model', () => {
    expect(scanShell('claude ultrareview 12')).toEqual([{ kind: 'ultrareview' }])
    expect(scanShell('claude --debug-file d.log ultrareview main')).toEqual([{ kind: 'ultrareview' }])
    expect(decideShell({ tool: 'Bash', command: 'claude ultrareview 12' }, ctx(budget(80))).reason).toContain('Budget red')
    expect(decideShell({ tool: 'Bash', command: 'claude ultrareview 12' }, ctx(budget(40, null, 95))).reason).toContain('Wait until')
    const green: any = decideShell({ tool: 'Bash', command: 'claude ultrareview 12' }, ctx(budget(40)))
    expect(green.action).toBe('allow')
    expect(green.input).toBeUndefined()
  })
})

// The shell parser is the same text in model-guard's rules.js and skill-router's routes.js. This corpus,
// with its expected output, is the same in both mods' tests: a change to one tokenizer fails here.
// Tokens are [value, start, end]; bodies are [segment, text].
const TOKENIZER_CORPUS: [string, any][] = [
  ["cd \"C:\\My Repo\" && claude --cloud 'fix it'; echo done | tee x", {
    segments: [[["cd", 0, 2], ["C:\\My Repo", 3, 15]], [["claude", 19, 25], ["--cloud", 26, 33], ["fix it", 34, 42]], [["echo", 44, 48], ["done", 49, 53]], [["tee", 56, 59], ["x", 60, 61]]],
    ends: ["&&", ";", "|", ""], subs: [], bodies: [],
  }],
  ["claude \\\n  --cloud \"fix the bug\"", {
    segments: [[["claude", 0, 6], ["--cloud", 11, 18], ["fix the bug", 19, 32]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["claude `\r\n --cloud \"x\"", {
    segments: [[["claude", 0, 6], ["--cloud", 11, 18], ["x", 19, 22]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["Start-Process `\n  -FilePath claude `\n  -ArgumentList '--cloud','x'", {
    segments: [[["Start-Process", 0, 13], ["-FilePath", 18, 27], ["claude", 28, 34], ["-ArgumentList", 39, 52], ["--cloud,x", 53, 66]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["for t in a b; do claude -p \"$t\"; done", {
    segments: [[["for", 0, 3], ["t", 4, 5], ["in", 6, 8], ["a", 9, 10], ["b", 11, 12]], [["do", 14, 16], ["claude", 17, 23], ["-p", 24, 26], ["$t", 27, 31]], [["done", 33, 37]]],
    ends: [";", ";", ""], subs: [], bodies: [],
  }],
  ["{ claude --cloud x; }", {
    segments: [[["claude", 2, 8], ["--cloud", 9, 16], ["x", 17, 18]]],
    ends: [";"], subs: [], bodies: [],
  }],
  ["1..3 | ForEach-Object { claude -p \"t $_\" }", {
    segments: [[["1..3", 0, 4]], [["ForEach-Object", 7, 21]], [["claude", 24, 30], ["-p", 31, 33], ["t $_", 34, 40]]],
    ends: ["|", "{", "}"], subs: [], bodies: [],
  }],
  ["%{claude -p x}", {
    segments: [[["%", 0, 1]], [["claude", 2, 8], ["-p", 9, 11], ["x}", 12, 14]]],
    ends: ["{", ""], subs: [], bodies: [],
  }],
  ["find . -exec claude -p {} \\;", {
    segments: [[["find", 0, 4], [".", 5, 6], ["-exec", 7, 12], ["claude", 13, 19], ["-p", 20, 22], ["{}", 23, 25], ["\\", 26, 27]]],
    ends: [";"], subs: [], bodies: [],
  }],
  ["echo ${HOME} @{u}", {
    segments: [[["echo", 0, 4], ["${HOME}", 5, 12], ["@{u}", 13, 17]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["X=\"$(claude --cloud x)\" && echo \"`date` and `n\"", {
    segments: [[["X=$(claude --cloud x)", 0, 23]], [["echo", 27, 31], ["`date` and `n", 32, 47]]],
    ends: ["&&", ""], subs: ["claude --cloud x", "date"], bodies: [],
  }],
  ["echo `claude -p x` done", {
    segments: [[["echo", 0, 4], ["`claude -p x`", 5, 18], ["done", 19, 23]]],
    ends: [""], subs: ["claude -p x"], bodies: [],
  }],
  ["git commit -m \"$(cat <<'EOF'\na \" b\nEOF\n)\" && echo ok", {
    segments: [[["git", 0, 3], ["commit", 4, 10], ["-m", 11, 13], ["$(cat <<'EOF'\na \" b\nEOF\n)", 14, 41]], [["echo", 45, 49], ["ok", 50, 52]]],
    ends: ["&&", ""], subs: ["cat <<'EOF'\na \" b\nEOF\n"], bodies: [],
  }],
  ["cat <<'EOF' | bash\nclaude --cloud x\nEOF\necho after", {
    segments: [[["cat", 0, 3]], [["bash", 14, 18]], [["echo", 40, 44], ["after", 45, 50]]],
    ends: ["|", "\n", ""], subs: [], bodies: [[0, "claude --cloud x\n"]],
  }],
  ["cat <<A <<B\nx\nA\ny\nB\n", {
    segments: [[["cat", 0, 3]]],
    ends: ["\n"], subs: [], bodies: [[0, "x\n"], [0, "y\n"]],
  }],
  ["@'\nclaude --cloud x\n'@ | iex", {
    segments: [[["claude --cloud x", 0, 22]], [["iex", 25, 28]]],
    ends: ["|", ""], subs: [], bodies: [],
  }],
  ["cat <<< \"claude -p x\"", {
    segments: [[["cat", 0, 3], ["<<<", 4, 7], ["claude -p x", 8, 21]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["claude 2>&1 -p x --model fable", {
    segments: [[["claude", 0, 6], ["2>&1", 7, 11], ["-p", 12, 14], ["x", 15, 16], ["--model", 17, 24], ["fable", 25, 30]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["claude &>log --cloud x", {
    segments: [[["claude", 0, 6], ["&>log", 7, 12], ["--cloud", 13, 20], ["x", 21, 22]]],
    ends: [""], subs: [], bodies: [],
  }],
  ["a <&3 >|f &>>g & b", {
    segments: [[["a", 0, 1], ["<&3", 2, 5], [">|f", 6, 9], ["&>>g", 10, 14]], [["b", 17, 18]]],
    ends: ["&", ""], subs: [], bodies: [],
  }],
  ["claude -p \"never closed", {
    segments: [[["claude", 0, 6], ["-p", 7, 9], ["never closed", 10, 23]]],
    ends: [""], subs: [], bodies: [],
  }],
]

describe('shared tokenizer corpus', () => {
  test('tokenizeFull gives the same segments, separators, substitutions and heredoc bodies in both mods', () => {
    for (const [command, want] of TOKENIZER_CORPUS) {
      const got = tokenizeFull(command)
      expect({
        segments: got.segments.map((s: any) => s.map((t: any) => [t.value, t.start, t.end])),
        ends: got.ends, subs: got.subs.map((s: any) => s.value), bodies: got.bodies.map((b: any) => [b.seg, b.value]),
      }, command).toEqual(want)
      expect(tokenize(command)).toEqual(got.segments)
    }
  })
})

describe('spawned agents run on the model they inherit', () => {
  const OK = { ok: true }
  const OLD = { ok: false, why: 'old' }
  const spawn = (extra: any) => ({ subagentType: 'general-purpose', parentModel: 'claude-opus-5-5', fork: false, ...extra })

  test('spawnModel: own model, fork, inheriting types, a literal inherit, and custom types', () => {
    expect(spawnModel(spawn({ model: 'sonnet' }))).toMatchObject({ model: 'sonnet', source: 'own' })
    expect(spawnModel(spawn({ fork: true, subagentType: 'fork', model: 'opus', parentModel: 'claude-fable-5-1' }))).toMatchObject({ model: 'claude-fable-5-1', source: 'fork' })
    expect(spawnModel(spawn({ subagentType: 'fork', parentModel: 'claude-fable-5-1' }))).toMatchObject({ source: 'fork' })
    expect(spawnModel(spawn({ model: 'Inherit', parentModel: 'claude-fable-5-1' }))).toMatchObject({ model: 'claude-fable-5-1', source: 'inherit' })
    expect(spawnModel(spawn({ subagentType: undefined }))).toMatchObject({ source: 'inherit' })
    expect(spawnModel(spawn({ subagentType: 'code-reviewer', parentModel: 'claude-fable-5-1' }))).toMatchObject({ model: 'claude-fable-5-1', source: 'definition' })
    expect(() => spawnModel(spawn({ model: 42 }))).toThrow()
  })

  test('decideSpawn: Fable through a fork, inheritance or a custom type is denied with the general-purpose opus advice', () => {
    for (const extra of [
      { fork: true, subagentType: 'fork' }, { model: undefined }, { model: 'inherit' }, { subagentType: 'code-reviewer' }, { model: 'fable' },
    ]) {
      const d: any = decideSpawn(spawn({ parentModel: 'claude-fable-5-1', ...extra }), ctx(budget(40), { haiku: OK }))
      expect(d.action, JSON.stringify(extra)).toBe('deny')
      expect(d.reason).toContain("subagent_type general-purpose with model: 'opus'")
    }
    expect(decideSpawn(spawn({ fork: true, subagentType: 'fork' }), ctx(budget(40))).action).toBe('allow')
    expect(decideSpawn(spawn({ subagentType: 'code-reviewer', model: 'sonnet', parentModel: 'claude-fable-5-1' }), ctx(budget(40))).action).toBe('allow')
    // Not gated on the budget: the Agent tool call is.
    expect(decideSpawn(spawn({ model: 'sonnet' }), ctx(budget(80))).action).toBe('allow')
  })

  test('decideSpawn: the haiku rules apply to the inherited model', () => {
    expect(decideSpawn(spawn({ fork: true, subagentType: 'fork', parentModel: 'claude-haiku-4-5' }), ctx(budget(40), { haiku: OK })).reason).toContain('never pins Haiku 4.5')
    expect(decideSpawn(spawn({ parentModel: 'haiku' }), ctx(budget(40), { haiku: OLD })).reason).toContain("inherit the session's haiku alias")
    expect(decideSpawn(spawn({ parentModel: 'haiku' }), ctx(budget(40), { haiku: OK })).action).toBe('allow')
    expect(decideSpawn(spawn({ parentModel: 'claude-haiku-5-5' }), ctx(budget(40), { haiku: OLD })).action).toBe('allow')
  })

  test('decideWorkflowAgent: a literal inherit and a custom type with no model inherit a Fable session; a named model passes', () => {
    const wf = (extra: any) => ({ parentModel: 'claude-fable-5-1', workflow: { runId: 'wf', agentIndex: 1 }, ...extra })
    expect(decideWorkflowAgent(wf({ model: 'inherit' }), ctx(budget(40)), undefined)).toMatchObject({ action: 'deny', reason: expect.stringContaining("would inherit the session's Fable") })
    expect(decideWorkflowAgent(wf({ subagentType: 'code-reviewer' }), ctx(budget(40)), undefined)).toMatchObject({ action: 'deny', reason: expect.stringContaining('may inherit') })
    expect(decideWorkflowAgent(wf({ subagentType: 'code-reviewer', model: 'sonnet' }), ctx(budget(40)), undefined).action).toBe('allow')
  })

  test('decideAgent leaves a fork named fable alone (a fork ignores model): the spawn judges it', () => {
    const d: any = decideAgent({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'fork', model: 'fable' }, ctx(budget(40)))
    expect(d.action).toBe('allow')
    expect(d.input).toBeUndefined()
  })
})

describe('a Workflow resume records the run it resumes', () => {
  test('startRun: today\'s profile, or the plan\'s own when today allows no workflow (red, Solo)', () => {
    const resume = { tool: 'Workflow', resumeFromRunId: 'wf_abc' }
    expect((decideWorkflow(resume, ctx(budget(80))) as any).startRun).toEqual({ width: 8, name: 'Max 5x' })
    expect((decideWorkflow(resume, ctx(budget(80, planFromOption('Max 20x')))) as any).startRun).toEqual({ width: 16, name: 'Max 20x' })
    expect((decideWorkflow(resume, ctx(budget(60, planFromOption('Pro')))) as any).startRun).toEqual({ width: 4, name: 'Pro' })
    expect((decideWorkflow(resume, ctx(budget(60, planFromOption('Max 20x')))) as any).startRun).toEqual({ width: 8, name: 'Max 5x' })
    expect((decideWorkflow({ tool: 'Workflow', name: 'review' }, ctx(budget(40))) as any).startRun).toBeUndefined()
  })
})

describe('paused 5-hour window: resumes wait too, and the reason says so', () => {
  test('the reason names resumes and keeps work in this session, never "finish open work"', () => {
    const d: any = decideWorkflow({ tool: 'Workflow', resumeFromRunId: 'wf_abc' }, ctx(budget(40, null, 95)))
    expect(d.reason).toContain('paused new launches and resumes')
    expect(d.reason).not.toContain('finish open work')
  })

  test('a local resume while red and paused at once is held for the window', () => {
    const d: any = decideShell({ tool: 'Bash', command: 'claude --resume abc -p "x"' }, ctx(budget(80, null, 95)))
    expect(d).toMatchObject({ action: 'deny', reason: expect.stringContaining('Wait until 13:00 UTC') })
  })

  test('without a reset time the line drops "until"', () => {
    const b: any = computeBudget({ rateLimits: [reading(40)[0], { kind: 'five_hour', percentUsed: 95 }], now: NOW, plan: null, inFlight: 0, readingAt: NOW })
    const g: any = launchGate(ctx(b, { lang: 'it' }))
    expect(g.log).toBe('model-guard: lancio bloccato, finestra 5 ore oltre il 90%')
  })
})

describe('RemoteTrigger body models', () => {
  test('bodyModels finds every text field named *model at any depth', () => {
    expect(bodyModels({ model: 'a', x: [{ default_model: 'b' }, { deep: { sessionModel: 'c', other: 'd' } }], model2: 'e' })).toEqual(['a', 'b', 'c'])
    expect(bodyModels(undefined)).toEqual([])
  })

  test('a forbidden model is denied like a cloud launch, after the gate; a create or run on Solo has no cloud slot', () => {
    expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action: 'create', body: { model: 'fable' } }, ctx(budget(40)))).toMatchObject({ action: 'deny', reason: expect.stringContaining('never run Fable') })
    expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action: 'update', body: { job: { model: 'claude-haiku-4-5' } } }, ctx(budget(40))).reason).toContain('Haiku 4.5')
    expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action: 'create', body: { model: 'claude-haiku-5-5' } }, ctx(budget(40))).action).toBe('allow')
    const solo = budget(60, planFromOption('Pro'))
    expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action: 'run', trigger_id: 't' }, ctx(solo)).reason).toContain('no new cloud sessions')
    expect(decideRemoteTrigger({ tool: 'RemoteTrigger', action: 'update', trigger_id: 't', body: { prompt: 'x' } }, ctx(solo)).action).toBe('allow')
  })
})

describe('banked weekly reset: redeem advice only with 2 days left', () => {
  const at = (hoursToReset: number, used: number) => [
    { kind: 'seven_day', percentUsed: used, resetsAt: new Date(NOW + hoursToReset * 60 * 60 * 1000).toISOString() },
    { kind: 'five_hour', percentUsed: 10, resetsAt: new Date(NOW + 60 * 60 * 1000).toISOString() },
  ]
  const red = (plan: any, hours: number) => launchGate(ctx(computeBudget({ rateLimits: at(hours, 90), now: NOW, plan, inFlight: 0, readingAt: NOW }))) as any
  const banked = planFromOption('Max 5x · reserve 15% · banked: weekly reset, expires 2026-10-30')

  test('with less than 2 days to the weekly reset there is no advice; with 2 or more there is', () => {
    expect(red(banked, 30).deny).not.toContain('redeem')
    expect(red(banked, 47).deny).not.toContain('redeem')
    expect(red(banked, 49).deny).toContain('ask the person to redeem it')
  })

  test('a banked weekly reset with no expiry date also gets the advice', () => {
    expect(red(planFromOption('Max 5x · reserve 15% · banked: weekly reset, no expiry'), 72).deny).toContain('ask the person to redeem it')
  })
})

describe('texts the person sees', () => {
  test('an out-of-date reading says so, not "no reading yet"', () => {
    const stale: any = computeBudget({ rateLimits: reading(40), now: NOW, plan: null, inFlight: 0, readingAt: NOW - 11 * 60 * 1000 })
    expect(stale.color).toBe('unknown')
    expect((launchGate(ctx(stale)) as any).note).toBe('model-guard: budget reading out of date, launch allowed')
    expect((launchGate(ctx(budget(null))) as any).note).toBe('model-guard: no budget reading yet, launch allowed')
  })

  test('an out-of-date reading never loosens the guard: red and yellow keep holding, only green turns unknown', () => {
    const old = (weekly: number, five = 10) => computeBudget({ rateLimits: reading(weekly, five), now: NOW, plan: null, inFlight: 0, readingAt: NOW - 60 * 60 * 1000 }) as any
    expect(old(80).color).toBe('red')
    expect((launchGate(ctx(old(80))) as any).deny).toContain('Budget red')
    expect(old(60).color).toBe('yellow')
    expect(old(60).profile.name).toBe('Pro')
    expect(old(40).color).toBe('unknown')
    expect(old(40, 95).pausedFiveHour).toBe(true)
    expect((launchGate(ctx(old(40, 95))) as any).deny).toContain('5-hour window')
  })

  test('Explore with its own effort is not logged as effort medium', () => {
    const d: any = decideAgent({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore', effort: 'high' }, ctx(budget(40), { haiku: { ok: true }, lang: 'it' }))
    expect(d.log).toBe('model-guard: Explore senza modello -> haiku')
  })

  test('a red over the reserve says so, to the model and to the person', () => {
    const b = budget(90)
    const g: any = launchGate(ctx(b, { lang: 'it' }))
    expect(g.deny).toContain('at or past the 85% reserve line')
    expect(g.log).toContain('oltre la riserva')
  })

  test('no tool names, option keys or failure kinds in the lines; the Red profile reads as the color', () => {
    expect(texts('it').failed).toBe('model-guard: controllo fallito, lancio bloccato')
    expect(texts('en').agentNoModel).toBe('model-guard: agent without a model -> sonnet')
    expect(texts('it').wfWidth({ name: 'Red', width: 0 })).toBe('model-guard: workflow oltre la larghezza 0 (rosso), altri agenti bloccati')
    expect((launchGate(ctx(budget(80), { redPolicy: 'warn', lang: 'it' })) as any).note).toContain('(solo segnalato)')
  })
})

// mods/model-guard/hooks/budget.js and mods/coordinator-lens/hooks/budget.js are one file kept in two mods:
// a mod cannot import outside its own folder, so neither test can read the other copy. Both mods' tests pin
// the same fingerprint instead: the source of every export, plus what the module computes for a fixed set of
// readings (which covers its private helpers and constants). After changing budget.js, copy it to the other
// mod and put the new fingerprint in both tests (the failure prints it).
describe('budget.js is the same file in model-guard and coordinator-lens', () => {
  const BUDGET_FINGERPRINT = '8183a090:15979'
  test('the fingerprint of budget.js matches the one pinned in both mods', () => {
    const at = Date.UTC(2026, 9, 7, 12, 0, 0)
    const h = 60 * 60 * 1000
    const limits = (weekly: number, five: number, weeklyHours = 100) => [
      { kind: 'seven_day', percentUsed: weekly, resetsAt: new Date(at + weeklyHours * h).toISOString() },
      { kind: 'five_hour', percentUsed: five, resetsAt: new Date(at + 2 * h).toISOString() },
    ]
    const plan = budgetModule.parsePlanLine('Claude plan: Max 20x · reserve 10% · banked: weekly reset, expires 2026-10-22; 5-hour reset')
    const probes = [
      ...[[17, 10], [45, 10], [60, 10], [95, 10], [17, 92], [40, 10, 6], [40, 10, -1]].map(([w, f, wh]) =>
        [0, 10, 11].map(ageMin => budgetModule.computeBudget({ rateLimits: limits(w, f, wh), now: at, plan, inFlight: 3, readingAt: at - ageMin * 60 * 1000 }))),
      budgetModule.computeBudget({ rateLimits: [], now: at, plan: null, inFlight: 0 }),
      ['Max 20x', 'Max 5x', 'Pro', 'Solo', 'x'].map(n => budgetModule.stepDown(n)),
      budgetModule.estimatePoints({ haiku: 20, sonnet: 1, opus: 1, fable: 1, other: 1 }, 2),
      ['claude-haiku-5-5', 'sonnet', 'opus', 'claude-fable-5-1', 'x'].map(m => budgetModule.modelFamily(m)),
    ]
    const mod = budgetModule as Record<string, unknown>
    const text = Object.keys(mod).sort()
      .map(k => k + '=' + (typeof mod[k] === 'function' ? String(mod[k]) : JSON.stringify(mod[k])))
      .join('\n') + '\n' + JSON.stringify(probes)
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
    expect(hash.toString(16).padStart(8, '0') + ':' + text.length).toBe(BUDGET_FINGERPRINT)
  })
})
