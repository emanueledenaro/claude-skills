import { describe, expect, test } from 'claude-code/testing'
import {
  GATES, LISTED_ONLY, ROUTES, ancestorDirs, contextLine, gateCheck, gateLog, isPersonOrigin, isUnder, joinPath,
  leadingCommand, logLine, matchRoutes, namesFrom, normalize, pickSuggestions, samePath, shellGates, skillTail,
  tokenize, trustedList, writeGates,
} from '../hooks/routes.js'

// Italian and English prompts each route must catch.
const SAMPLES: Record<string, string[]> = {
  'model-mix': [
    'lancia tre agenti per rivedere i moduli', 'quanto budget ci resta questa settimana?', "com'è il consumo di token oggi?",
    'siamo vicini al limite settimanale?', 'che effort uso per la review?', 'sono sul piano Max 20x',
    'launch two agents to audit the auth module', 'how much usage is left this week?', 'are we close to the weekly limit?',
    'should this run with opus or sonnet?',
  ],
  'smart-ultracode': [
    'scrivi un workflow per analizzare tutti i file', 'fai un audit completo del repo', 'usa tanti agenti in parallelo',
    'fan out over every package', 'use ultracode for this', 'run a full audit of the codebase',
  ],
  'coordinator-method': [
    'coordina i worker e poi mergia la PR', 'inizia un nuovo giro di controllo', 'aggiorna la roadmap',
    'start the next round', 'the worker finished its task', 'vado a dormire',
  ],
  overnight: [
    'vado a dormire, lascia girare tutto stanotte', 'buonanotte!', 'torno domattina, lavora mentre dormo',
    "I'm going to sleep, keep going tonight", 'run overnight please', 'keep the computer awake',
    'svegliati ogni 30 minuti e controlla la CI', 'cosa hai fatto stanotte?',
  ],
  'merge-gate': [
    'mergia la PR 42', 'la PR è pronta, fai il merge', 'è verde, puoi fare il merge', 'chiudi le PR superate',
    'merge this PR', 'the PR is green, merge it', 'ship it', 'close superseded PRs', 'il merge è stato rifiutato',
  ],
  'cloud-worker': [
    'lancia un worker cloud per il ticket 12', 'manda questo task in cloud', 'launch.exp non funziona su Windows',
    'start a cloud session for the docs', 'check the cloud session', 'teleport the session here', 'run this in the cloud',
    'recupera la PR del worker', "dov'è finito il worker?", "expect non c'è su questa macchina",
  ],
  'smart-mods': [
    'scrivi un mod che blocca i comandi rm', 'aggiungi un pannello sopra il prompt', 'write a mod with a guard on bash commands',
    'install this plugin from the marketplace', 'crea un comando /coord che apre un pannello',
  ],
  'mod-ui': [
    'fammi una barra sopra il prompt', 'cambia i colori del mod', 'add a band above the prompt', 'restyle the mod',
    'aggiungi un pannello al mod', 'show a card in the chat', 'mostra una notifica in Claude Code',
  ],
  'matt-bridge': [
    'usa le skill di Matt per questa feature', "trasforma l'idea in PRD e ticket", "use Matt's skills", '/grill-me sul piano',
    'implementa il ticket 14', 'stress-test this plan',
  ],
  'roadmap-tracker': [
    'apri un issue per il bug del login', "cosa c'è in coda?", 'manca la milestone', 'file an issue for this',
    "what's ready for agent?", 'audit the backlog', 'ho mergiato la 31', 'chiudi il ticket 9',
  ],
  'verified-research': [
    'fai una ricerca sui limiti attuali', 'verifica queste affermazioni', 'è ancora vero?', 'fact-check this',
    'is this still true?', 'what are the limits now?', 'controlla le fonti',
  ],
  'release-watch': [
    "c'è qualcosa di nuovo in Claude Code?", 'è uscito Haiku 5.5?', 'controlla gli aggiornamenti',
    'did a new Claude Code version ship?', 'check for updates', 'has the mods API changed?',
    'tienimi aggiornato sulle novità', 'cosa è cambiato nel changelog?',
  ],
  'skill-audit': [
    'fai un audit delle skill', 'la skill non parte', 'quanto costano le skill in token?', 'audit my skills',
    "this skill doesn't trigger", 'is this skill safe?', 'rivedi questa skill',
  ],
  'context-hygiene': [
    'la sessione lunga consuma troppo', 'compatta la sessione', 'the context window is filling up', 'clear or compact?',
    'troppo contesto', 'what is eating my context?',
  ],
  'windows-ops': [
    'il comando non funziona su Windows', 'percorso troppo lungo nel clone', 'avvisi CRLF su git',
    'Filename too long when cloning', 'which shell should I use?', 'expect not found', 'dove sta la config di Claude?',
  ],
  'grill-me': ['intervistami sul piano', 'fammi domande sul design', 'grill me on this plan', 'stress test del piano'],
  'grill-with-docs': ['grill me against the docs and the ADRs', 'fammi il grilling usando il glossario'],
  'to-prd': ['scrivi il PRD di questa feature', 'raccogli i requisiti', 'write a PRD for the export'],
  'to-issues': ['spezza in task il piano', 'crea i ticket dal PRD', 'break it into issues'],
  tdd: ['usiamo TDD, test prima', 'red green refactor please', 'facciamolo test-driven'],
  triage: ['smista le issue nuove', 'triage the incoming bugs', 'fai il triage'],
  diagnose: [
    'il login non funziona', "c'è un bug nel parser", "regressione dopo l'ultimo merge", 'debug this crash',
    'it is broken after the update', 'mi da errore quando salvo', 'getting an error on startup',
  ],
  handoff: ["passa a un'altra sessione", 'scrivi un handoff', "riprendi in un'altra sessione"],
  prototype: ['fammi un prototipo', 'una prova di concetto', 'mock up the settings page'],
  'improve-codebase-architecture': [
    "migliora l'architettura", 'refactoring del modulo pagamenti', 'troppo accoppiamento tra i moduli', 'find refactoring opportunities',
  ],
  'zoom-out': ["dammi una visione d'insieme", 'il quadro generale', 'zoom out please'],
  schedule: ['ogni giorno alle 9 controlla le PR', 'ogni lunedì manda il report', 'crea una routine', 'every day at 9am run the audit'],
  loop: ['ogni 5 minuti controlla la CI', 'controlla di continuo', 'every 10 minutes check the deploy', 'set up a /loop for this'],
}

