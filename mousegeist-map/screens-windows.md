# Windows

Testo della mappa delle schermate, in italiano come l'interfaccia. Le righe «Testi a schermo» sono le parole esatte da usare; « · » separa elementi sulla stessa riga.

## 1 · Installazione e collegamento

### 1.1 Scarica e installa (`w-install`)

Stato: Proposta · Piano: Core

Oggi su Windows si installa da PowerShell, in due pezzi: il programma e il motore.

Da sapere:
- Su Windows non servono permessi: il passo 1.2 del Mac sparisce.

Aperto: La stessa finestra del Mac con angoli vivi e due soli passi: motore e collega la tua AI.

Testi a schermo:
```text
mousegeist · Passo 1 di 2
Installa Mousegeist
La tua AI lavora nelle app. Tu continui a usare il computer.
App · pronta
Motore per mouse e tastiera · 62%
Collega la tua AI · passo 2
Annulla · Continua
```

Porta a: w-perm

### 1.2 Niente permessi, un limite (`w-perm`)

Stato: Esiste · Piano: Core

Windows non chiede permessi come il Mac. Mousegeist deve girare nella sessione dell'utente.

Da sapere:
- Le finestre aperte come amministratore vengono rifiutate dal motore.
- Portare una finestra davanti può darle il fuoco per un attimo.

Aperto: Avvisare nel pannello quando l'AI prova a usare una finestra da amministratore.

Testi a schermo:
```text
Gestione attività (amministratore) · ─ ☐ ✕
Processi
Prestazioni
Servizi
```

Porta a: w-connect

### 1.3 L'AI si collega (`w-connect`)

Stato: Esiste · Piano: Core

Stessa riga di configurazione del Mac, da PowerShell o dal file del client.

Da sapere:
- Qualsiasi AI con MCP: Claude Code, Codex, Cursor.

Testi a schermo:
```text
Windows PowerShell · ─ ☐ ✕
PS C:\Users\anna> · claude mcp add mousegeist -- mousegeist · Aggiunto server MCP "mousegeist". · PS C:\Users\anna> · claude · › /mcp · mousegeist · ● collegato · 35 strumenti
```

Porta a: w-first

### 1.4 Primo avvio: icona vicino all'orologio (`w-first`)

Stato: Costruita, da provare · Piano: Core

Il cursore pixel compare nell'area di notifica vicino all'orologio. Il pannello si apre sopra.

Da sapere:
- Angoli vivi come il sito: su Windows non c'è il vetro del Mac.
- Da provare nei test Windows del 4 e 5 novembre.

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

Porta a: w-license (se compri)

### 1.5 Attiva Personal con un clic (`w-license`)

Stato: Proposta · Piano: Personal

Come sul Mac: un clic dalla pagina di ringraziamento apre l'app e attiva la licenza.

Da sapere:
- Riserva: codice nella mail.

Testi a schermo:
```text
mousegeist.app · ─ ☐ ✕
Grazie, Anna
Personal è tuo.
Apri Mousegeist e attiva
mousegeist · Personal
Personal attivo
Grazie! Lavoro in background, cursore sulla barra e registro sono sbloccati.
Licenza
Questo computer · 1 di 2
Acquisto · una volta, [prezzo]
Hai un codice? · Sposta su un altro computer
```

## 2 · Prima azione e modalità

### 2.1 Parte in Piano (`w-choose`)

Stato: Proposta · Piano: Core

Come sul Mac: nessuna finestra all'avvio, si parte in Piano e si cambia dal pannello.

