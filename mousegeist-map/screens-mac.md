# Mac

Testo della mappa delle schermate, in italiano come l'interfaccia. Le righe «Testi a schermo» sono le parole esatte da usare; « · » separa elementi sulla stessa riga.

## 1 · Installazione e collegamento

### 1.1 Scarica e installa (`f-install`)

Stato: Proposta · Piano: Core

Oggi Mousegeist si installa da terminale, in due pezzi: il programma e il motore che muove mouse e tastiera.

Da sapere:
- Chi compra non deve aprire il terminale.
- Il motore si scarica da solo durante l'installazione.

Aperto: Una finestra di installazione nello stile del pannello: tre passi (motore, permessi, collega la tua AI), ognuno con il suo stato. Continua si accende solo quando il passo è finito.

Testi a schermo:
```text
mousegeist · Passo 1 di 3
Installa Mousegeist
La tua AI lavora nelle app. Tu continui a usare il computer.
App · pronta
Motore per mouse e tastiera · 62%
Permessi di macOS · passo 2
Collega la tua AI · passo 3
Annulla · Continua
```

Porta a: f-perm

### 1.2 Permessi di macOS (`f-perm`)

Stato: Esiste · Piano: Core

macOS chiede due permessi per il motore: Accessibilità e Registrazione schermo. Il tasto Esc ha un suo piccolo programma con il suo permesso.

Da sapere:
- Senza il permesso di Esc, le azioni restano ferme per sicurezza.
- Su Windows non ci sono permessi da dare.

Aperto: Una guida dentro Mousegeist che apre la pagina giusta delle Impostazioni e spunta ogni permesso appena dato.

Testi a schermo:
```text
GeneraliAspettoNotifichePrivacy e sicurezzaTastiera · Accessibilità Mousegeist motore Mousegeist Esc Registrazione schermo Mousegeist motore
```

Porta a: f-connect

### 1.3 L'AI si collega (`f-connect`)

Stato: Esiste · Piano: Core

Qualsiasi AI che parla MCP può usare Mousegeist: Claude Code, Codex, Cursor e altre. Basta una riga di configurazione.

Da sapere:
- Il server gira sul computer da controllare.
- Si possono collegare più AI insieme: l'icona resta una sola.

Aperto: Un tasto «Collega a Claude / Codex» nell'app, senza toccare file.

Testi a schermo:
```text
~ — zsh
~ % · claude mcp add mousegeist -- mousegeist · Aggiunto server MCP "mousegeist". · ~ % · claude · › /mcp · mousegeist · ● collegato · 35 strumenti · › apri Discord e scrivi ciao in #generale
```

Porta a: f-first

### 1.4 Primo avvio: icona nella barra (`f-first`)

Stato: Costruita, da provare · Piano: Core

Quando un'AI si collega, il cursore pixel compare nella barra dei menu in alto a destra. Il pannello dice che è tutto pronto.

Da sapere:
- Parte in Piano (deciso il 3/11): approvi un piano per compito, non ogni clic.
- Si prova sul Mac con la demo del pannello prima del merge.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Pronto. Nessuna azione finora.
Modalità
Manuale · Piano · Auto
Approvi il piano una volta.
Registro attività · Cartella · Esci
```

Porta a: f-license (se compri)

### 1.5 Attiva Personal con un clic (`f-license`)

Stato: Proposta · Piano: Personal

Dopo il pagamento di [prezzo] la pagina di ringraziamento e la mail hanno «Apri Mousegeist e attiva». Un clic apre l'app e la licenza si attiva da sola.

Da sapere:
- Il pannello mostra «Personal attivo» e su quale computer.
- Riserva: un codice nella mail, da incollare con «Hai un codice?».
- «Sposta su un altro computer» libera questo posto.

Aperto: Deciso 3/11: vale su 2 computer. Da decidere: aggiornamenti per un anno o per sempre?

Testi a schermo:
```text
mousegeist.app
Grazie, Anna
Personal è tuo.
Apri Mousegeist e attiva
mousegeist · Personal
Personal attivo
Grazie! Lavoro in background, cursore nel Dock e registro sono sbloccati.
Licenza
Questo computer · 1 di 2
Acquisto · una volta, [prezzo]
Hai un codice? · Sposta su un altro computer
```

## 2 · Prima azione e modalità

### 2.1 Parte in Piano (`f-choose`)

Stato: Proposta · Piano: Core

All'avvio non si apre nessuna finestra. Mousegeist parte in Piano: l'AI mostra la lista dei passi, tu dici sì una volta e lavori in pace. Si cambia dal pannello.

Da sapere:
- La scelta resta salvata anche dopo il riavvio.
- La vecchia finestra «scegli la modalità» è stata tolta perché disturbava.
- Il vecchio codice a 6 cifre è stato tolto.
- Prima partiva in Manuale: un compito da 30 clic apriva 30 finestre. Cambiato il 3/11 perché disturbava.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Ultima azione alle 19:06: apre un'app, fatta.
Modalità
Manuale · Piano · Auto
Approvi il piano una volta.
```