// Ordinary requests no route may catch.
const ORDINARY = [
  'aggiungi una barra di ricerca alla homepage', 'rinomina la variabile count in total', 'merge the two arrays into a single sorted list',
  'unisci i due dizionari in uno', 'add a web worker for image resizing', 'il form deve mostrare un messaggio di errore sotto il campo',
  'crea un componente React per il login', 'aggiorna il README con le istruzioni di installazione', 'use a for loop to sum the values',
  'fix the guard clause in validate()', 'aggiungi un pannello di amministrazione per gli utenti', 'il programma stampa il totale',
  'write a fable about a fox', 'run the tests in parallel with pytest-xdist', 'update the CHANGELOG for version 2.0',
  "rilascia la versione 2.0 dell'app", 'che tempo fa domani?', 'aggiungi il campo budget al form delle spese',
  'spiegami come funziona questa funzione', 'add error handling to the fetch call', 'add a label to the email input',
  'rinomina il file in plugin-utils.js', 'translate this paragraph into English', 'the event loop is blocked by a sync call',
  'aggiorna le dipendenze del progetto', 'imposta il tema scuro', 'show an error when the field is empty',
  'fai uno stress test del server', 'the data model needs a new field', 'scrivi una funzione che calcola la media',
  'puoi spiegarmi il codice di questo file?', 'aggiungi i test per il servizio utenti', 'il server risponde lentamente',
  'ottimizza la query SQL', 'crea una nuova pagina per il profilo', 'dove viene definita questa costante?',
  'cambia il colore del bottone in blu', "scrivi la documentazione dell'API", 'the build passes locally',
  'rename the component to UserCard', 'add pagination to the list endpoint', 'how do I parse JSON in Python?',
  'configura eslint per il progetto', 'aggiungi il supporto per il dark mode', 'fai il deploy su Vercel',
  'the plan is to add caching first', 'il piano è aggiungere la cache', 'add push notifications to the mobile app',
  'attiva la modalità di notte nel tema', 'make sure expenses stay within budget', 'leggi il file e riassumilo',
  'what does this regex do?', 'sposta la funzione in utils', 'aggiungi un indice alla tabella ordini',
  'il componente si aggiorna due volte', 'controlla che i tipi siano corretti', 'scrivi un commento per questa funzione',
  'dividi il file in due moduli', 'usa una mappa invece di un array', 'formatta il codice con prettier',
  'apri il file ticket.js', 'ship this feature by friday',
  // bare merge, routine, cron, "stanotte" and a search through files
  'Fai il merge dei due file CSV', 'Scrivi una routine di pulizia del database', 'Il cron della pipeline fallisce',
  'I bambini vanno a letto presto stanotte', 'Fai una ricerca nel file per TODO',
]

