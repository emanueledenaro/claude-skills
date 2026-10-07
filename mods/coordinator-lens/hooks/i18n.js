// Texts the person sees (Italian by default, English with language 'en').
// Pure: no `$`. Text the model reads is English and lives in views.js (summaryText, budgetLine).
//
//   t(lang, key, vars)      '{name}' placeholders; falls back to English, then to the key
//   tn(lang, key, n, vars)  picks `key.one` when n is 1, else `key.other`; `{n}` is filled in
//   fmtDuration(lang, ms)   '<1m', '12m', '1h 5m', '2d 3h' ('2g 3h' in Italian)
//   fmtPoints(n)            weekly points: 2, 0.8, 12.3

export const LANGS = ['it', 'en']

export function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'it'
}

const TEXT = {
  en: {
    'title': 'Coordinator',
    'pane.title': 'Coordinator',
    'cmd.description': 'Coordinator view: budget, workers, merges',

    'color.green': 'green',
    'color.yellow': 'yellow',
    'color.red': 'red',
    'color.unknown': 'waiting',

    'reason.over-reserve': 'over reserve',
    'reason.last-12-hours': 'last 12 hours',
    'reason.no-reading': 'no reading',
    'reason.stale-reading': 'old reading',
    'reason.window-expired': 'window over',

    'band.budget': 'Budget',
    'band.stale': '(read {ago} ago)',
    'band.staleShort': '({ago} ago)',
    'band.weekLabel': 'Week',
    'band.week': '{used}% (pace {pace}%)',
    'band.weekOnly': '{used}%',
    'band.fiveLabel': '5h',
    'band.five': '{used}%',
    'band.fivePaused': '{used}% (wait {wait})',
    'band.workingLabel': 'Working',
    'band.stalledLabel': 'Stalled',
    'band.wf': 'wf {name} {a}/{b}',
    'band.wfOpen': 'wf {name} {a}',
    'band.decideLabel': 'To decide',
    'band.night': 'Night',

    'tab.overview': 'Overview',
    'tab.workers': 'Workers',
    'tab.merge': 'Merge',
    'tab.flow': 'Flow',
    'tab.night': 'Night',
    'btn.nightOn': 'Turn night on',
    'btn.nightOff': 'Turn night off',

    'row.budget': 'Budget',
    'row.workers': 'Workers',
    'row.merge': 'Merge',
    'row.round': 'Round',
    'row.flow': 'Flow',
    'row.decisions': 'Decisions',

    'sec.budget': 'Budget',
    'sec.workers': 'Workers',
    'sec.prs': 'PR',
    'sec.merge': 'Merge',
    'sec.round': 'Round',
    'sec.flow': 'Flow',
    'sec.side': 'Aside',
    'sec.artifacts': 'Files',
    'sec.warnings': 'Warnings',
    'sec.decisions': 'Decisions',
    'sec.night': 'Night',
    'sec.cost': 'Run cost',

    'lbl.week': 'Week',
    'lbl.five': '5 hours',
    'lbl.plan': 'Plan',
    'lbl.profile': 'Profile',
    'lbl.reading': 'Reading',
    'lbl.margin': 'Margin',
    'lbl.reserve': 'Reserve',
    'lbl.resets': 'Banked',

    'budget.pace': 'pace {pace}%',
    'budget.margin': 'margin {margin}',
    'budget.noReading': 'no reading yet',
    'budget.resetIn': 'resets in {in}',
    'budget.wait': 'wait {wait}',
    'budget.profile': '{name}   {width} agents per run   {cloud} cloud',
    'budget.profileNone': '{name}   no new launches',
    'budget.profileSolo': '{name}   no workflows   one agent at most   no cloud sessions',
    'budget.profileSoloShort': '{name}   one agent at most',
    'budget.noLaunch': 'no new launches',
    'budget.planUnknown': 'not read',
    'budget.planAssumed': '{name} assumed',
    'budget.profileShort': '{name}   {width} agents   {cloud} cloud',
    'budget.readAgo': '{ago} ago',
    'budget.reserve': 'reserve {reserve}%',
    'budget.banked': 'weekly reset until {date}',
    'budget.inFlight': '+{n} in flight',

    'kind.agent': 'agent',
    'checks.green': 'green',
    'checks.red': 'red',
    'pr.open': 'open',
    'pr.merged': 'merged',
    'pr.closed': 'closed',
    'pr.withDraft': '{state} draft',
    'kind.workflow': 'wf',
    'kind.cloud': 'cloud',
    'state.running': 'running',
    'state.done': 'done',
    'state.failed': 'failed',
    'state.launched': 'sent',
    'state.denied': 'denied',
    'state.stalled': 'stalled',
    'th.name': 'name',
    'th.kind': 'kind',
    'th.model': 'model',
    'th.agents': 'agents',
    'th.pts': 'pts',
    'th.time': 'time',
    'th.state': 'state',
    'workers.summary.running.one': '{n} running',
    'workers.summary.running.other': '{n} running',
    'workers.summary.done.one': '{n} done',
    'workers.summary.done.other': '{n} done',
    'workers.summary.failed.one': '{n} failed',
    'workers.summary.failed.other': '{n} failed',
    'workers.summary.denied.one': '{n} denied',
    'workers.summary.denied.other': '{n} denied',
    'more': '+{n} more',
    'empty.workers': 'No workers yet',
    'empty.prs': 'No open pull requests',
    'empty.merge': 'No merge in progress',
    'empty.round': 'No round yet',
    'empty.decisions': 'Nothing waiting',
    'empty.flow': 'No skill flow yet',

    'merge.step.realign': 'main merged in',
    'merge.step.checks': 'checks green',
    'merge.step.headPinned': 'head pinned',
    'merge.step.merged': 'merged',
    'merge.step.ticketsClosed': 'tickets closed',
    'merge.step.roadmap': 'roadmap updated',
    'merge.step.unblocked': 'next work launched',
    'round.item.mainCi': 'main CI',
    'round.item.prsAndIssues': 'PRs and issues',
    'round.item.idleWorkers': 'idle workers',
    'round.item.duplicates': 'duplicates',
    'round.item.diffReviewed': 'diff review',
    'count.of': '{done} of {total}',
    'word.next': 'next: {next}',
    'round.since': 'since {ago}',
    'probable': 'probable',

    'stage.grill': 'grill',
    'stage.spec': 'spec',
    'stage.tickets': 'tickets',
    'stage.build': 'build',
    'stage.review': 'review',
    'stage.pr': 'pr',
    'flow.now': 'now: {name}',
    'word.now': 'now',
    'flow.ago': '{ago} ago',

    'artifact.context': 'context',
    'artifact.glossary': 'glossary',
    'artifact.map': 'map',
    'artifact.adr': 'adr',
    'artifact.issue': 'ticket',
    'artifact.prd': 'prd',
    'artifact.outOfScope': 'out of scope',
    'artifact.handoff': 'handoff',
    'artifact.review': 'review',

    'warning.milestone': 'Issue created without a milestone',
    'warning.force': 'Force push used',
    'warning.forceLease': 'Force push (with lease) used',
    'warning.amend': 'Commit amended after a push',
    'warning.mainCommit': 'Commit made on main',

    'decisions.waiting.one': '{n} waiting',
    'decisions.waiting.other': '{n} waiting',

    'night.state.on': 'on',
    'night.state.off': 'off',
    'night.since': 'since {ago}',
    'night.nextWake': 'next wake in {in}',
    'night.noWake': 'no wake planned',
    'night.points': '{points} weekly points spent',
    'night.hint': 'Night mode only changes what you see here: it starts nothing.',
    'cost.unit': '{points} weekly points per Sonnet-sized agent',
    'cost.samples': '{n} measured runs',
    'cost.none': 'No run measured yet: the first workflow or cloud session gives the first sample.',
    'cost.last': 'last: {label}   {points} points   {agents} agents',
    'cost.lastNoAgents': 'last: {label}   {points} points',
    'cost.full': 'A full run ({width} agents) would cost about {points} points',
    'cost.fits': 'fits',
    'cost.noFit': 'does not fit',

    'footer.snapshot': 'snapshot   /coord pane for the live panel',

    'toast.decision': 'Waiting for you: {text}',
    'toast.merge': 'Merged {pr}',
    'toast.color': 'Budget is now {color}',
    'toast.stalled': 'No news from {label}',
    'log.color': 'coordinator-lens: budget {from} -> {to}',
  },

  it: {
    'title': 'Coordinatore',
    'pane.title': 'Coordinatore',
    'cmd.description': 'Vista coordinatore: budget, worker, merge',

    'color.green': 'verde',
    'color.yellow': 'giallo',
    'color.red': 'rosso',
    'color.unknown': 'in attesa',

    'reason.over-reserve': 'oltre la riserva',
    'reason.last-12-hours': 'ultime 12 ore',
    'reason.no-reading': 'nessuna lettura',
    'reason.stale-reading': 'lettura vecchia',
    'reason.window-expired': 'finestra chiusa',

    'band.budget': 'Budget',
    'band.stale': '(lettura di {ago} fa)',
    'band.staleShort': '({ago} fa)',
    'band.weekLabel': 'Settimana',
    'band.week': '{used}% (ritmo {pace}%)',
    'band.weekOnly': '{used}%',
    'band.fiveLabel': '5 ore',
    'band.five': '{used}%',
    'band.fivePaused': '{used}% (pausa {wait})',
    'band.workingLabel': 'Al lavoro',
    'band.stalledLabel': 'Fermi',
    'band.wf': 'wf {name} {a}/{b}',
    'band.wfOpen': 'wf {name} {a}',
    'band.decideLabel': 'Da decidere',
    'band.night': 'Notte',

    'tab.overview': 'Quadro',
    'tab.workers': 'Worker',
    'tab.merge': 'Merge',
    'tab.flow': 'Flusso',
    'tab.night': 'Notte',
    'btn.nightOn': 'Attiva la notte',
    'btn.nightOff': 'Spegni la notte',

    'row.budget': 'Budget',
    'row.workers': 'Worker',
    'row.merge': 'Merge',
    'row.round': 'Giro',
    'row.flow': 'Flusso',
    'row.decisions': 'Decisioni',

    'sec.budget': 'Budget',
    'sec.workers': 'Worker',
    'sec.prs': 'PR',
    'sec.merge': 'Merge',
    'sec.round': 'Giro',
    'sec.flow': 'Flusso',
    'sec.side': 'A lato',
    'sec.artifacts': 'File',
    'sec.warnings': 'Avvisi',
    'sec.decisions': 'Decisioni',
    'sec.night': 'Notte',
    'sec.cost': 'Costo run',

    'lbl.week': 'Settimana',
    'lbl.five': '5 ore',
    'lbl.plan': 'Piano',
    'lbl.profile': 'Profilo',
    'lbl.reading': 'Lettura',
    'lbl.margin': 'Margine',
    'lbl.reserve': 'Riserva',
    'lbl.resets': 'Reset',

    'budget.pace': 'ritmo {pace}%',
    'budget.margin': 'margine {margin}',
    'budget.noReading': 'ancora nessuna lettura',
    'budget.resetIn': 'reset tra {in}',
    'budget.wait': 'attendi {wait}',
    'budget.profile': '{name}   {width} agenti per run   {cloud} cloud',
    'budget.profileNone': '{name}   nessun nuovo avvio',
    'budget.profileSolo': '{name}   nessun workflow   un agente al massimo   nessuna sessione cloud',
    'budget.profileSoloShort': '{name}   un agente al massimo',
    'budget.noLaunch': 'nessun nuovo avvio',
    'budget.planUnknown': 'non letto',
    'budget.planAssumed': 'si assume {name}',
    'budget.profileShort': '{name}   {width} agenti   {cloud} cloud',
    'budget.readAgo': '{ago} fa',
    'budget.reserve': 'riserva {reserve}%',
    'budget.banked': 'reset settimanale fino al {date}',
    'budget.inFlight': '+{n} in corso',

    'kind.agent': 'agente',
    'checks.green': 'verde',
    'checks.red': 'rosso',
    'pr.open': 'aperta',
    'pr.merged': 'unita',
    'pr.closed': 'chiusa',
    'pr.withDraft': 'bozza {state}',
    'kind.workflow': 'wf',
    'kind.cloud': 'cloud',
    'state.running': 'attivo',
    'state.done': 'finito',
    'state.failed': 'fallito',
    'state.launched': 'inviato',
    'state.denied': 'negato',
    'state.stalled': 'fermo',
    'th.name': 'nome',
    'th.kind': 'tipo',
    'th.model': 'modello',
    'th.agents': 'agenti',
    'th.pts': 'pt',
    'th.time': 'tempo',
    'th.state': 'stato',
    'workers.summary.running.one': '{n} attivo',
    'workers.summary.running.other': '{n} attivi',
    'workers.summary.done.one': '{n} finito',
    'workers.summary.done.other': '{n} finiti',
    'workers.summary.failed.one': '{n} fallito',
    'workers.summary.failed.other': '{n} falliti',
    'workers.summary.denied.one': '{n} negato',
    'workers.summary.denied.other': '{n} negati',
    'more': '+{n} altri',
    'empty.workers': 'Nessun worker per ora',
    'empty.prs': 'Nessuna pull request aperta',
    'empty.merge': 'Nessun merge in corso',
    'empty.round': 'Nessun giro per ora',
    'empty.decisions': 'Niente in attesa',
    'empty.flow': 'Nessun flusso di skill per ora',

    'merge.step.realign': 'main integrato',
    'merge.step.checks': 'check verdi',
    'merge.step.headPinned': 'head fissato',
    'merge.step.merged': 'unito',
    'merge.step.ticketsClosed': 'ticket chiusi',
    'merge.step.roadmap': 'roadmap aggiornata',
    'merge.step.unblocked': 'lavoro successivo avviato',
    'round.item.mainCi': 'CI di main',
    'round.item.prsAndIssues': 'PR e issue',
    'round.item.idleWorkers': 'worker inattivi',
    'round.item.duplicates': 'duplicati',
    'round.item.diffReviewed': 'revisione diff',
    'count.of': '{done} di {total}',
    'word.next': 'prossimo: {next}',
    'round.since': 'da {ago}',
    'probable': 'probabile',

    'stage.grill': 'grill',
    'stage.spec': 'spec',
    'stage.tickets': 'ticket',
    'stage.build': 'sviluppo',
    'stage.review': 'review',
    'stage.pr': 'pr',
    'flow.now': 'ora: {name}',
    'word.now': 'ora',
    'flow.ago': '{ago} fa',

    'artifact.context': 'contesto',
    'artifact.glossary': 'glossario',
    'artifact.map': 'mappa',
    'artifact.adr': 'adr',
    'artifact.issue': 'ticket',
    'artifact.prd': 'prd',
    'artifact.outOfScope': 'fuori scopo',
    'artifact.handoff': 'passaggio',
    'artifact.review': 'review',

    'warning.milestone': 'Issue creata senza milestone',
    'warning.force': 'Force push usato',
    'warning.forceLease': 'Force push (con lease) usato',
    'warning.amend': 'Commit modificato dopo un push',
    'warning.mainCommit': 'Commit fatto su main',

    'decisions.waiting.one': '{n} in attesa',
    'decisions.waiting.other': '{n} in attesa',

    'night.state.on': 'attiva',
    'night.state.off': 'spenta',
    'night.since': 'da {ago}',
    'night.nextWake': 'prossima sveglia tra {in}',
    'night.noWake': 'nessuna sveglia prevista',
    'night.points': '{points} punti settimanali spesi',
    'night.hint': 'La notte cambia solo ciò che vedi qui: non avvia nulla.',
    'cost.unit': '{points} punti settimanali per agente (taglia Sonnet)',
    'cost.samples': '{n} run misurati',
    'cost.none': 'Nessun run misurato: il primo workflow o la prima sessione cloud dà il primo campione.',
    'cost.last': 'ultimo: {label}   {points} punti   {agents} agenti',
    'cost.lastNoAgents': 'ultimo: {label}   {points} punti',
    'cost.full': 'Un run pieno ({width} agenti) costerebbe circa {points} punti',
    'cost.fits': 'ci sta',
    'cost.noFit': 'non ci sta',

    'footer.snapshot': 'istantanea   pannello live con /coord pane',

    'toast.decision': 'Ti aspetta: {text}',
    'toast.merge': 'Merge fatto: {pr}',
    'toast.color': 'Il budget ora è {color}',
    'toast.stalled': 'Nessuna notizia da {label}',
    'log.color': 'coordinator-lens: budget {from} -> {to}',
  },
}