Porta a: f-manual (Manuale), f-plan (Piano), f-auto (Auto)

### 2.2 Manuale: conferma ogni azione (`f-manual`)

Stato: Costruita, da provare · Piano: Core

Ogni azione chiede il permesso. In alto: chi chiede (es. «Claude Code chiede»). Poi l'azione in grande, l'app con la sua icona e una riga di dettaglio.

Da sapere:
- Deciso 4/11: sulla scheda non c'è più la scelta della modalità. Si cambia solo dal pannello in alto.
- «Ricorda per Discord» ricorda app e azione. Non compare per le azioni rischiose.
- Annulla e Consenti, che è il tasto verde.
- In fondo: «Premi Esc in qualsiasi momento per fermare l'agente».
- Del testo da scrivere mostra solo quanti caratteri sono, mai il contenuto.
- Proposta 3/11: la richiesta è una carta sotto l'icona Mousegeist, non una finestra al centro. Non prende la tastiera: continui a scrivere e rispondi quando vuoi.

Testi a schermo:
```text
Mousegeist · Claude Code chiede
Fare clic su «#generale»
Discord
Il mouse e la tastiera restano tuoi.
Ricorda per Discord
Annulla
Consenti
Premi · Esc · in qualsiasi momento per fermare l'agente
```

Porta a: f-remember (Ricorda)

### 2.3 Piano: approvi la lista una volta (`f-plan`)

Stato: Costruita, da provare · Piano: Core

Titolo «Approvi questo piano?», l'app e i passi numerati, uno per riga. I passi rischiosi sono segnati «attenzione» in arancione.

Da sapere:
- Il tasto verde è «Esegui il piano».
- Dopo il sì esegue solo quei passi. Un passo nuovo richiede un nuovo piano.
- Qui non c'è «Ricorda»: un piano vale una volta sola.
- È la modalità di partenza dal 3/11. Anche il piano arriva come carta sotto l'icona.

Testi a schermo:
```text
Mousegeist · Claude Code chiede
Approvi questo piano?
Discord
1 · Aprire Discord · attenzione
2 · Fare clic su «#generale»
3 · Scrivere 4 caratteri
4 · Premere Invio · attenzione
Annulla · Esegui il piano
Premi · Esc · in qualsiasi momento per fermare l'agente
```

### 2.4 Auto: chiede solo se è rischioso (`f-auto`)

Stato: Costruita, da provare · Piano: Core

In Auto non compare nessuna scheda: clic, scorrere e scrivere partono da soli. La scheda compare solo per le azioni rischiose, con in alto «Azione rischiosa» e senza «Ricorda».

Da sapere:
- Rischiose: aprire, chiudere o nascondere un'app, portare una finestra davanti, Invio, Cancella, testo che finisce con un a capo.
- Le azioni rischiose non vengono mai ricordate.
- Deciso 4/11: la scheda di richiesta è per Manuale e Piano. In Auto esce solo per il rischio.
- Anche qui la richiesta è una carta sotto l'icona, senza rubare la tastiera.

Testi a schermo:
```text
Mousegeist · Azione rischiosa
Premere Invio
Discord
Invia il messaggio nella chat aperta.
Annulla · Consenti
Premi · Esc · in qualsiasi momento per fermare l'agente
```

### 2.5 Permesso ricordato (`f-remember`)

Stato: Costruita, da provare · Piano: Core

Dopo «Ricorda per Discord», la regola compare nel pannello. Revoca la toglie subito.

Da sapere:
- Regola di oggi: app + tipo di azione.
- Le regole restano salvate sul computer, non online.

