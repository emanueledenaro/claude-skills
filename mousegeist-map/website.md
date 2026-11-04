# Sito web

Testo della mappa delle schermate, in italiano come l'interfaccia. Le righe «Testi a schermo» sono le parole esatte da usare; « · » separa elementi sulla stessa riga.

## 7 · Sito web

### 7.1 Home (`s-home`)

Stato: Costruita, da provare

La home di oggi: «Give your AI hands.», cosa fa in una frase, Get Personal e See how it works, la lista delle AI compatibili e la demo con il cursore.

Da sapere:
- Sistemato: niente più «open source».
- La demo ora dice «Waiting for your yes» invece di «In Manual».

Testi a schermo:
```text
mousegeist.app
Give yourAI hands.
Mousegeist lets your AI really use your computer: it clicks, types, and takes screenshots. It runs on your PC, you approve what it does, and Esc stops it.
Get Personal · See how it works
Works with Claude Code, Codex, Cursor, Gemini CLI, Antigravity CLI, OpenCode, Devin CLI, and Pi. Core is free.
Notepad. Click Save. · Waiting for your yes.
```

Porta a: s-price (Get Personal)

### 7.2 Prezzi (`s-price`)

Stato: Costruita, da provare

Tre carte: Core [prezzo], Personal [prezzo] una volta (poi [prezzo]), Team [prezzo] al mese per 3 sedie ([prezzo] a sedia).

Da sapere:
- Sistemato: niente «open source», attivazione con un clic su 2 computer.
- «A year of updates» è ancora da decidere.
- Le funzioni per piano vanno allineate alle etichette Core, Personal e Team della mappa.

Testi a schermo:
```text
mousegeist.app/#pricing
Pricing
Core
[prezzo]
Free, on your machine.
Works with any MCP agent
Plan, Manual, Auto · Esc
Download
Personal
[prezzo] · once
Then [prezzo]. First 100 customers.
Works in the background
One click to activate
Up to 2 computers
Updates: 1 year?
Get Personal
Team
[prezzo] · /month
[prezzo] a seat. 3 seats at least.
Company rules
Security log
Licence activates by itself
Get Team
```

Porta a: s-pay (compra)

### 7.3 Pagamento (`s-pay`)

Stato: Proposta

La pagina di pagamento del fornitore per Personal o Team. Dopo il pagamento si arriva al Grazie.

Da sapere:
- Per Team si scelgono le sedie prima di pagare.

Testi a schermo:
```text
checkout · pagamento sicuro
Mousegeist · Personal · [prezzo] · One payment · 2 computers
Email
Card number
MM / YY · CVC
Pay [prezzo]
```

Porta a: s-thanks (pagato)

### 7.4 Grazie: attiva con un clic (`s-thanks`)

Stato: Proposta

Dopo il pagamento: «Open Mousegeist and activate». Un clic apre l'app e la licenza si attiva (schermata 1.5).

Da sapere:
- Se l'app non c'è ancora, ci sono i link per scaricarla.
- Riserva: il codice arriva anche per mail.

Testi a schermo:
```text
mousegeist.app/thanks
Personal is yours.
Thanks, Anna. One click and Mousegeist activates on this computer.
Open Mousegeist and activate
No app yet? · Download for Mac · · · Windows · We also emailed you a code, just in case.
```

Porta a: s-dl (scarica)

### 7.5 Download (`s-dl`)

Stato: Proposta

Riconosce se sei su Mac o Windows e mostra il pulsante giusto. Sotto ci sono i tre passi: installa, permessi, collega la tua AI.

Da sapere:
- I passi sono quelli della sezione 1 della mappa.
- Il file per Mac va firmato con Apple Developer, altrimenti serve «tasto destro, Apri».

Testi a schermo:
```text
mousegeist.app/download
Download
We found a Mac. Here is the right file.
Download for Mac · Windows
1 · Open the file, drag to Applications
2 · Allow two macOS permissions
3 · Add it to your AI with one click
```