const NEW_SKILLS = [
  'windows-ops', 'cloud-worker', 'matt-bridge', 'merge-gate', 'overnight', 'roadmap-tracker', 'verified-research',
  'release-watch', 'skill-audit', 'mod-ui', 'context-hygiene',
]
const EXTRA_SKILLS = [
  'model-mix', 'smart-ultracode', 'coordinator-method', 'smart-mods', 'grill-me', 'grill-with-docs', 'to-prd', 'to-issues',
  'tdd', 'triage', 'diagnose', 'handoff', 'prototype', 'improve-codebase-architecture', 'zoom-out', 'schedule', 'loop',
  'skill-creator',
]

const skills = (text: string) => matchRoutes(text).map((r: any) => r.skill)
const route = (name: string) => ROUTES.find((r: any) => r.skill === name)

describe('route table', () => {
  test('one route per skill: the eleven new skills and every extra the brief lists', () => {
    const names = ROUTES.map((r: any) => r.skill)
    expect(new Set(names).size).toBe(names.length)
    for (const s of [...NEW_SKILLS, ...EXTRA_SKILLS]) expect(names).toContain(s)
    expect(names.length).toBe(NEW_SKILLS.length + EXTRA_SKILLS.length)
  })

  test('each route has a short why, a priority and patterns', () => {
    for (const r of ROUTES as any[]) {
      expect(typeof r.why).toBe('string')
      expect(r.why.length > 0 && r.why.length <= 50).toBe(true)
      expect(typeof r.priority).toBe('number')
      expect(r.prompt.length > 0).toBe(true)
      for (const p of r.prompt) expect(p instanceof RegExp).toBe(true)
    }
  })

  test('process skills lead: model-mix, smart-ultracode, coordinator-method', () => {
    const sorted = [...ROUTES].sort((a: any, b: any) => b.priority - a.priority).map((r: any) => r.skill)
    expect(sorted.slice(0, 3)).toEqual(['model-mix', 'smart-ultracode', 'coordinator-method'])
  })

  test('only zoom-out is person-only (disable-model-invocation)', () => {
    expect(ROUTES.filter((r: any) => r.personOnly).map((r: any) => r.skill)).toEqual(['zoom-out'])
  })
})

describe('prompt matching', () => {
  for (const [name, list] of Object.entries(SAMPLES)) {
    test(`${name} catches its Italian and English prompts`, () => {
      for (const text of list) expect(skills(text), text).toContain(name)
    })
  }

  test('no route catches ordinary requests', () => {
    for (const text of ORDINARY) expect(skills(text), text).toEqual([])
  })

  test('merge alone is not a PR merge', () => {
    expect(skills('merge the branches and the configs')).toEqual([])
    expect(skills('merge this PR')).toContain('merge-gate')
    expect(skills('fai il merge della pull request')).toContain('merge-gate')
  })

  test('accents, curly apostrophes and e-apostrophe spellings match alike', () => {
    for (const text of ["dov'è finito il worker", 'dov\u2019e\u2019 finito il worker', "dov'e finito il worker"]) {
      expect(skills(text)).toContain('cloud-worker')
    }
    expect(normalize('  È   VERDE\u2019 ')).toBe(" e verde' ")
  })

  test('fenced code blocks are not read', () => {
    expect(skills('leggi questo:\n```js\nconst bug = mergePr(pr)\n// launch.exp\n```\ngrazie')).toEqual([])
  })

  test('word boundaries hold: no match inside longer words', () => {
    expect(skills('the model is a module of the modem')).toEqual([])
    expect(skills('debugger attached, prdx loaded')).toEqual([])
  })

  test('results are ordered by priority, one entry per skill', () => {
    const got = skills('lancia un worker cloud stanotte e poi mergia la PR')
    expect(got.slice(0, 3)).toEqual(['model-mix', 'coordinator-method', 'overnight'])
    expect(new Set(got).size).toBe(got.length)
  })

  test('unless: grill-with-docs replaces grill-me, triage replaces diagnose, red-green-refactor is not a refactoring', () => {
    expect(skills('grill me against the docs')).not.toContain('grill-me')
    expect(skills('triage the incoming bugs')).not.toContain('diagnose')
    expect(skills('red green refactor please')).not.toContain('improve-codebase-architecture')
  })

  test('normalize refuses what is not text', () => {
    expect(() => normalize(42 as any)).toThrow('prompt text is not text')
  })
})