Aperto: Regola anche per destinatario: «Invia su Discord solo a giulia». Domanda aperta, consiglio sì.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Ultima azione alle 19:08: scrive testo, inviata.
Permessi ricordati
Discord · Scrive testo · Revoca
Calcolatrice · Clic · Revoca
Discord → giulia · Invia · Revoca
```

## 3 · Mentre l'AI lavora

### 3.1 Il cursore dell'AI (`f-cursor`)

Stato: Esiste · Piano: Core

L'AI ha un suo cursore pixel, grande il doppio del cursore di sistema e separato dal tuo. Così vedi dove agisce mentre tu continui a usare il computer.

Da sapere:
- Segue i clic veri dell'AI, prima di ogni azione col puntatore.
- Da fermo galleggia piano, a scatti di un pixel.
- Il cursore di sistema del motore è spento: vedi solo il nostro.
- Stati: attivo, pausa, movimento con scia verde, clic con onda a quadretti.
- Il movimento sceglie da solo lo stile in base alla distanza: breve, curvo o lungo.
- Il cursore non gira mai su se stesso: va sempre dritto al punto.

Testi a schermo:
```text
#generale
Server · # generale · # idee · # musica
giulia · ci sentiamo stasera?
tu · sì dopo le 9
ciao · |
fermo, galleggia
pausa
movimento
clic
```

Porta a: f-moves (movimenti), f-covered (app coperta)

### 3.2 Come si muove (`f-moves`)

Stato: Esiste · Piano: Core

Il cursore dell'AI ha sei modi di muoversi. Va sempre dritto al punto, senza giravolte.

Da sapere:
- Dritto, Curva, Assesta, Aggancio, Picchiata e Auto. Auto sceglie in base alla distanza.
- Scia di pixel verdi che si spegne un pixel alla volta.
- Clic: la freccia scende di 1 pixel e parte un'onda di 12 quadratini in 3 passi.
- Da fermo galleggia di 2 pixel a scatti. La punta non si sposta.
- Prudente: prima di Invio o Cancella va 2,5 volte più lento.
- Segue i clic veri dell'AI.

Testi a schermo:
```text
Dritto · Linea dritta, parte svelto e atterra morbido.
Curva · Curva leggera da un lato, come una mano.
Assesta · Supera di poco il punto e torna.
Aggancio · Si avvicina piano, poi viene catturato.
Picchiata · Arco ampio per i salti lunghi.
Auto · Sceglie da sé: corto Dritto, medio Curva, lungo Picchiata.
Scia · verde, si spegne un pixel alla volta
Clic · scende di 1 pixel, onda di 12 quadratini in 3 passi
Da fermo · galleggia 0·1·2·2·1·0 pixel, la punta resta ferma
Prudente · 2,5× più lento prima di Invio o Cancella
```

### 3.3 App coperta: cursore nel Dock (`f-covered`)

Stato: Esiste · Piano: Personal

Se l'app su cui lavora l'AI è coperta da una tua finestra, il cursore non ti passa sopra. Va sulla sua icona nel Dock e a ogni clic fa la piccola onda di quadratini.

Da sapere:
- Clicchi l'icona: l'app viene davanti e guardi l'AI lavorare dal vivo, con cursore grande, scia e clic.
- Torni alla tua finestra: il cursore torna sull'icona nel Dock.
- Il riquadro nell'angolo è stato scartato il 3/11.

Testi a schermo:
```text
Calcolatrice
Note · la tua finestra
```

Porta a: f-multi (più app)

### 3.3b Più app: carte «+1» (`f-multi`)

Stato: Esiste · Piano: Personal

Se l'AI lavora in più app coperte, il cursore sta sull'icona dell'ultima app usata e le altre si impilano dietro come carte, con il numero «+1».

Da sapere:
- Passi sopra con il mouse: le carte si aprono a ventaglio, una per app, con cosa sta facendo e quando.
- Clicchi una carta: quell'app viene davanti e la guardi lavorare dal vivo.
- La carta dell'app attiva ha il bordo verde.
- Aperto: lo zoom del ventaglio è da sistemare.

Testi a schermo:
```text
Note · la tua finestra
=
Calcolatrice · Clic su «=»
ora
D
Discord · Scrive in #generale
4 s fa
Clicca una carta per vederla lavorare
+1
```

### 3.4 Pannello nella barra dei menu (`f-panel`)

Stato: Costruita, da provare · Piano: Core

Un clic sull'icona apre il pannello: stato, quante AI sono collegate, conferme in attesa, modalità, permessi ricordati, ultime 5 azioni.

Da sapere:
- In alto il titolo grande dice lo stato: Attivo, In pausa, oppure Esc non pronto in rosso.
- Deciso 4/11 (revisione passata, da provare sul Mac, non ancora su main): un solo tasto grande, «Ferma» (come Esc). Interrompe l'azione in corso e blocca le prossime. Poi diventa «Riprendi».
- Registro attività, Cartella di Mousegeist, Esci.
- Il pannello non approva mai una singola azione: quello resta nella scheda di conferma.
- Deciso 4/11: pannello e scheda hanno lo stesso vetro blu-viola traslucido della scheda vera, testo chiaro. Mai due cose aperte insieme: se arriva una richiesta col pannello aperto, il pannello si chiude e la scheda prende il suo posto sotto l'icona.
- Se apri il pannello mentre una richiesta aspetta, la scheda si nasconde e in cima al pannello c'è «1 richiesta in attesa · Apri»: un clic chiude il pannello e riporta la scheda.
- La modalità si sceglie solo qui.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Una richiesta aspetta la tua risposta.
1 richiesta in attesa · Apri ›
FermaEsc
Modalità
Manuale · Piano · Auto
Confermi ogni azione.
Permessi ricordati
Calcolatrice · Clic · Revoca
Ultime azioni
19:48 · Clic · inviata
19:47 · Preme un tasto · rifiutata
19:46 · Scrive testo · inviata
19:45 · Clic · inviata
19:44 · Apre un'app · fatta
Registro attività · Cartella · Esci
```