Da sapere:
- La scelta resta salvata.
- Le richieste arrivano come carta sopra l'icona vicino all'orologio, senza rubare la tastiera.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Ultima azione alle 19:06: apre un'app, fatta.
Modalità
Manuale · Piano · Auto
Approvi il piano una volta.
```

Porta a: w-manual (Manuale), w-plan (Piano), w-auto (Auto)

### 2.2 Manuale: conferma ogni azione (`w-manual`)

Stato: Costruita, da provare · Piano: Core

Ogni azione chiede il permesso. In alto: chi chiede (es. «Claude Code chiede»). Poi l'azione in grande, l'app con la sua icona e una riga di dettaglio.

Da sapere:
- Deciso 4/11: sulla scheda non c'è più la scelta della modalità. Si cambia solo dal pannello in alto.
- «Ricorda per Discord» ricorda app e azione. Non compare per le azioni rischiose.
- Annulla e Consenti, che è il tasto verde.
- In fondo: «Premi Esc in qualsiasi momento per fermare l'agente».
- Del testo da scrivere mostra solo quanti caratteri sono, mai il contenuto.
- Angoli vivi, come il sito.

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

Porta a: w-remember (Ricorda)

### 2.3 Piano: approvi la lista una volta (`w-plan`)

Stato: Costruita, da provare · Piano: Core

Titolo «Approvi questo piano?», l'app e i passi numerati, uno per riga. I passi rischiosi sono segnati «attenzione» in arancione.

Da sapere:
- Il tasto verde è «Esegui il piano».
- Dopo il sì esegue solo quei passi. Un passo nuovo richiede un nuovo piano.
- Qui non c'è «Ricorda»: un piano vale una volta sola.

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

### 2.4 Auto: chiede solo se è rischioso (`w-auto`)

Stato: Costruita, da provare · Piano: Core

In Auto non compare nessuna scheda: clic, scorrere e scrivere partono da soli. La scheda compare solo per le azioni rischiose, con in alto «Azione rischiosa» e senza «Ricorda».

Da sapere:
- Rischiose: aprire, chiudere o nascondere un'app, portare una finestra davanti, Invio, Cancella, testo che finisce con un a capo.
- Le azioni rischiose non vengono mai ricordate.
- Deciso 4/11: la scheda di richiesta è per Manuale e Piano. In Auto esce solo per il rischio.

Testi a schermo:
```text
Mousegeist · Azione rischiosa
Premere Invio
Discord
Invia il messaggio nella chat aperta.
Annulla · Consenti
Premi · Esc · in qualsiasi momento per fermare l'agente
```

### 2.5 Permesso ricordato (`w-remember`)

Stato: Costruita, da provare · Piano: Core

Le regole salvate compaiono nel pannello con Revoca.

Da sapere:
- Le regole restano sul computer.

Aperto: Regola anche per destinatario, come sul Mac.

Testi a schermo:
```text
mousegeist · 1 AI collegata
Attivo
Ultima azione alle 19:08: scrive testo, inviata.
Permessi ricordati
Discord · Scrive testo · Revoca
Calcolatrice · Clic · Revoca
```

## 3 · Mentre l'AI lavora

### 3.1 Il cursore dell'AI (`w-cursor`)

Stato: Esiste · Piano: Core

Il cursore pixel dell'AI su Windows: lo stesso del Mac, grande il doppio, con scia e onda al clic. Disegnato come sovrapposizione sopra lo schermo.

Da sapere:
- Il motore su Windows lavora già in background, senza muovere il tuo mouse.
- Aperto: con le app dello Store di Windows non funziona ancora bene.
- Aperto: la prima volta parte lento.

Testi a schermo:
```text
Discord · ─ ☐ ✕
Server · # generale · # idee
giulia · ci sentiamo stasera?
ciao · |
```

Porta a: w-moves (movimenti), w-covered (app coperta)

### 3.2 Come si muove (`w-moves`)

Stato: Esiste · Piano: Core

Gli stessi sei movimenti del Mac.

Da sapere:
- Dritto, Curva, Assesta, Aggancio, Picchiata, Auto.
- Scia, onda al clic, galleggio da fermo e modo prudente uguali al Mac.

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

### 3.3 App coperta: cursore sulla barra (`w-covered`)

Stato: Esiste · Piano: Personal

Come sul Mac: se l'app è coperta, il cursore sta sul suo pulsante nella barra delle applicazioni e fa l'onda a ogni clic.

Da sapere:
- Un clic sul pulsante porta l'app davanti e guardi l'AI dal vivo.
- Aperto: se la barra delle applicazioni è in alto o di lato, la posizione è da sistemare.
- Aperto: app dello Store.

Testi a schermo:
```text
Calcolatrice · ─ ☐ ✕
Note · la tua finestra · ─ ☐ ✕
```

Porta a: w-multi (più app)

### 3.3b Più app: carte «+1» (`w-multi`)

Stato: Esiste · Piano: Personal

Come sul Mac: il cursore sta sul pulsante dell'ultima app nella barra, le altre dietro come carte con «+1».

Da sapere:
- Al passaggio del mouse le carte si aprono sopra la barra; un clic porta quell'app davanti.
- Aperto: lo zoom del ventaglio è da sistemare.
- Aperto: barra in alto o di lato.

Testi a schermo:
```text
Note · la tua finestra · ─ ☐ ✕
=
Calcolatrice · Clic su «=»
ora
D
Discord · Scrive in #generale
4 s fa
Clicca una carta per vederla lavorare
```

### 3.4 Pannello completo (`w-panel`)

Stato: Costruita, da provare · Piano: Core

Stessi contenuti del Mac: stato, il tasto Ferma, modalità, permessi ricordati, ultime azioni, Registro, Cartella, Esci.

Da sapere:
- Angoli vivi, stesso vetro blu-viola della scheda di conferma.
- Si apre sopra l'orologio, vicino a dove hai cliccato.
- Come sul Mac: mai pannello e scheda insieme. Con una richiesta in attesa il pannello mostra «1 richiesta in attesa · Apri».
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
Registro attività · Cartella · Esci
```

Porta a: w-pause (Ferma), w-estop (Esc), w-log (Registro)

### 3.5 Fermato (`w-pause`)

Stato: Costruita, da provare · Piano: Core

Come sul Mac: l'azione in corso è interrotta e niente riparte finché non premi Riprendi.

Da sapere:
- Riprendi è il tasto verde.
- Deciso 4/11 (da provare).

Testi a schermo:
```text
mousegeist · 1 AI collegata
Fermato
L'azione in corso è stata interrotta. Niente riparte finché non premi Riprendi.
Riprendi
```

### 3.6 Stop di emergenza: Esc (`w-estop`)

Stato: Esiste · Piano: Core

Esc ferma subito l'AI anche su Windows.

Aperto: Lo stesso avviso a schermo del Mac, con angoli vivi.

Testi a schermo:
```text
esc
Fermato · Ho interrotto l'azione in corso. Nessun'altra parte finché non riprendi dal menu.
```

### 3.7 Registro attività (`w-log`)

Stato: Proposta · Piano: Personal

La stessa vista del Mac. Oggi il file si apre nel Blocco note.

Da sapere:
- Del testo salva solo la lunghezza.

Aperto: Da costruire insieme alla versione Mac.

Testi a schermo:
```text
Registro attività · Cerca un'azione · ─ ☐ ✕
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