describe('suggestions', () => {
  const base = { installed: null, loaded: new Set<string>(), suggestedAt: new Map<string, number>(), promptNo: 1 }

  test('at most 3, highest priority first', () => {
    const picks = pickSuggestions({ ...base, text: 'lancia un worker cloud stanotte e poi mergia la PR' })
    expect(picks.map((p: any) => p.skill)).toEqual(['model-mix', 'coordinator-method', 'overnight'])
  })

  test('only installed, not loaded, not suggested in the last 5 prompts', () => {
    const text = 'vado a dormire, mergia la PR 12'
    expect(pickSuggestions({ ...base, text, installed: new Set(['overnight']) }).map((p: any) => p.skill)).toEqual(['overnight'])
    expect(pickSuggestions({ ...base, text, loaded: new Set(['coordinator-method', 'overnight']) }).map((p: any) => p.skill)).toEqual(['merge-gate'])
    const suggestedAt = new Map([['coordinator-method', 1], ['overnight', 1]])
    expect(pickSuggestions({ ...base, text, suggestedAt, promptNo: 6 }).map((p: any) => p.skill)).toEqual(['merge-gate'])
    expect(pickSuggestions({ ...base, text, suggestedAt, promptNo: 7 }).map((p: any) => p.skill)).toEqual(['coordinator-method', 'overnight', 'merge-gate'])
  })

  test('a typed slash command is not suggested for itself', () => {
    const picks = pickSuggestions({ ...base, text: '/grill-me il piano di rilascio' })
    expect(picks.map((p: any) => p.skill)).toEqual(['matt-bridge'])
    expect(leadingCommand('  /cs:tdd now')).toBe('tdd')
    expect(leadingCommand('no command')).toBeNull()
  })

  test('the context line: the brief\'s English line', () => {
    const line = contextLine([route('overnight'), route('merge-gate')])
    expect(line).toBe('skill-router: skills relevant to this request, not loaded yet: overnight (going to sleep or away for hours), merge-gate (merging a PR). Load each with the Skill tool before acting.')
  })

  test('a person-only skill is offered as a command to suggest', () => {
    expect(contextLine([route('zoom-out')])).toBe('skill-router: Only the person can run /zoom-out (big picture of unfamiliar code): suggest it if it fits.')
    expect(contextLine([route('diagnose'), route('zoom-out')])).toBe(
      'skill-router: skills relevant to this request, not loaded yet: diagnose (reproduce, minimise and fix a bug). Load each with the Skill tool before acting. Only the person can run /zoom-out (big picture of unfamiliar code): suggest it if it fits.')
  })

  test('the transcript line in Italian or English', () => {
    expect(logLine([route('overnight'), route('merge-gate')], 'it')).toBe('skill suggerite: overnight, merge-gate')
    expect(logLine([route('overnight'), route('zoom-out')], 'en')).toBe('suggested skills: overnight, /zoom-out')
  })

  test('person origins: composer, bridge, sdk (the Desktop Code tab); nothing else', () => {
    for (const kind of ['composer', 'bridge', 'sdk']) expect(isPersonOrigin({ kind })).toBe(true)
    for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'plugin', 'coordinator', 'auto-continuation', 'unclassified']) {
      expect(isPersonOrigin({ kind })).toBe(false)
    }
    expect(isPersonOrigin(undefined)).toBe(false)
  })

  test('names: plugin prefix and slash dropped', () => {
    expect(skillTail('cs:merge-gate')).toBe('merge-gate')
    expect(skillTail('/Overnight')).toBe('overnight')
    expect([...namesFrom([{ name: 'a:model-mix' }, { name: 'tdd' }, { nope: 1 }, null])]).toEqual(['model-mix', 'tdd'])
    expect(namesFrom(undefined as any).size).toBe(0)
    expect(() => skillTail(42 as any)).toThrow('skill name is not text')
  })

  test('a command list naming no routed skill is not trusted', () => {
    expect(trustedList(new Set(['compact', 'clear', 'help']))).toBe(false)
    expect(trustedList(new Set())).toBe(false)
    expect(trustedList(new Set(['compact', 'overnight']))).toBe(true)
  })
})

