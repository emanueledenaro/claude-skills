# Simulazioni

Testo della mappa delle schermate, in italiano come l'interfaccia. Le righe «Testi a schermo» sono le parole esatte da usare; « · » separa elementi sulla stessa riga.

## 5 · Un programmatore con Claude Code

### 5.1 Il compito, dal terminale (`d-ask`)

Stato: Proposta · Piano: Core

Marco scrive a Claude Code: «sistema il bug del login e provalo nell'app sul simulatore». Claude Code corregge il codice, avvia l'app e usa Mousegeist per provarla.

Da sapere:
- Arriva una sola carta: il piano dei passi, limitato a Simulator.
- Le altre app restano chiuse all'AI per tutto il compito.
- Domanda da verificare: se Claude Code ha già approvato il compito, la carta di Mousegeist si può saltare?

Testi a schermo:
```text
Terminale · claude
› · sistema il bug del login e provalo nell'app sul simulatore · ● Modifico LoginView.swift (2 righe) · ● Avvio l'app nel simulatore · ● Uso Mousegeist per provarla…
Mousegeist · Claude Code chiede
Approvi questo piano?
Simulator
1 · Clic su «Accedi»
2 · Scrivere 18 caratteri
3 · Leggere il messaggio
Solo in Simulator. Le altre app restano chiuse all'AI.
Annulla · Esegui il piano
```

### 5.2 Prova l'app mentre scrivi codice (`d-work`)

Stato: Proposta · Piano: Personal

Marco continua a scrivere in Xcode. Il simulatore sta dietro, l'AI ci clicca dentro e il cursore pixel sta sulla sua icona nel Dock.

Da sapere:
- È la modalità in background: il motivo per cui Marco paga.
- Un clic sull'icona e guarda la prova dal vivo.

Testi a schermo:
```text
Simulator
Xcode · la tua finestra
12 · func login() async { · 13 · guard let token = … · |
```

### 5.3 Finestre che l'AI non vede (`d-hide`)

Stato: Proposta · Piano: Core

Password manager, file .env con le chiavi, mail: per l'AI sono rettangoli vuoti. Non li vede nelle immagini e non ci può cliccare.

Da sapere:
- Lista decisa da te nelle impostazioni.
- Gratis: la sicurezza la deve avere chiunque.

Testi a schermo:
```text
1Password
Nascosta all'AI
.env · Xcode
Nascosta all'AI
mousegeist · Impostazioni
L'AI non vede mai
1Password · Togli
File .env · Togli
Mail · Togli
+ Aggiungi app o file
```

### 5.4 La prova, pronta per la PR (`d-proof`)

Stato: Proposta · Piano: Personal

A fine prova Mousegeist mostra i passi in immagini, con il risultato («Benvenuto, Marco»). «Copia nella PR» li incolla nella pull request.

Da sapere:
- Chi rivede il codice vede che l'app funziona davvero.
- Le immagini restano sul computer finché non le copi.

Testi a schermo:
```text
Fatto · Prova del login
Simulator · 4 passi · 41 s
Passo 3 · «Benvenuto, Marco» · login riuscito
1
2
3
4
Copia nella PR · Salva come GIF · Resta sul computer finché non la copi
```

## 6 · Un'azienda con Claude Code Enterprise

### 6.1 Installato per tutti, senza domande (`e-deploy`)

Stato: Proposta · Piano: Team

L'IT di Acme manda Mousegeist a 200 Mac insieme alle impostazioni aziendali di Claude Code: modalità, Auto spenta, app vietate, dove va il registro.

Da sapere:
- Claude Code Enterprise permette già all'azienda di distribuire e bloccare server MCP (verificato sulla documentazione).
- Il programmatore non configura niente.
- L'azienda paga a sedia, cioè per ogni persona, come per Claude Code Enterprise (deciso 3/11). Prezzo per sedia: oggi Team [prezzo] al mese, minimo 3.

Testi a schermo:
```text
Terminale · claude
# inviato dall'IT a 200 Mac · # insieme alle impostazioni di Claude Code · { · "mousegeist" · : { "azienda": "Acme", "licenza": "ACME-7Q2K-…", "sedie": 200, "modalità": "Piano", "auto": "spenta", "app_vietate": ["Banca", "HR", "1Password"], "registro": "inviato alla sicurezza" } }
```

### 6.1b La licenza si attiva da sola (`e-seat`)

Stato: Proposta · Piano: Team

La licenza dell'azienda arriva con l'installazione. Al primo avvio Mousegeist occupa una sedia e il pannello dice «Licenza attiva»: nessun codice da inserire.

Da sapere:
- Si paga a sedia: una per persona.
- L'IT vede quante sedie sono usate e libera quelle di chi esce.
- Se le sedie finiscono, il nuovo arrivato vede «Chiedi all'IT una sedia» e Mousegeist resta in Core (gratis).

Testi a schermo:
```text
mousegeist · Gestito da Acme
Licenza attiva
Acme ti ha dato una sedia. Non devi inserire niente.
Sedie di Acme
37 usate su 200 · si rinnova il 1/12
Il tuo piano
Team · tutte le funzioni
```

### 6.2 Il pannello dice chi decide (`e-locked`)

Stato: Proposta · Piano: Team

Nel pannello compare «Gestito da Acme». Le regole aziendali hanno il lucchetto. Auto è spenta e spiegata.

Da sapere:
- Ognuno può aggiungere regole più strette, mai più larghe.

Testi a schermo:
```text
mousegeist · Gestito da Acme
Attivo
Modalità
Manuale · Piano · Auto 🔒
Auto è spenta dalla tua azienda.
Regole di Acme
Banca, HR, 1Password · vietate · 🔒
Mail, Slack · Invia: chiedi · 🔒
Le tue regole
Simulator · Clic · Revoca
```

### 6.3 Registro per la sicurezza (`e-audit`)

Stato: Proposta · Piano: Team

La squadra sicurezza vede chi, quando, in quale app e com'è finita, per tutta l'azienda. Può esportarlo verso i suoi strumenti.

Da sapere:
- Mai immagini né testi scritti: solo cosa e quando.
- Filtri: rifiutate, bloccate, app vietate.

Testi a schermo:
```text
Acme · azioni delle AI
Cerca persona o app
Oggi · Rifiutate · App vietate · · · Esporta
OGGI · 1.240 AZIONI · 38 PERSONE · 3 BLOCCATE
11:28
S
Marco · Clic in Simulator · Claude Code · approvato nel piano
fatta
11:26
B
Giulia · Aprire Banca · Claude Code · regola di Acme
bloccata
11:24
S
Luca · Invia su Slack · Claude Code · rifiutata da Luca
rifiutata
11:20
S
Sara · Scrive 12 caratteri · Claude Code · testo non salvato
fatta
Esporta per gli strumenti di sicurezza · Niente immagini né testi: solo cosa e quando
```

### 6.4 Ferma tutto, in tutta l'azienda (`e-stop`)

Stato: Proposta · Piano: Team

Se succede qualcosa, l'IT ferma tutte le AI su tutti i computer con un comando. Ognuno vede «Fermato da Acme».

Da sapere:
- Come Esc, ma per tutta l'azienda.
- Ripartono solo quando lo decide l'IT.

Testi a schermo:
```text
Xcode · la tua finestra
Fermato da Acme · La sicurezza ha messo in pausa le AI su tutti i computer. Ripartono quando lo decide l'IT.
```
