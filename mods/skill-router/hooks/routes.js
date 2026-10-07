// skill-router routes: the route table and the pure matching functions. No `$` here.
// Data in, data out: register.js keeps the state and makes every call.
//
// A route: { skill, why, priority, prompt: [RegExp...], unless?: [skill...], personOnly?: true }
//   why         a few English words the model reads beside the skill name
//   priority    higher first; process skills (model-mix, smart-ultracode, coordinator-method) lead
//   prompt      any one pattern matching the normalized prompt is enough
//   unless      drop this route when one of these skills matched too (the better fit)
//   personOnly  the skill has disable-model-invocation: the model cannot load it, only suggest it
//
// Prompts are normalized before matching (normalize): lower case, accents stripped (è -> e),
// curly apostrophes made straight, whitespace collapsed, fenced code blocks removed. Patterns are
// therefore written in plain ASCII, with `e'?` where Italian writes è or e'.

// Word boundaries that know letters beyond ASCII (the `u` flag with \p{L}).
const LB = '(?<![\\p{L}\\p{N}_])'
const RB = '(?![\\p{L}\\p{N}_])'

function src(p) {
  return typeof p === 'string' ? p : p.source
}

// A whole-word pattern: the alternatives joined, case-insensitive.
function w(...alternatives) {
  return new RegExp(LB + '(?:' + alternatives.map(src).join('|') + ')' + RB, 'iu')
}

// Two whole-word groups both present, in either order.
function both(first, second) {
  const part = alts => '(?=[\\s\\S]*?' + LB + '(?:' + alts.map(src).join('|') + ')' + RB + ')'
  return new RegExp('^' + part(first) + part(second), 'iu')
}

// ---------------------------------------------------------------- shared word groups

const GRILL = [
  /grill(ing|ami|a)?/, /grill me/, /interview me/, /intervistami/, /fammi (delle |qualche )?domande/,
  /stress[- ]?test(a|are|iamo)? (il |del |questo |questa |la |the |this |my |our )?(piano|plan|design|idea|proposta|proposal|architettura)/,
  /mettimi alla prova/, /challenge (my|this|the) (plan|design|idea)/,
]
const DOCS = [
  /docs?/, /documentazione/, /glossario/, /glossary/, /adrs?/, /context\.md/, /domain model/,
  /modello di dominio/, /terminologia/, /terminology/,
]
// /code-review is left out: Claude Code has a built-in of that name, which matt-bridge does not cover.
const MATT_COMMANDS = /\/(grill-me|grill-with-docs|grilling|to-prd|to-spec|to-issues|to-tickets|tdd|implement|implement-spec|pr|triage|diagnose|diagnosing-bugs|prototype|handoff|wayfinder|improve-codebase-architecture|setup-matt-pocock-skills|ask-matt|zoom-out)/
// "tonight" counts only next to work ("lascia girare tutto stanotte", "lancia un worker stanotte"),
// not in any sentence that mentions the night.
const TONIGHT_WORK = [
  /(lavora|lancia|lascia|fai|fallo|falla|gira|continua|procedi|mergia|esegui|avvia|controlla|finisci|sistema|implementa)\w*( \S+){0,5} (stanotte|questa notte)/,
  /(stanotte|questa notte)( \S+){0,3} (lavora|continua|procedi|gira|lancia|mergia|controlla|finisci)\w*/,
]

// ---------------------------------------------------------------- the route table