describe('gates', () => {
  const state = (extra: any = {}) => ({ loaded: new Set<string>(), installed: null, fired: new Set<string>(), ...extra })

  test('a gate names its missing skills and the action', () => {
    const c: any = gateCheck(['workflow'], state())
    expect(c.keys).toEqual(['workflow'])
    expect(c.skills).toEqual(['model-mix', 'smart-ultracode'])
    expect(c.reason).toBe('skill-router: before launching a workflow, load model-mix and smart-ultracode with the Skill tool, then retry this exact call. This check fires once per session, so the retry passes.')
  })

  test('loaded skills, fired gates and missing skills hold nothing', () => {
    expect(gateCheck(['agent'], state({ loaded: new Set(['model-mix']) }))).toBeNull()
    expect(gateCheck(['agent'], state({ fired: new Set(['agent']) }))).toBeNull()
    expect(gateCheck(['merge'], state({ installed: new Set(['model-mix']) }))).toBeNull()
    const c: any = gateCheck(['workflow'], state({ loaded: new Set(['model-mix']) }))
    expect(c.skills).toEqual(['smart-ultracode'])
  })

  test('with the command list unknown, the new skills are not named', () => {
    expect(LISTED_ONLY).toEqual(['cloud-worker', 'merge-gate', 'mod-ui'])
    expect((gateCheck(['cloud'], state()) as any).skills).toEqual(['model-mix'])
    expect(gateCheck(['merge'], state())).toBeNull()
    expect((gateCheck(['cloud'], state({ installed: new Set(['model-mix', 'cloud-worker']) })) as any).skills).toEqual(['model-mix', 'cloud-worker'])
  })

  test('two gates in one call', () => {
    const c: any = gateCheck(['mod', 'modUi'], state({ installed: new Set(['smart-mods', 'mod-ui']) }))
    expect(c.keys).toEqual(['mod', 'modUi'])
    expect(c.reason).toContain("before writing a mod's files and drawing a mod's interface, load smart-mods and mod-ui")
  })

  test('every gate the brief lists exists', () => {
    expect(Object.keys(GATES)).toEqual(['workflow', 'agent', 'cloud', 'merge', 'mod', 'modUi'])
    expect(gateLog('Agent', ['model-mix'], 'it')).toBe('skill-router: Agent fermato una volta, da caricare prima: model-mix')
    expect(gateLog('Agent', ['model-mix'], 'en')).toBe('skill-router: Agent held once, load first: model-mix')
  })
})