export const KEYS = Object.keys(TEXT.en)

function fill(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? '' : String(vars[name])))
}

export function t(lang, key, vars) {
  const l = normalizeLang(lang)
  const text = TEXT[l][key] != null ? TEXT[l][key] : TEXT.en[key]
  return text == null ? key : fill(text, vars)
}

// True when the key has a text in the language (no English fallback).
export function has(lang, key) {
  return TEXT[normalizeLang(lang)][key] != null
}

export function tn(lang, key, n, vars) {
  return t(lang, key + (n === 1 ? '.one' : '.other'), { ...(vars || {}), n })
}

export function colorWord(lang, color) {
  return t(lang, 'color.' + (color === 'green' || color === 'yellow' || color === 'red' ? color : 'unknown'))
}

export function fmtDuration(lang, ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const day = normalizeLang(lang) === 'it' ? 'g' : 'd'
  const total = Math.max(0, Math.floor(ms / 60000))
  if (total < 1) return '<1m'
  if (total < 60) return total + 'm'
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours < 24) return minutes ? hours + 'h ' + minutes + 'm' : hours + 'h'
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest ? days + day + ' ' + rest + 'h' : days + day
}

export function fmtPoints(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  const rounded = Math.abs(n) >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100
  const text = Math.abs(rounded) >= 10 ? rounded.toFixed(1) : rounded.toFixed(2)
  return text.replace(/\.?0+$/, '').replace(/^-0$/, '0')
}