Porta a: f-pause (Ferma), f-estop (Esc), f-log (Registro)

### 3.5 Fermato (`f-pause`)

Stato: Costruita, da provare · Piano: Core

Dopo Ferma o Esc l'azione in corso è interrotta e ogni nuova azione di ogni AI resta ferma, prima ancora della conferma. L'icona diventa il cursore in pausa.

Da sapere:
- Riprendi è il tasto verde: è l'unica cosa da fare.
- Deciso 4/11 (da provare sul Mac): «Fermato» sostituisce «In pausa», perché ora c'è un solo modo di fermare.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Fermato
L'azione in corso è stata interrotta. Niente riparte finché non premi Riprendi.
Riprendi
```

### 3.6 Stop di emergenza: Esc (`f-estop`)

Stato: Esiste · Piano: Core

Premendo Esc l'AI si ferma subito e l'azione in corso viene interrotta.

Da sapere:
- Se il tasto Esc non risponde, Mousegeist ferma tutto e il pannello mostra «Esc non pronto» in rosso.

Aperto: Un avviso a schermo che conferma lo stop e dice come riprendere. Oggi non c'è nessun segnale visibile.

Testi a schermo:
```text
esc
Fermato · Ho interrotto l'azione in corso. Nessun'altra parte finché non riprendi dal menu.
```

### 3.7 Registro attività (`f-log`)

Stato: Proposta · Piano: Personal

Una finestra nostra che racconta ogni azione dell'AI in parole semplici: ora, app, cosa ha fatto e com'è finita (fatta, rifiutata da te, fermata con Esc).

Da sapere:
- Filtri per app e per esito, più la ricerca.
- Clic su una riga: i dettagli. Per il testo scritto mostra solo quanti caratteri, mai il contenuto.
- Oggi esiste solo il file grezzo, che si apre in TextEdit. «Apri il file» lo tiene raggiungibile.
- Tutto resta sul computer, niente va online.

Aperto: Da costruire. I dati ci sono già nel file di oggi: serve solo la vista.

Testi a schermo:
```text
Registro attività
Cerca un'azione
Tutte le app · Discord · Calcolatrice · · · Tutti gli esiti · Rifiutate
OGGI · 6 AZIONI · 1 RIFIUTATA · 1 FERMATA
19:49
D
Fermata con Esc · Claude Code · Discord
fermata
19:48
=
Clic su «=» · Claude Code · Calcolatrice
fatta
19:47
D
Premere Invio · Claude Code · Discord
rifiutata da te
19:46
D
Scrive testo · Claude Code · Discord
fatta
4 caratteri. · Il testo non viene salvato, solo la lunghezza. Approvata da te in Manuale.
19:45
D
Clic su «#generale» · Claude Code · Discord
fatta
19:44
D
Apre Discord · Claude Code
fatta
Apri il file · Esporta · Resta solo su questo computer
```