describe('shell commands', () => {
  test('cloud launches in Bash and PowerShell', () => {
    for (const c of [
      'claude --cloud "fix the build"',
      'cd repo && claude --model sonnet --cloud "task"',
      '& "C:\\Tools\\claude.exe" --cloud "task"',
      'claude -p "task" --environment ccpool_1 --cloud',
      'cmd /c "claude --cloud x" 2>&1',
      "powershell -Command \"claude --cloud 'task'\" -ErrorAction Stop",
      'cmd /c "claude" --cloud x',
      'expect ~/.claude/skills/coordinator-method/launch.exp task.txt rules.txt w.log sonnet high',
      './launch.exp t r l sonnet high',
      'powershell.exe -NoProfile -File "$HOME\\.claude\\skills\\cloud-worker\\launch.ps1" task.txt none w.log sonnet high',
      '& "$HOME\\.claude\\skills\\cloud-worker\\launch.ps1" task.txt none w.log sonnet high -DryRun',
      'pwsh -NoProfile -Command "& \'C:\\s\\launch.ps1\' t none l sonnet high"',
      'bash -lc "claude --cloud \\"x\\""',
      'Start-Process claude -ArgumentList \'--cloud\',\'task\'',
    ]) expect(shellGates(c), c).toEqual(['cloud'])
  })

  test('Start-Process: the words of a quoted prompt in -ArgumentList never read as flags', () => {
    for (const c of [
      "Start-Process claude -ArgumentList '--cloud','\"fix the -p flag parsing\"'",
      "Start-Process claude -ArgumentList '--model','fable','--cloud','\"explain -p\"'",
      // A `(` or `;` in an element's text keeps the flags after it.
      "Start-Process claude -ArgumentList '(a);b','--cloud','task'",
    ]) expect(shellGates(c), c).toEqual(['cloud'])
    // An element without inner quotes is split by Start-Process: its -p reaches claude as a flag (a follow-up).
    expect(shellGates("Start-Process claude -ArgumentList '--cloud','session_1 -p x'")).toEqual([])
  })

  test('PR merges', () => {
    expect(shellGates('gh pr merge 12 --squash --match-head-commit abc')).toEqual(['merge'])
    expect(shellGates('gh.exe pr merge 12 --auto')).toEqual(['merge'])
    expect(shellGates('gh api repos/o/r/pulls/12/merge -X PUT')).toEqual(['merge'])
    expect(shellGates('claude --cloud x; gh pr merge 3')).toEqual(['cloud', 'merge'])
    expect(shellGates('pwsh -NoProfile -Command "gh pr merge 3" 2>&1')).toEqual(['merge'])
    expect(shellGates("git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && gh pr merge 3")).toEqual(['merge'])
  })

  test('a follow-up to a cloud worker (claude -p ... --cloud <session>) is open work: never held', () => {
    for (const c of [
      'claude -p "keep going" --cloud session_01abc --output-format json',
      'claude --print "x" --cloud https://claude.ai/code/session_01abc',
      'claude -p "x" --cloud cse_0123',
      'claude --cloud session_01abc -p "rebase on main"',
      "Start-Process claude -ArgumentList '-p','x','--cloud','session_1'",
      'bash -lc "claude -p \\"x\\" --cloud session_1"',
    ]) expect(shellGates(c), c).toEqual([])
  })

  test('local headless runs (claude -p, --bg) are not gated here', () => {
    for (const c of ['claude -p "refactor the parser"', 'claude --bg "nightly sweep"', 'claude --print --model fable "x"', 'claude --resume abc -p "x"', 'claude --bg --resume abc']) {
      expect(shellGates(c), c).toEqual([])
    }
  })

  test('a heredoc inside "$(...)" is data: odd quotes in a commit or PR body hold nothing', () => {
    for (const c of [
      "git commit -m \"$(cat <<'EOF'\nfeat: add guard\n\nThe 5\" screen case.\ngh pr merge 5 runs after review\nEOF\n)\"",
      "gh pr create --title \"x\" --body \"$(cat <<'EOF'\nIt's the user's \"fix\nclaude --cloud brief\nEOF\n)\"",
      "git commit -m \"$(cat <<'EOF'\nfeat: support 5\" displays\nclaude --cloud docs\nEOF\n)\"",
      "gh pr create --title t --body \"$(cat <<'EOF'\nSet `\"enabled\": false` in config.\n\n```\nclaude -p \"msg\" --cloud abc\n```\nEOF\n)\"",
      "git commit -m \"$(cat <<-EOF\n\tclaude --cloud \"x\n\tEOF\n)\"",
    ]) expect(shellGates(c), c).toEqual([])
    expect(tokenize("git commit -m \"$(cat <<'EOF'\na \" b\nEOF\n)\" && echo ok").map((s: any) => s.map((t: any) => t.value)))
      .toEqual([['git', 'commit', '-m', "$(cat <<'EOF'\na \" b\nEOF\n)"], ['echo', 'ok']])
    expect(tokenize('echo "a <<EOF b"').map((s: any) => s.map((t: any) => t.value))).toEqual([['echo', 'a <<EOF b']])
  })

  test('mentions, reads and heredoc bodies hold nothing', () => {
    for (const c of [
      'echo claude --cloud x', 'git log --grep "gh pr merge"', 'claude --version', 'claude -p "hello"',
      'gh pr view 12', 'gh pr list --state open', 'git merge origin/main', 'cat ~/.claude/skills/cloud-worker/launch.ps1',
      'Get-Content C:\\s\\launch.ps1', 'git commit -m "run gh pr merge after review"',
      "git commit -F - <<'EOF'\ngh pr merge 12\nclaude --cloud now\nEOF",
      "cat > brief.md <<'EOF'\nexpect launch.exp t r l sonnet high\nEOF",
      "gh pr create --title x --body-file - <<'EOF'\nthen gh pr merge 12 --squash\nEOF",
      "@'\ngh pr merge 12\nclaude --cloud \"x\"\n'@ | Set-Content notes.md",
    ]) expect(shellGates(c), c).toEqual([])
  })

  test('the tokenizer keeps quoted text whole and drops heredoc bodies', () => {
    expect(tokenize('cd "C:\\My Repo" && gh pr merge 1').map((s: any) => s.map((t: any) => t.value))).toEqual([['cd', 'C:\\My Repo'], ['gh', 'pr', 'merge', '1']])
    expect(tokenize("cat <<EOF\ngh pr merge 1\nEOF\necho ok").map((s: any) => s.map((t: any) => t.value))).toEqual([['cat'], ['echo', 'ok']])
  })

  test('a command that is not text throws (the hook passes it on)', () => {
    expect(() => shellGates(42 as any)).toThrow('command is not text')
  })
})

