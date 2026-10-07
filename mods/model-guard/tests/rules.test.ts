import { describe, expect, test } from 'claude-code/testing'
import {
  claudeLaunch, decideAgent, decideRemoteTrigger, decideShell, decideWorkflow, decideWorkflowAgent, fiveHourBanked,
  forbiddenModel, haikuAlias, haikuKind, launchGate, parseVersion, planFromFiles, planFromOption, scanShell, statusText, tokenize,
} from '../hooks/rules.js'
import { computeBudget, estimatePoints, modelFamily } from '../hooks/budget.js'

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
    expect(scanShell('echo claude --cloud x')).toEqual([])
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
    expect(launchGate(ctx(budget(80), { redPolicy: 'warn' }))).toMatchObject({ note: expect.stringContaining('redPolicy warn') })
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
      'claude config list', 'claude', 'claude "explain this repo"', 'claude --resume abc',
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
    expect((launchGate(ctx(budget(90, banked))) as any).deny).toContain('A banked weekly reset is counted')
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