export const ROUTES = [
  // ------------------------------------------------ process skills
  {
    skill: 'model-mix',
    why: 'model, effort and usage budget for delegated work',
    priority: 100,
    prompt: [
      // launching agents, workers, workflows, reviews
      w(/(lancia|lanciare|lanciamo|lancio|avvia|avviare|avviamo|fai partire|spawna|delega|delegare|manda|mandare) (un |uno |una |il |lo |la |i |gli |le |dei |degli |delle |altri |altre |\d+ |due |tre |quattro |cinque |sei |otto |piu' )?(nuov[oaie] )?(agent[ei]|subagent[ei]?|sub-agent[ei]?|worker|workflow|review|revision[ei]|reviewer|sessione cloud|sessioni cloud)/),
      w(/(launch|start|spawn|kick off|fire off|delegate to|dispatch|send out) (an? |the |some |more |another |\d+ |two |three |four |five |six |eight |several |multiple |parallel |new )*(agents?|subagents?|sub-agents?|workers?|workflows?|reviewers?|cloud sessions?|code reviews?|reviews?)/),
      // choosing model and effort
      w(/(quale|che|which|what) effort/, /effort (alto|basso|medio|massimo|high|low|medium|xhigh|max)/,
        /(sonnet|opus|fable|haiku) (o|oppure|or|vs\.?|versus) (sonnet|opus|fable|haiku)/,
        /(con|su|usa|usare|use|with|on) (sonnet|opus|fable|haiku)/,
        /(quale|che) modello (uso|usare|usiamo|devo usare|per (il |i |l'|lo |la |gli |le )?(worker|agent[ei]|subagent[ei]?|review|workflow|sessione))/,
        /which model (should|to use|for (the |this |a |each )?(worker|agent|subagent|review|workflow|session))/),
      // usage, consumo, budget, limite, piano
      w(/(weekly|settimanale|5-hour|five-hour|5h|plan|account|claude|token) usage/,
        /usage (limits?|budget|left|remaining|settimanale|del piano)/, /\/usage/, /how much usage/, /quanto usage/, /l'usage/,
        /consum\w* (di |dei |del |della )?(token|usage|budget|piano|abbonamento|limite|limiti)/,
        /quanto (ho |abbiamo |sto |stiamo |hai |ha )?consumat[oi]/, /consumo settimanale/),
      w(/budget (di oggi|settimanale|del piano|rimasto|residuo|left|today|check|verde|giallo|rosso|green|yellow|red)/,
        /budget (ci |mi )?(resta|rimane)/, /(quanto|how much) budget/, /(controlla|verifica|check) (il |the )?budget/,
        /(c'?e'?|abbiamo|is there|do we have|we have) (ancora )?(abbastanza |enough )?budget/),
      w(/limit[ei] (settimanal[ei]|delle 5 ore|di 5 ore|di utilizzo|d'uso|del piano|di claude)/,
        /(weekly|5-hour|five-hour|5h|usage|plan) limits?/, /finestra (delle |di )?5 ore/, /5-hour window/),
      // plan tiers and draining the account
      w(/max (da )?(100|200|5 ?x|20 ?x)/, /(piano|account|abbonamento|plan) (plus|pro|max)/,
        /(senza (far )?|non )consumare (tutto|tutti)/, /consumare tutto l'?account/, /(burn|drain)\w* (through )?(the |my )?(account|plan|limits?)/),
      w(/piano (max|pro|team|enterprise|claude)/, /(mio|nostro|del|sul) piano (claude|max|pro|di abbonamento)/,
        /max (20x|5x)/, /(my|the|our) (claude |max |pro )?plan (limits?|allows|budget)/),
    ],
  },
  {
    skill: 'smart-ultracode',
    why: 'when and how wide to run a multi-agent workflow',
    priority: 95,
    prompt: [
      w(/ultracode/, /fan[- ]?out/, /multi-?agent[ei]?/, /multiagente/,
        /orchestr\w* (gli |degli |dei |the |of |many |multiple |several )?(agent[ei]?|agents|subagent\w*|worker)/),
      w(/workflow (multi-?agent[ei]?|di agenti|script|tool)/,
        /(scrivi|scrivere|lancia|lanciare|avvia|write|launch|start) (un |il |a |the )?workflow/),
      w(/(agent[ei]|worker|subagent[ei]?|sessioni)( \S+){0,3} in parallelo/, /in parallelo( \S+){0,3} (agent[ei]|worker|subagent[ei]?)/,
        /parallel (agents|subagents|workers|reviewers)/, /in parallel (with|across|using) (agents|subagents|workers)/),
      w(/(tanti|molti|piu'|parecchi|diversi|\d+) (agent[ei]|subagent[ei]?)/, /(many|lots of|multiple|several|a dozen|\d+) (agents|subagents)/),
      w(/audit completo/, /full audit/, /complete audit/,
        /audit (dell'intero|di tutto il|dell'intera|del|della) (repo|codebase|progetto|base di codice)/,
        /audit (of )?(the )?(whole|entire) (repo|codebase|project)/),
    ],
  },
  {
    skill: 'coordinator-method',
    why: 'delegating, merging and rounds as coordinator',
    priority: 90,
    prompt: [
      w(/coordin(a|are|ati|atore|atrice|amento|ando)/, /coordinator/, /coordinate (the )?(workers|agents|work|sessions)/),
      // worker, but not the web/service/queue kinds
      w(/(?<!(web|service|shared|celery|cloudflare|sidekiq|queue|background|thread|gunicorn|uvicorn|pool|node) )workers?/),
      // "merge" only together with PR words (or the Italian verb, which means a PR merge here)
      w(/merg\w*( \S+){0,4} (pr|prs|pull requests?)/, /(pr|prs|pull requests?)( \S+){0,4} merg\w*/, /mergia\w*/),
      w(/(nuovo|prossimo|altro) (giro|round)/, /giro di (controllo|controlli|check|merge|review)/,
        /(inizia|iniziamo|comincia|cominciamo) (un |il |un altro |il prossimo |un nuovo )?(giro|round)/,
        /(start|next|new|another) round/, /round (di|of) (check|checks|controllo|controlli|review|merge)/),
      w(/roadmap/),
      w(/vado a (dormire|letto)/, ...TONIGHT_WORK, /tutta la notte/, /durante la notte/, /overnight/, /buona ?notte/),
      w(/deleg(a|are|ato|ata|ando|hiamo)/, /delegate (this|it|the work|to)/),
    ],
  },

  // ------------------------------------------------ the eleven new skills
  {
    skill: 'overnight',
    why: 'going to sleep or away for hours',
    priority: 80,
    prompt: [
      w(/vado a (dormire|letto|nanna)/, /me ne vado a (dormire|letto)/, /buona ?notte/, ...TONIGHT_WORK,
        /tutta la notte/, /durante la notte/,
        /(lascia|lasciala|lascialo|fallo|falla|tienilo|tienila) (girare|lavorare|andare|in esecuzione)/,
        /lavora (mentre|finche') (dormo|non ci sono|sono via)/, /mentre (dormo|sono via|non ci sono)/,
        /torno (domattina|domani mattina|tra (qualche|un paio d'|\d+) or[ae])/,
        /sono via (tutta la notte|per (qualche|\d+|un paio d') or[ae]|fino a domani)/,
        /vado (fuori|via) per (qualche|un paio d'|\d+) or[ae]/, /mi assento/),
      w(/going to (sleep|bed)/, /off to (sleep|bed)/, /good ?night/, /overnight/, /tonight/,
        /keep (going|working|running) (tonight|while i'?m away|while i sleep)/,
        /while i(?:'m| am)? (sleep|sleeping|away|out|gone)/, /away until (morning|tomorrow)/,
        /(leaving|logging off|signing off) for the (night|day)/, /unattended (run|session|work)/,
        /(back|be back) (in the morning|tomorrow morning|in a few hours)/),
      // loops, wakes, watchers that last hours
      w(/svegliati ogni/, /sveglia(mi)? ogni/, /wake (me |up )?every/, /set up a wake/,
        /(imposta|metti) (un |una )?(wake|sveglia|watcher|monitor)/, /monitora (le pr|la ci|i worker)/,
        /poll (the )?(prs?|ci)( overnight)?/, /controlla (la ci|le pr) (stanotte|di notte)/),
      // limits during the night, machine awake, notifications, morning summary
      w(/autocontinueatusagelimit/, /(riprende|ripartira'?|resumes?|continues?) (dopo|after) (il |the )?(reset|limite|limit)/,
        /(tieni|tenere|mantieni) (il )?(computer|pc|portatile|mac) sveglio/, /keep (the |my )?(computer|pc|laptop|machine|mac) awake/,
        /(va|andra'?) in (standby|sospensione)/, /remote control (dal|from) (telefono|phone)/,
        /avvisami solo/, /(mandami|avvisami con) (una )?(notifica|push)/, /send me (a )?(push|notification)/,
        /notify me only/, /morning summary/,
        /riepilogo (di stamattina|mattutino|del mattino)/, /cosa hai fatto (stanotte|questa notte)/,
        /what did you do (last night|overnight)/, /quanto costa tenere (la sessione )?aperta/),
    ],
  },
  {
    skill: 'merge-gate',
    why: 'merging a PR',
    priority: 79,
    prompt: [
      // "merge" only together with PR words
      w(/merg\w*( \S+){0,4} (pr|prs|pull requests?)/, /(pr|prs|pull requests?)( \S+){0,4} merg\w*/,
        /mergia(re|mo|la|le|lo)?/, /merg\w* (la |the )?#\d+/,
        /(unisci|integra) (la |questa |le )?(pr|pull request)/),
      w(/(pr|pull request)( #?\d+)? (e'? )?(pronta|verde|approvata)/, /(pr|pull request)( #?\d+)? (is )?(ready|green|approved)/,
        /ready to merge/, /(ok|good) to merge/, /e'? verde,? (puoi )?(fare il )?merge/,
        /(review|revisione|controlla\w*) prima del merge/, /(review|check) (this |it |the pr )?before (the )?merg(e|ing)/,
        /pre-merge/, /merge[- ]gate/, /squash and merge/, /gh pr merge/, /dependabot/,
        /(controlla|rivedi|revisiona|guarda) (le |la |questa |queste |tutte le )?(pr|pull request)\b/, /(check|review) (the |these |this |my |open )?(prs|pull requests)\b/),
      w(/ship (it|this pr|the pr|questa pr)/, /rilascia (la |questa )pr/,
        /chiudi (le )?pr (superate|duplicate|vecchie)/, /close (the )?superseded (prs|pull requests)/,
        /(il )?merge (e'? stato )?(rifiutato|bloccato)/, /merge (was )?(refused|blocked|rejected)/, /merge without review/,
        /sincronizza (le )?copie installate/),
    ],
  },
  {
    skill: 'cloud-worker',
    why: 'launching and following cloud workers',
    priority: 78,
    prompt: [
      w(/(worker|sessione|sessioni) (cloud|remot[oaie])/, /cloud (worker|workers|sessions?|sessione)/, /remote workers?/,
        /claude --cloud/, /--cloud/, /move_to_cloud/, /--teleport/, /teleport/),
      w(/(manda|mandalo|mandala|sposta|spostalo|fallo girare|falla girare|fai girare|esegui|lancia|gira) (\S+ ){0,4}(in|nel|sul) cloud/,
        /(run|send|move|push|put) (\S+ ){0,4}(in|to|on) the cloud/),
      w(/launch\.exp/, /launch\.ps1/, /expect (non c'?e'?|non trovato|not found|is missing|missing)/,
        /(no|senza) expect/, /lancio worker senza expect/),
      w(/(recupera|raccogli|collect|find|trova) (la |the )?pr (del|of the|from the) worker/,
        /(collect|find) the worker'?s pr/, /dov'?e'? finito il worker/,
        /(scrivi|manda un messaggio|message) (al|to the) (cloud )?worker( cloud)?/,
        /(controlla|check) (la |the )?(sessione cloud|cloud session)/),
    ],
  },
  {
    skill: 'smart-mods',
    why: 'writing, testing or installing a mod',
    priority: 77,
    prompt: [
      w(/mods?/),
      w(/claude plugin/, /--plugin-dir/, /plugin\.json/, /plugin marketplace/, /marketplace (di|of) plugin/,
        /plugin (di|per|for) claude( code)?/, /claude code plugin/,
        /(installa|installare|install|vet|controlla|valida|validate|scrivi|scrivere|write|crea|creare|create|review) (un |il |questo |quel |this |that |a |the )?plugin/),
      w(/(pannello|pane|fascia|band|banda|barra) (sopra|above|over) (il |the )?(prompt|composer|input)/,
        /(pannello|pane) (con|with) (le |the )?(tab|tabs|schede)/,
        /(pannello|pane|fascia|band|status ?line|toast|spinner) (in|di|dentro|inside|for|per|nel) claude( code)?/),
      w(/(nuovo|crea|creare|aggiungi|aggiungere|registra|registrare|scrivi|scrivere) (un |il |nuovo )*comando( slash| \/\S+)/,
        /(new|custom|create|add|register|write) (a |an |the )?(custom )?slash command/, /\$\.command\.register/),
      w(/guard (che|that|per|for|on|su|sui|sulle|sul) (i |le |the )?(tool|bash|powershell|comandi|commands|chiamate|calls)/,
        /(tool|command|shell|bash|powershell) guard/, /guard hook/, /tool\.call/, /tool\.check/, /hooks\.json/, /plugin-authoring/),
    ],
  },
  {
    skill: 'mod-ui',
    why: 'what a mod draws: band, pane, card, toast',
    priority: 76,
    prompt: [
      w(/(interfaccia|aspetto|colori|grafica|stile|tema|ui|disegno) (del|dei|di un|per il|per un|of the|of a|for the|for a) mods?/,
        /mods? (ui|interface|interfaccia)/, /(restyle|ristila|ridisegna|redraw) (il |the |this |questo )?mod/, /theme keys/),
      w(/(barra|fascia|band|banda) (sopra|above|over) (il |the )?(prompt|composer|input)/,
        /(pannello|pane) (con|with) (le |the )?(tab|tabs|schede)/,
        /(pannello|pane|band|fascia|card|scheda|toast|notifica) (al|del|nel|for the|to the|in the|of the) mod/,
        /(scheda|card) (nella|in the|in) chat/, /toast (solo|only) (per|for)/,
        /(mostra|show) (una |un |a )?(notifica|toast) (in|dentro|nel|inside) claude/),
      w(/stato sempre visibile/, /always visible (status|state)/, /status ?line (del|di un|for a|of the|of a|per il) mod/,
        /svg (progress )?bar/, /(text|testo) fallback/, /fallback (di testo|testuale|text)/,
        /aboveprompt/, /ui\.render/, /commandoutput/),
    ],
  },
  {
    skill: 'matt-bridge',
    why: "running Matt Pocock's skills in this workflow",
    priority: 75,
    prompt: [
      w(MATT_COMMANDS),
      w(/skills? (di|of|by) matt( pocock)?/, /matt'?s skills?/, /matt pocock/),
      w(/(dall'|da un'|l')idea (al|alla|a|in|ai) (prd|spec|ticket)/, /idea to (prd|spec|shipped|tickets)/,
        /(trasforma|turn|convert) (l'idea|this|it|the idea|questa idea) (in|into) (un |una |a )?(prd|spec)/,
        /prd e (i )?ticket/),
      w(/implementa (la spec|il ticket|l'issue|la issue)/, /implement (the |this )?(spec|ticket)/,
        /ready-for-agent/, /ready-for-human/, /needs-info/, /afk agent/, /red-green-refactor/,
        /passa il lavoro a un worker/, /scrivi l'handoff/, /fammi il grilling/, /fai il triage/,
        /stress-?testa il piano/, /stress-test this plan/, /spezza in (issue|ticket)/, /break (it|this) into issues/,
        /fai un prototipo/, /prototype this/, /diagnostica il bug/, /diagnose this bug/, /hand this off/),
    ],
  },
  {
    skill: 'roadmap-tracker',
    why: 'roadmap issue, milestones, labels, tickets',
    priority: 74,
    prompt: [
      w(/roadmap/),
      w(/ho mergiato/, /abbiamo mergiato/, /(pr|pull request) (e'? stata )?(mergiata|merged)/, /merged (the |this )?(pr|pull request)/),
      w(/(inizia|iniziamo|cominciamo|start) (un |il |a |the )?(nuovo |new )?(round|giro)/, /where were we/,
        /dove eravamo( rimasti)?/, /riparti(amo)? dalla roadmap/),
      w(/(apri|aprire|apriamo|crea|creare|creiamo) (un |una |l'|il |la |i |gli |le |dei |delle |degli |nuov[oaie] )*(issue|ticket)/,
        /(open|create|file) (an |a |the |new |some )+(issues?|tickets?)/,
        /break (this |it |the plan )?(down )?into (issues|tickets)/, /spezza in (issue|ticket|task)/),
      w(/cosa c'?e'? in coda/, /cosa (aspetta|attende) me/, /(what'?s|what is) (ready|queued|waiting|blocked)/,
        /ready for agents?/, /cosa e'? bloccato/),
      w(/milestones?/, /ready-for-agent/, /ready-for-human/, /needs-info/, /needs-triage/, /wontfix/,
        /labels? (di triage|del tracker|delle issue|su github|on (the )?issues|for (the )?issues)/,
        /(sistema|sistemare|imposta|impostare|set up|fix) (le |the )?labels/),
      w(/(fissa|pinna|pin|unpin) (la |the )?roadmap/, /(controlla|check|audit|pulisci|clean up) (il |the )?(tracker|backlog)/,
        /backlog/, /chiudi (il |i |questo |the )?ticket/, /close (it |this )?as not planned/,
        /collega (i |le )?(ticket|issue)/, /blocked-by/,
        /mark (it |this |them )?as blocked by/, /(issue|issues|ticket|tickets)( \S+){0,2} blocked by/, /sub-?issues?/),
    ],
  },
  {
    skill: 'context-hygiene',
    why: 'context size: compact, clear or hand off',
    priority: 73,
    prompt: [
      w(/sessione (lunga|lunghissima|pesante)/, /troppo contesto/, /contesto (e'? )?(pieno|alto|quasi pieno|al \d+)/,
        /context (window )?(is )?(filling|full|almost full|high|at \d+)/, /how full is (the |my )?context/, /long session/),
      w(/\/compact/, /\/clear/, /compatt(a|are|iamo|ala) (la |il )?(sessione|conversazione|contesto|chat)/,
        /(clear|compact) (or|vs\.?|o|oppure) (clear|compact|handoff)/, /serve un handoff/,
        /(hand ?off|passa) (to|a) (a |una )?(fresh|new|nuova) (session|sessione)/, /auto-?compact/),
      w(/consuma troppo/, /(i )?token (finiscono|stanno finendo)/, /usage (drains|is draining|goes down) fast/,
        /why is (this|it) so expensive/, /reduce (the )?token (usage|cost)/, /riduci (i |il consumo di )?token/,
        /what is eating (my |the )?context/, /cosa (mangia|occupa) (il )?contesto/, /\/context/, /\/usage attribution/),
      w(/troppi (mcp|server mcp|skill|connettori)/, /too many (mcp|mcp servers|skills|connectors|tools)/,
        /disable unused (mcp )?servers/, /(trim|snellisci|accorcia) (il )?claude\.md/, /claude\.md (troppo lungo|too long)/),
      w(/prompt cache/, /cache (ttl|miss)/, /cache (di|da) (1|un') ?ora/, /1-hour cache/, /la cache (scade|e'? scaduta)/),
    ],
  },
  {
    skill: 'verified-research',
    why: 'research with checked sources',
    priority: 72,
    prompt: [
      // not a search through files or code ("fai una ricerca nel file per TODO")
      w(/(fai|fare|fammi|serve|facciamo) (una )?ricerca(?! (nel|nei|nella|nelle|in|del|dei|della|sul|sui) (file|codice|repo|repository|progetto|cartella|directory|log|sorgenti))/,
        /ricerca (approfondita|verificata|con fonti|sul web|online)/,
        /deep research/, /(do|run) (some |a )?research/, /research (on|into|about|what|whether|how)/),
      w(/verifica (queste|questa|le|la) (affermazioni|affermazione|fonti|fonte|claim|info|informazioni)/,
        /controlla le fonti/, /check (the )?sources/, /fact-?check/, /is (this|that|it) still true/, /e'? ancora vero/,
        /vale ancora/, /is (this|that) (still )?(accurate|up to date|current)/),
      w(/quali sono i limiti (adesso|ora|attuali|oggi)/, /what are the (current )?limits/,
        /(con|with) (fonti|sources) (ufficiali|official)/, /fonti ufficiali/, /official (sources|docs|documentation)/,
        /cosa dicono (i docs|la documentazione)/, /what (do|does) the docs say/, /non fidarti della memoria/,
        /don'?t trust (your )?memory/, /apri la fonte/, /confronta (le )?opzioni/, /compare (the )?options/),
    ],
  },
  {
    skill: 'release-watch',
    why: 'new Claude Code releases, models, limits',
    priority: 71,
    prompt: [
      w(/(novita'?|qualcosa di nuovo|cosa c'?e'? di nuovo) (in|su|di|per) claude( code)?/,
        /(anything|what'?s) new (in|with|for) claude( code)?/,
        /nuova versione (di |del )?(claude|desktop)/, /new (claude code |claude |desktop )(version|release)/,
        /(e'?|sono) uscit[oaie] (una |un )?(nuova versione|claude|haiku|opus|sonnet|nuovo modello)/,
        /did (a |the )?(new )?(claude code )?(version|release) (ship|come out)/,
        /controlla (gli )?aggiornamenti/, /check for updates/, /claude update/, /release[- ]?watch/,
        /changelog (di|of) claude( code)?/, /claude( code)? changelog/, /cosa e'? cambiato nel changelog/,
        /what changed in the changelog/),
      w(/(che|quale|which) versione( di claude code)? (ha|usa) (il )?desktop/, /which version does (the )?desktop/,
        /haiku 5\.5/, /is haiku .{0,6} out/, /nuovo modello (di claude|anthropic|uscito)/,
        /(e'? uscito|is out|released|rilasciato) (un |a )?(nuovo modello|new model)/,
        /(model|modello|modelli)( \S+){0,2} (retir\w*|in ritiro|deprecat\w*)/,
        /sono cambiati i (modelli|limiti)/, /(have|did) the (models?|limits?|plan limits?) change/,
        /(api|tipi) dei mod/, /mods? (api|types)( changed| cambiat\w*)/, /(did|has) the mods api change/,
        /skill di matt sono cambiate/, /upstream (changes?|changed|cambiat\w*)/, /(changed|cambiat\w*) upstream/,
        /skills? (obsolete|out of date|outdated)/, /tienimi aggiornato/, /version floor/),
    ],
  },
  {
    skill: 'skill-audit',
    why: 'auditing skills: triggers, tokens, risk',
    priority: 70,
    prompt: [
      w(/audit (delle|the|my|of|of my|of the) skills?/, /skills? audit/, /controlla le skill/, /rivedi (questa|la) skill/,
        /review (this|the|my) (skill|skill\.md)/, /skill\.md/, /snellisci (la |le )?skill/, /accorcia la descrizione/,
        /trim (the |a |this )?skill/),
      w(/la skill non parte/, /skill (doesn'?t|does not|won'?t|isn'?t) trigger/, /parte quando non deve/,
        /triggers? (at the wrong time|when it shouldn'?t)/, /due skill si contendono/, /two skills (compete|fight)/),
      w(/costo (in )?token (di una|della|delle) skill/, /skill token cost/, /quanto costano le skill/,
        /il contesto e'? pesante di skill/, /skills? listing/, /skill di terzi/, /third-party skills?/,
        /e'? sicura questa skill/, /is this skill safe/, /(valida|validate) (il |the )?frontmatter/,
        /skill frontmatter/, /disable-model-invocation/, /skilloverrides/, /context: fork/, /regole duplicate/,
        /duplicated rules/, /skill-doctor/),
    ],
  },
  {
    skill: 'skill-creator',
    why: 'creating a new skill',
    priority: 65,
    prompt: [
      w(/(crea|creare|creiamo|scrivi|scrivere|scriviamo|fai|fare|facciamo) (una |delle |altre |nuove |la )?(nuova |nuove )?skills?\b/,
        /(che |quali )?altre skills? (possiamo|potremmo|puoi) (creare|fare|scrivere)/,
        /(create|write|make|build) (a |new |another |more |other )?(new )?skills?\b/, /what other skills (can|could) we/),
    ],
  },
  {
    skill: 'windows-ops',
    why: 'Windows shell, path and CRLF rules',
    priority: 69,
    prompt: [
      w(/su windows/, /on windows/, /git bash/, /powershell/, /wsl/),
      w(/(percorso|path|nome( del)? file) troppo lungo/, /(path|filename) too long/, /crlf/, /autocrlf/, /core\.longpaths/,
        /(quale|che|which) shell/, /sintassi (del comando )?non (e'? )?valida/, /msys2?_\w+/, /claude_config_dir/,
        /is not a valid statement separator/, /not recognized as (an internal|the name)/, /non e'? riconosciuto come comando/,
        /(expect|pwsh) (non trovato|not found)/),
      w(/dove (sta|stanno|tiene|si trova|si trovano) (la config|le impostazioni|i file|le skill) di claude/,
        /where (does|do) claude( code)? keep/, /versione di claude code (del|nel|in) desktop/, /desktop vs\.? cli/),
    ],
  },

  // ------------------------------------------------ Matt Pocock's skills
  {
    skill: 'grill-with-docs',
    why: 'grilling a plan against docs, glossary and ADRs',
    priority: 60,
    prompt: [both(GRILL, DOCS)],
  },
  {
    skill: 'grill-me',
    why: 'one-question interview to stress-test a plan',
    priority: 59,
    unless: ['grill-with-docs'],
    prompt: [w(...GRILL)],
  },
  {
    skill: 'to-prd',
    why: 'turning the discussion into a PRD',
    priority: 58,
    prompt: [
      w(/prd/, /to-prd/, /product requirements?( doc(ument)?)?/,
        /(scrivi|stendi|raccogli|documenta|definisci|scrivere|raccogliere) (i |dei )?requisiti/, /documento (dei )?requisiti/,
        /requirements doc(ument)?/, /(write|draft) (the |a |up )?(spec|specification|requirements)/,
        /(scrivi|stendi) (la |una )?spec(ifica)?/),
    ],
  },
  {
    skill: 'to-issues',
    why: 'splitting a plan into tracker issues',
    priority: 57,
    prompt: [
      w(/to-issues/, /(spezza|dividi) (il piano |la spec |il prd |questo )?in (task|issue|ticket)/,
        /break (it |this |the plan |the prd |the spec |that )?(down )?into (issues|tickets|tasks)/,
        /(crea|creare|apri|aprire|create|open) (i |gli |le |dei |degli |delle |the |some )(ticket|tickets|issues)/,
        /convert (the |this )?(plan|prd|spec) into (issues|tickets)/, /vertical slices?/, /tracer[- ]bullets?/),
    ],
  },
  {
    skill: 'tdd',
    why: 'red-green-refactor, tests first',
    priority: 56,
    prompt: [w(/tdd/, /test[- ]driven/, /test prima/, /prima i test/, /tests? first/, /test-first/, /red[- ]green/, /red\/green/)],
  },
  {
    skill: 'triage',
    why: 'triaging issues by label state',
    priority: 55,
    prompt: [
      w(/triage/, /triag(ia|iare|iamo)/, /smista(re)? (le )?(issue|segnalazioni|bug)/, /incoming (issues|bugs|reports)/,
        /prepar(e|a) (the |le )?issues? (for|per) (an |un )?(afk|agente)/),
    ],
  },
  {
    skill: 'diagnose',
    why: 'reproduce, minimise and fix a bug',
    priority: 54,
    unless: ['triage'],
    prompt: [
      w(/bugs?/, /debugg(a|are|ami|iamo|ing)/, /(fai|facciamo|fare) (il )?debug/,
        /debug (this|it|that|the (crash|error|issue|failure|test)|questo|questa)/),
      w(/non funziona(no)?/, /non compila/, /non parte piu'?/, /smesso di funzionare/, /si e'? rotto/, /e'? rotto/,
        /doesn'?t work/, /does not work/, /not working/, /isn'?t working/, /stopped working/,
        /(is|it'?s|are|got) broken/, /crash(a|ano|ato|es|ed|ing)?/, /regressione/, /regression/),
      w(/(c'?e'?|ho|abbiamo|ottengo|mi da'?|da'?|esce|appare|vedo|ricevo|lancia|restituisce|segnala) (un |l'|questo |quest'|lo stesso |uno strano |strano )?(errore|eccezione)/,
        /(got|getting|get|throws?|throwing|seeing|hit|hitting) (an? |this |the |the same |a weird |weird )?(error|exception)/),
    ],
  },
  {
    skill: 'handoff',
    why: 'handoff document for a fresh session',
    priority: 53,
    prompt: [
      w(/hand-?off/, /hand off/, /passa (a|ad) (un'?|una )?altra sessione/, /riprendi (in|da) (un'?|una )?altra sessione/,
        /(continua|riprendi|prosegui) (in|su) (una )?nuova sessione/, /(fresh|new) session (to|that) (pick|picks|continue)/,
        /pick (it |this )?up in (a |another )(new |fresh )?session/),
    ],
  },
  {
    skill: 'prototype',
    why: 'throwaway prototype to try a design',
    priority: 52,
    prompt: [w(/prototip(o|i|are|iamo|a)/, /prova di concetto/, /proof of concept/, /mock[- ]?ups?/, /prototyp(e|es|ing)/)],
  },
  {
    skill: 'improve-codebase-architecture',
    why: 'architecture and refactoring opportunities',
    priority: 51,
    prompt: [
      w(/architettura/, /architecture/, /(?<!green[- ])refactor(ing|ize)?/, /refactorizza(re)?/, /accoppiament(o|i)/, /accoppiat[oaie]/,
        /tightly[- ]coupled/, /coupling/),
    ],
  },
  {
    skill: 'zoom-out',
    why: 'big picture of unfamiliar code',
    priority: 50,
    personOnly: true,
    prompt: [w(/visione d'insieme/, /zoom[- ]?out/, /quadro generale/, /big(ger)? picture/, /vista dall'alto/, /high-level (view|overview|picture)/)],
  },

  // ------------------------------------------------ built-ins, when installed
  {
    skill: 'schedule',
    why: 'scheduled cloud agent (routine)',
    priority: 45,
    prompt: [
      w(/(programma|programmare|pianifica|schedula) (un |una |il |la |l')?(task|agente|routine|controllo|job|esecuzione|run|sessione)/,
        /programmalo/, /ogni giorno alle/, /ogni (lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|mattina|sera)/,
        // a routine or cron only when set up as one, not a function or a failing job
        /(crea|creare|imposta|impostare|programma|set up|create|add|schedule) (una |un |a |the )?(nuova |new )?routines?/,
        /(cloud|scheduled|programmat[ae]) routines?/, /routines? (cloud|programmat[ae]|schedulat[ae])/, /(le mie|my) routines/,
        /cron ?jobs?/, /crontab/, /(imposta|crea|aggiungi|set up|add|create) (un |a )?cron/,
        /every (day|morning|evening|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday) at/,
        /schedule (a|an|the) (agent|task|routine|run|job|check)/, /(una volta|once) (domani|tomorrow) (alle|at)/),
    ],
  },
  {
    skill: 'loop',
    why: 'repeat a prompt on an interval',
    priority: 44,
    prompt: [
      w(/ogni \d+ (minuti|minuto|min|secondi|ore|ora)/, /every \d+ ?(minutes?|mins?|m|seconds?|hours?|h)/,
        /controlla di continuo/, /continua a controllare/, /keep (checking|polling)/, /\/loop/,
        /(metti|mettilo|fallo|run it|put it) in (un )?loop/, /in loop (ogni|every)/),
    ],
  },
]

// ---------------------------------------------------------------- prompt matching

const MAX_CHARS = 6000

// The text the routes read: fenced code blocks out, lower case, no accents, straight apostrophes,
// single spaces. Throws on anything that is not text.
export function normalize(text) {
  if (typeof text !== 'string') throw new TypeError('prompt text is not text')
  return text
    .slice(0, MAX_CHARS)
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Routes whose patterns match, highest priority first (table order on ties), one per skill.
export function matchRoutes(text, routes = ROUTES) {
  const t = normalize(text)
  const hits = routes.filter(r => r.prompt.some(p => p.test(t)))
  const names = new Set(hits.map(r => r.skill))
  return hits
    .filter(r => !(r.unless || []).some(s => names.has(s)))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.priority - a.r.priority || a.i - b.i)
    .map(x => x.r)
}

// A skill or command name without its plugin prefix or slash: 'cs:merge-gate' -> 'merge-gate'.
export function skillTail(name) {
  if (typeof name !== 'string') throw new TypeError('skill name is not text')
  return name.trim().replace(/^\//, '').split(':').pop().trim().toLowerCase()
}

// The names $.command.list() gives, as tails. Entries that are not { name: string } are skipped.
export function namesFrom(list) {
  const out = new Set()
  if (!Array.isArray(list)) return out
  for (const c of list) {
    if (c && typeof c.name === 'string' && c.name.trim()) out.add(skillTail(c.name))
  }
  return out
}

// Whether a command list can say which skills exist: one that names none of the routed skills
// probably lists no skills at all (an engine listing only commands), so it is not trusted and the
// table counts instead.
export function trustedList(names, routes = ROUTES) {
  return names.size > 0 && routes.some(r => names.has(r.skill))
}

// The slash command a prompt starts with ('/grill-me the plan' -> 'grill-me'), else null.
export function leadingCommand(text) {
  if (typeof text !== 'string') throw new TypeError('prompt text is not text')
  const m = /^\s*\/([A-Za-z0-9_:.-]+)/.exec(text)
  return m ? skillTail(m[1]) : null
}

// Where a prompt comes from the person. Composer and bridge are typed by the person. 'sdk' is kept on
// purpose although the types call it the SDK host's own turn: the Desktop app's Code tab delivers
// what the person types that way, so dropping it would silence the router there. A `claude -p`
// script gets the hidden line too; that costs one line, never a hold. Never task notifications,
// plugins, scheduled triggers, peers or relays.
export const PERSON_ORIGINS = ['composer', 'bridge', 'sdk']

export function isPersonOrigin(origin) {
  return !!(origin && typeof origin === 'object' && PERSON_ORIGINS.includes(origin.kind))
}

// The skills to suggest for one of the person's prompts.
//   installed     Set of skill names that exist, or null when unknown (then the table counts)
//   loaded        Set of skill names already loaded this session
//   suggestedAt   Map skill -> number of the person's prompt it was last suggested on
//   promptNo      this prompt's number (1, 2, ...)
// A skill suggested on prompt n is skipped on prompts n+1 .. n+window.
export function pickSuggestions({ text, installed, loaded, suggestedAt, promptNo, routes = ROUTES, max = 3, window = 5 }) {
  const typed = leadingCommand(text)
  const out = []
  for (const r of matchRoutes(text, routes)) {
    if (typed && r.skill === typed) continue
    if (installed && !installed.has(r.skill)) continue
    if (loaded && loaded.has(r.skill)) continue
    const last = suggestedAt ? suggestedAt.get(r.skill) : undefined
    if (typeof last === 'number' && promptNo - last <= window) continue
    out.push(r)
    if (out.length >= max) break
  }
  return out
}

// The one English line the model reads beside the prompt.
export function contextLine(picks) {
  const loadable = picks.filter(p => !p.personOnly)
  const manual = picks.filter(p => p.personOnly)
  const parts = []
  if (loadable.length) {
    parts.push(`skill-router: skills relevant to this request, not loaded yet: ${loadable.map(p => `${p.skill} (${p.why})`).join(', ')}. Load each with the Skill tool before acting.`)
  }
  if (manual.length) {
    const list = manual.map(p => `/${p.skill} (${p.why})`).join(', ')
    parts.push(`${loadable.length ? '' : 'skill-router: '}Only the person can run ${list}: suggest it if it fits.`)
  }
  return parts.join(' ')
}

// The dim transcript line the person sees.
export function logLine(picks, lang) {
  const names = picks.map(p => (p.personOnly ? '/' : '') + p.skill).join(', ')
  return (lang === 'en' ? 'suggested skills: ' : 'skill suggerite: ') + names
}

// ---------------------------------------------------------------- prerequisite gates

// Each gate: what is about to happen (English, for the model) and the skills it needs first.
export const GATES = {
  workflow: { doing: 'launching a workflow', skills: ['model-mix', 'smart-ultracode'] },
  agent: { doing: 'launching an agent', skills: ['model-mix'] },
  cloud: { doing: 'launching a cloud session', skills: ['model-mix', 'cloud-worker'] },
  merge: { doing: 'merging a PR', skills: ['merge-gate'] },
  mod: { doing: "writing a mod's files", skills: ['smart-mods'] },
  modUi: { doing: "drawing a mod's interface", skills: ['mod-ui'] },
}

// New skills a gate names only when the command list shows them; with the list unknown, the
// established ones (model-mix, smart-ultracode, smart-mods) are assumed installed.
export const LISTED_ONLY = ['cloud-worker', 'merge-gate', 'mod-ui']

function joinAnd(items) {
  if (items.length <= 1) return items.join('')
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

// Which of these gates fire now. state: { loaded: Set, installed: Set|null, fired: Set }.
// Returns null (nothing to hold) or { keys, skills, reason }: the caller marks keys fired and denies.
export function gateCheck(keys, state) {
  const hit = []
  const skills = []
  for (const key of keys) {
    const gate = GATES[key]
    if (!gate || state.fired.has(key)) continue
    const missing = gate.skills.filter(s =>
      (state.installed ? state.installed.has(s) : !LISTED_ONLY.includes(s)) && !state.loaded.has(s))
    if (!missing.length) continue
    hit.push(key)
    for (const s of missing) if (!skills.includes(s)) skills.push(s)
  }
  if (!hit.length) return null
  const doing = joinAnd(hit.map(k => GATES[k].doing))
  return {
    keys: hit,
    skills,
    reason: `skill-router: before ${doing}, load ${joinAnd(skills)} with the Skill tool, then retry this exact call. This check fires once per session, so the retry passes.`,
  }
}

export function gateLog(tool, skills, lang) {
  return lang === 'en'
    ? `skill-router: ${tool} held once, load first: ${skills.join(', ')}`
    : `skill-router: ${tool} fermato una volta, da caricare prima: ${skills.join(', ')}`
}

// ---------------------------------------------------------------- Write and Edit (mod gate)

// The gates a Write or Edit asks for; whether the file sits in a mod is the caller's fs check.
export function writeGates(input) {
  if (typeof input.file_path !== 'string') throw new TypeError('file_path is not text')
  const text = input.tool === 'Edit' ? input.new_string : input.content
  return typeof text === 'string' && /ui\.render/.test(text) ? ['mod', 'modUi'] : ['mod']
}

function sepOf(path) {
  return path.includes('\\') ? '\\' : '/'
}

// The folders above a file, nearest first, at most `max`, never a drive or filesystem root.
export function ancestorDirs(filePath, max = 6) {
  if (typeof filePath !== 'string') throw new TypeError('file_path is not text')
  const sep = sepOf(filePath)
  const parts = filePath.split(/[\\/]+/)
  const dirs = []
  for (let n = parts.length - 1; n >= 1 && dirs.length < max; n--) {
    const head = parts.slice(0, n)
    if (head.length === 1 && (head[0] === '' || /^[A-Za-z]:$/.test(head[0]))) break
    dirs.push(head.join(sep))
  }
  return dirs
}

export function joinPath(dir, ...names) {
  return [dir.replace(/[\\/]+$/, ''), ...names].join(sepOf(dir))
}

function canon(path) {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

export function samePath(a, b) {
  return canon(a) === canon(b)
}

export function isUnder(path, dir) {
  return canon(path).startsWith(canon(dir) + '/')
}

// ---------------------------------------------------------------- shell commands (cloud and merge gates)
// The tokenizer is model-guard's (rules.js): heredoc bodies and PowerShell here-strings are data,
// so a brief or commit text that only mentions `claude --cloud` or `gh pr merge` holds nothing.

const SEPARATORS = new Set([';', '|', '&', '(', ')', '\n', '\r'])
const PREFIX_WORDS = ['exec', 'nohup', 'time', 'command', 'env', 'sudo', 'npx', 'bunx', 'call', 'xargs', 'source', '.']

function heredocWord(command, i) {
  let word = ''
  while (i < command.length) {
    const c = command[i]
    if (c === ' ' || c === '\t' || SEPARATORS.has(c) || c === '<' || c === '>') break
    if (c === "'" || c === '"') {
      const close = command.indexOf(c, i + 1)
      if (close < 0) { word += command.slice(i + 1); i = command.length; break }
      word += command.slice(i + 1, close)
      i = close + 1
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[i + 1]
      i += 2
    } else {
      word += c
      i++
    }
  }
  return { word, next: i }
}

// Index just past the line that ends a heredoc body, or -1 when no line ends it (then the rest is
// scanned as commands: a missed launch costs more than a false hold).
function heredocEnd(command, from, h) {
  let p = from
  while (p <= command.length) {
    const nl = command.indexOf('\n', p)
    const stop = nl < 0 ? command.length : nl
    let line = command.slice(p, stop)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (h.stripTabs) line = line.replace(/^\t+/, '')
    if (line === h.word) return nl < 0 ? command.length : nl + 1
    if (nl < 0) return -1
    p = nl + 1
  }
  return -1
}

// A PowerShell here-string at i (`@'` or `@"` closing its line): { end, body }, else null.
function hereString(command, i) {
  const q = command[i + 1]
  if (command[i] !== '@' || (q !== "'" && q !== '"')) return null
  const nl = command.indexOf('\n', i + 2)
  if (nl < 0 || command.slice(i + 2, nl).trim() !== '') return null
  const close = command.indexOf('\n' + q + '@', nl)
  if (close < 0) return null
  return { end: close + 3, body: command.slice(nl + 1, close).replace(/\r$/, '') }
}

// Splits a Bash or PowerShell line into segments of tokens { value, start, end }. Never throws on
// odd input; heredoc bodies add no tokens; a here-string is one token holding its body. A heredoc
// inside a `$(...)` inside double quotes (the commit and PR idiom `"$(cat <<'EOF' ... EOF\n)"`) is
// data too: its body stays in the quoted token, and its quotes never close the string.
// Keep this tokenizer identical to model-guard's (rules.js).
export function tokenize(command) {
  const segments = [[]]
  let tok = null
  let heredocs = []
  const push = () => {
    if (tok) { segments[segments.length - 1].push(tok); tok = null }
  }
  const startTok = i => { if (!tok) tok = { value: '', start: i, end: i } }
  let i = 0
  while (i < command.length) {
    const c = command[i]
    if (c === ' ' || c === '\t') { push(); i++; continue }
    if (c === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
      push()
      let j = i + 2
      const stripTabs = command[j] === '-'
      if (stripTabs) j++
      while (command[j] === ' ' || command[j] === '\t') j++
      const { word, next } = heredocWord(command, j)
      if (word) heredocs.push({ word, stripTabs })
      i = next
      continue
    }
    if (SEPARATORS.has(c)) {
      push()
      if (segments[segments.length - 1].length) segments.push([])
      i += (c === '&' || c === '|') && command[i + 1] === c ? 2 : 1
      if (c === '\n' && heredocs.length) {
        for (const h of heredocs) {
          const end = heredocEnd(command, i, h)
          if (end < 0) break
          i = end
        }
        heredocs = []
      }
      continue
    }
    const here = c === '@' ? hereString(command, i) : null
    if (here) {
      startTok(i)
      tok.value += here.body
      i = here.end
      tok.end = i
      continue
    }
    startTok(i)
    if (c === "'") {
      const close = command.indexOf("'", i + 1)
      const stop = close < 0 ? command.length : close
      tok.value += command.slice(i + 1, stop)
      i = close < 0 ? command.length : close + 1
    } else if (c === '"') {
      let subs = 0 // open `$(` inside this string
      let inner = [] // heredocs opened inside them, waiting for the end of their line
      i++
      while (i < command.length && command[i] !== '"') {
        const d = command[i]
        if (d === '$' && command[i + 1] === '(') {
          subs++
          tok.value += '$('
          i += 2
          continue
        }
        if (d === ')' && subs > 0) subs--
        if (subs > 0 && d === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<') {
          let j = i + 2
          const stripTabs = command[j] === '-'
          if (stripTabs) j++
          while (command[j] === ' ' || command[j] === '\t') j++
          const { word, next } = heredocWord(command, j)
          if (word) inner.push({ word, stripTabs })
          tok.value += command.slice(i, next)
          i = next
          continue
        }
        if (d === '\n' && inner.length) {
          let p = i + 1
          for (const h of inner) {
            const end = heredocEnd(command, p, h)
            if (end < 0) { p = -1; break }
            p = end
          }
          inner = []
          if (p > 0) {
            tok.value += command.slice(i, p)
            i = p
            continue
          }
        }
        if ((d === '\\' || d === '`') && (command[i + 1] === '"' || command[i + 1] === '\\' || command[i + 1] === '`')) {
          tok.value += command[i + 1]
          i += 2
        } else {
          tok.value += d
          i++
        }
      }
      i++
    } else {
      tok.value += c
      i++
    }
    tok.end = Math.min(i, command.length)
  }
  push()
  return segments.filter(s => s.length)
}

function baseName(value) {
  const parts = value.split(/[\\/]/)
  return parts[parts.length - 1].toLowerCase()
}

function isClaude(value) {
  return /^claude(\.exe|\.cmd|\.ps1)?$/.test(baseName(value))
}

function isLaunchScript(value) {
  return /^launch\.(exp|ps1)$/.test(baseName(value))
}

// Index of the segment's command word, past `VAR=value` and prefix words.
function commandIndex(seg) {
  let i = 0
  while (i < seg.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i].value) || PREFIX_WORDS.includes(seg[i].value))) i++
  return i < seg.length ? i : -1
}

const SHELLS = /^(bash|sh|zsh|dash|pwsh|powershell|cmd)(\.exe)?$/
const SCRIPT_FLAG = /^(-[a-z]*c|-command|\/c|\/k)$/i
const REST_SHELLS = /^(pwsh|powershell|cmd)(\.exe)?$/
const STARTERS = ['start-process', 'start', 'saps']

// The scripts a nested shell may run (`bash -lc "..."`, `pwsh -Command "..."`, `cmd /c ...`), in the
// order to try, else null. For cmd and PowerShell the script flag takes the rest of the segment; a
// quoted script with more words after it is tried as the quoted text first (`cmd /c "gh pr merge 3"
// 2>&1`), then as the rest of the segment (`cmd /c "claude" --cloud x`), as model-guard does.
function nestedScripts(command, seg, ci) {
  const shell = baseName(seg[ci].value)
  if (!SHELLS.test(shell)) return null
  for (let j = ci + 1; j < seg.length - 1; j++) {
    if (!SCRIPT_FLAG.test(seg[j].value)) continue
    if (!REST_SHELLS.test(shell) || j + 2 >= seg.length) return [seg[j + 1]]
    const rest = { value: command.slice(seg[j + 1].start, seg[seg.length - 1].end) }
    const q = command[seg[j + 1].start]
    return q === '"' || q === "'" || q === '@' ? [seg[j + 1], rest] : [rest]
  }
  return null
}

function hasFlag(values, ...names) {
  return values.some(v => names.includes(v) || names.some(n => v.startsWith(n + '=')))
}

// Whether claude's arguments start a cloud session: `--cloud`, except with `-p`/`--print` and no
// `--environment`, which only queues a message to an existing session (`claude -p "<msg>" --cloud
// <session_id|cse_id|url>`): steering open work, never held. Local `-p`/`--bg` runs (a resume of a local
// session included) are not gated here.
function cloudLaunch(values) {
  return hasFlag(values, '--cloud') && !(hasFlag(values, '-p', '--print') && !hasFlag(values, '--environment'))
}

// ---------------------------------------------------------------- indirect launches (Start-Process, start)
// What a starter hands claude is a Windows command line, and re-reading its quoting kept letting launches
// through. So the argument list is never read: only which program the starter runs, from the starter's
// own parameters, and claude there is held once as a cloud launch whatever its arguments say.
// Keep this block identical to model-guard's (rules.js).

// Start-Process's switches and the parameters that take a value. PowerShell accepts any prefix of a name
// (`-NoNew`, `-File`) and `-Name:value` as one word; an unknown name is taken to have a value.
const START_SWITCHES = ['wait', 'nonewwindow', 'nnw', 'passthru', 'loaduserprofile', 'lup', 'usenewenvironment', 'verbose', 'debug', 'whatif', 'confirm']
const START_VALUED = ['argumentlist', 'args', 'workingdirectory', 'windowstyle', 'verb', 'credential', 'environment', 'redirectstandardinput', 'redirectstandardoutput', 'redirectstandarderror', 'rsi', 'rso', 'rse']
const START_FILE = ['filepath', 'path', 'pspath']
// cmd's start switches that take the next word (`/D C:\dir`); the others (`/MIN`, `/WAIT`, `/B`) take none.
const CMD_VALUED = ['d', 'node', 'affinity']

function startSwitch(name) {
  return START_SWITCHES.some(s => s.startsWith(name)) && ![...START_VALUED, ...START_FILE].some(v => v.startsWith(name))
}

// The words after a starter, as units: a word, or a `( ... )` group with what touches it (`@('a','b')`,
// `(Get-Command claude).Source`). The statement runs on past breaks made only of parentheses (and of
// newlines inside them, or after a ` or \ line continuation) and ends at any other separator.
function starterUnits(command, segments, k, ci) {
  const units = []
  let prev = segments[k][ci]
  let depth = 0
  let carry = false
  for (let s = k; s < segments.length; s++) {
    for (let j = s === k ? ci + 1 : 0; j < segments[s].length; j++) {
      const tok = segments[s][j]
      let apart = !units.length
      for (const ch of command.slice(prev.end, tok.start)) {
        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)
        else if (ch === ' ' || ch === '\t' || ((ch === '\n' || ch === '\r') && (depth > 0 || carry))) apart = apart || depth === 0
        else return units
      }
      prev = tok
      carry = /^[`\\]$/.test(command.slice(tok.start, tok.end))
      if (carry) continue
      if (apart) units.push([tok])
      else units[units.length - 1].push(tok)
    }
  }
  return units
}

// Whether a starter (Start-Process, start, saps, cmd's start) runs claude: the -FilePath value when one
// is given, else the first positional word; cmd's start takes a double-quoted first word as the window
// title (`start "" claude`). A path counts (`C:\x\claude.exe`), and so does a group naming claude
// (`(Get-Command claude).Source`).
function startsClaude(command, segments, k, ci) {
  const units = starterUnits(command, segments, k, ci)
  const names = u => u.some(t => isClaude(t.value))
  // The last unit of a value: PowerShell's array commas (`'a', 'b'`) carry it on.
  const valueEnd = j => {
    while (j + 1 < units.length && (command[units[j][units[j].length - 1].end - 1] === ',' || command[units[j + 1][0].start] === ',')) j++
    return j
  }
  let file = null // null: no -FilePath; else whether one names claude
  const positional = []
  for (let i = 0; i < units.length; i++) {
    const word = units[i].length === 1 ? units[i][0].value : ''
    const param = /^-([a-z][a-z0-9]*)(?::([\s\S]*))?$/i.exec(word)
    if (param) {
      const name = param[1].toLowerCase()
      if (START_FILE.some(f => f.startsWith(name))) {
        file = !!file || names(param[2] !== undefined ? [{ value: param[2] }] : units[i + 1] || [])
        if (param[2] === undefined) i = valueEnd(i + 1)
      } else if (param[2] === undefined && !startSwitch(name)) i = valueEnd(i + 1)
      continue
    }
    const sw = /^\/\/?([a-z][^/]*)$/i.exec(word)
    if (sw && !isClaude(word)) {
      if (CMD_VALUED.includes(sw[1].toLowerCase())) i = valueEnd(i + 1)
      continue
    }
    positional.push(units[i])
  }
  if (file !== null) return file
  if (!positional.length) return false
  if (names(positional[0])) return true
  const title = baseName(segments[k][ci].value) === 'start' && command[positional[0][0].start] === '"'
  return title && positional.length > 1 && names(positional[1])
}

// The first argument that is not a flag (`expect -f launch.exp`, `powershell -NoProfile -File x.ps1`).
function firstOperand(args) {
  for (let j = 0; j < args.length; j++) {
    const a = args[j]
    if (/^-f(ile)?$/i.test(a)) return args[j + 1] || null
    if (!a.startsWith('-')) return a
  }
  return null
}

// The gate segment k of a command asks for: 'cloud', 'merge' or null. claude run by Start-Process or
// cmd's start is a cloud launch whatever its arguments: they are never read.
function segmentGate(command, segments, k, ci) {
  const seg = segments[k]
  const word = seg[ci].value
  const name = baseName(word)
  const args = seg.slice(ci + 1).map(t => t.value)
  if (isClaude(word) && cloudLaunch(args)) return 'cloud'
  if (isLaunchScript(word)) return 'cloud'
  if (/^expect(\.exe)?$/.test(name) || REST_SHELLS.test(name)) {
    const op = firstOperand(args)
    if (op && isLaunchScript(op)) return 'cloud'
  }
  if (STARTERS.includes(name)) {
    if (startsClaude(command, segments, k, ci)) return 'cloud'
    if (args.some(a => isLaunchScript(a) || /launch\.(exp|ps1)(['",]|$)/i.test(a))) return 'cloud'
  }
  if (/^gh(\.exe)?$/.test(name)) {
    for (let i = 0; i < Math.min(args.length - 1, 4); i++) {
      if (args[i] === 'pr' && args[i + 1] === 'merge') return 'merge'
    }
    if (args[0] === 'api' && args.some(a => /\/pulls\/\d+\/merge$/.test(a))) return 'merge'
  }
  return null
}

// The gates a Bash or PowerShell command asks for: [] | ['cloud'] | ['merge'] | ['cloud', 'merge'].
// Nested shells (`bash -c "..."`, `pwsh -Command "..."`) are read too, up to 3 levels deep.
export function shellGates(command, depth = 0) {
  if (typeof command !== 'string') throw new TypeError('command is not text')
  if (!/claude|launch\.(exp|ps1)|gh/i.test(command)) return []
  const keys = []
  const add = key => { if (key && !keys.includes(key)) keys.push(key) }
  const segments = tokenize(command)
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k]
    const ci = commandIndex(seg)
    if (ci < 0) continue
    const scripts = depth < 3 ? nestedScripts(command, seg, ci) : null
    if (scripts) {
      for (const script of scripts) {
        const found = shellGates(script.value, depth + 1)
        if (!found.length) continue
        for (const key of found) add(key)
        break
      }
      continue
    }
    add(segmentGate(command, segments, k, ci))
  }
  return keys
}