describe('mod files', () => {
  test('writeGates: smart-mods always, mod-ui when the new text draws', () => {
    expect(writeGates({ tool: 'Write', file_path: 'C:\\m\\hooks\\register.js', content: 'export function register() {}' })).toEqual(['mod'])
    expect(writeGates({ tool: 'Write', file_path: 'C:\\m\\hooks\\register.js', content: "on('ui.render', h)" })).toEqual(['mod', 'modUi'])
    expect(writeGates({ tool: 'Edit', file_path: '/m/hooks/register.js', old_string: 'a', new_string: "on('ui.render', h)" })).toEqual(['mod', 'modUi'])
    expect(() => writeGates({ tool: 'Write', file_path: 42 })).toThrow('file_path is not text')
  })

  test('ancestor folders, nearest first, never a root', () => {
    expect(ancestorDirs('C:\\repo\\mods\\demo\\hooks\\register.js')).toEqual([
      'C:\\repo\\mods\\demo\\hooks', 'C:\\repo\\mods\\demo', 'C:\\repo\\mods', 'C:\\repo',
    ])
    expect(ancestorDirs('/home/me/mods/demo/tests/a.test.ts', 3)).toEqual(['/home/me/mods/demo/tests', '/home/me/mods/demo', '/home/me/mods'])
    expect(ancestorDirs('C:/a.js')).toEqual([])
  })

  test('path helpers', () => {
    expect(joinPath('C:\\repo\\demo', '.claude-plugin', 'plugin.json')).toBe('C:\\repo\\demo\\.claude-plugin\\plugin.json')
    expect(joinPath('/r/demo/', 'hooks')).toBe('/r/demo/hooks')
    expect(samePath('C:\\Repo\\x.json', 'c:/repo/x.json')).toBe(true)
    expect(isUnder('C:\\repo\\demo\\hooks\\a.js', 'C:/repo/demo/hooks')).toBe(true)
    expect(isUnder('C:\\repo\\demo\\hooksy\\a.js', 'C:/repo/demo/hooks')).toBe(false)
  })
})

describe('Start-Process hands claude a Windows command line', () => {
  test('a single quote or an escaped quote inside a value never swallows the flags after it', () => {
    for (const c of [
      `Start-Process claude -ArgumentList "Fix the user's login","--cloud","--model","fable"`,
      `Start-Process claude -WorkingDirectory "C:\\Users\\O'Neil\\proj" -ArgumentList '--model','fable','--cloud','task'`,
      `Start-Process claude -ArgumentList '\\"fix the bug\\" --model fable --cloud'`,
      `Start-Process claude -ArgumentList '--model','fable','\\"fix the bug\\"','--cloud'`,
      `Start-Process claude -WorkingDirectory "C:\\Users\\O'Neil\\proj" -ArgumentList '--cloud','task'`,
    ]) expect(shellGates(c), c).toEqual(['cloud'])
    expect(shellGates(`Start-Process claude -ArgumentList "-p","what's","--cloud","cse_1"`)).toEqual([])
  })
})
