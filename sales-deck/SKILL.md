---
name: sales-deck
description: "How to build a non-technical sales presentation for one small-business client: what the product does, what it solves, the hard days (E se...?), the value with an honest example, and the price with yearly cost, timing, payment and VAT. Built as a Slides artifact with real screenshots, checked locally before publishing. Use when asked for a client presentation, a sales deck, a pitch or a proposal to show, also in Italian (presentazione per il cliente, presentazione di vendita, fagli vedere il valore, fai capire il prezzo), in any project."
---

A deck that sells a program or a service to a small business: what it does, what it solves, what happens on the bad days, and what it is worth next to the price. The bar is the deck made for the gardeners company in November 2026 ("Chi fa cosa, da quale cliente"). Every visible word is in the client's language (Italian by default).

## 1. Before writing

Collect these, asking only for what is missing, one question at a time:
- the client's trade and the words they use (for example lavori, giardinieri, clienti);
- the name of their company, if known;
- the one-time price and the yearly cost;
- delivery time and how payment is split;
- the presenters, full names;
- the seller's tax regime (for example forfettario, so no VAT on the invoice).

No product name until the person has chosen one. Never invent one, and check that a proposed name is not already used by similar software before it goes on a slide.

## 2. Copy rules (the ones that matter most)

- **Only for them.** The client must not feel the product is generic: no list of other trades, no example from another company. Their work, their team, their clients.
- **No technical words.** "riepilogo", not "report"; "da stampare o da mandare al commercialista", not "PDF/Excel"; "assistenza e aggiornamenti", not "hosting"; "si apre come un sito", not "browser"; "nomi e lavori di esempio", not "dati".
- **No dot separators**: no "·", no "…", no "1 ·" numbering.
- **Short, concrete sentences** in the second person ("tu", "i tuoi giardinieri"), one idea each.
- **Real numbers**: "22 ore", never "tante ore".
- **Honest examples**: every value calculation says "È un esempio, non una promessa".
- Two presenters write in the plural: "Ti mostriamo".

## 3. Structure (13 slides)

1. **Cover**: pill label ("Il gestionale della tua squadra di ..."), a big two-part sentence (bold, then serif), a thin rule, "PRESENTATO DA" with the names side by side.
2. **Per chi è**: the jobs they do, as pills, and one serif sentence.
3. **Com'è adesso**: 3 cards with the problem (question on top, answer at the bottom) and one serif sentence on what it costs them.
4. **Come funziona**: 3 cards (dall'ufficio, dal telefono, quando vuoi), as tall as their text, and a closing sentence.
5. **La giornata**: a 480px text column and a large real screenshot (1120x823).
6. **Telefono**: 4 short items and the phone screenshot.
7. **Riepilogo**: like 5, with the monthly summary screenshot.
8. **Prima e dopo**: a two-column table with wide spacing between columns and rows.
9. **Le giornate storte**: 4 "E se...?" cases (a client disputes the invoice, someone is missing, a new person starts, someone leaves).
10. **Su misura**: one screenshot with their name and words, and a "fatto apposta per voi" line.
11. **Quanto vale**: "E se ogni ... recuperasse 15 minuti al giorno?" and 3 big numbers (hours a month, euro a month, euro a year), marked as an example.
12. **Investimento** (dark slide): a huge price; "Una volta sola. Poi X € all'anno per assistenza e aggiornamenti."; "Prezzi finali, senza IVA da aggiungere." when the seller has no VAT. On the right: customization, for the whole team, "Pronto in 2 settimane, con avvio e formazione", "Metà alla conferma, metà alla consegna". At the bottom: "si ripaga in meno di N mesi".
13. **E adesso**: "Venti minuti per vederlo dal vivo." and the presenters.

Every slide carries speaker notes in `<aside>`: what to ask, what to say aloud. The 2 euro stamp duty and tax deductibility are said aloud, never put on a slide. Delivery time stays honest: if the product is ready, the time covers going live on the client's accounts, customization, a field trial and training.

## 4. Look

Take the form and cleanliness of anthropic.com, not its colors or brand.
- Fonts: Instrument Sans for text, Newsreader (serif) for the breathing lines, from Google Fonts in the deck's `faces`.
- Colors: page `#faf9f5`, ink `#191918`, tones `#f2f1ea` and `#e8e6dc`, rules `#dedcd1`, muted `#6e6c66`; dark slide `#191918`.
- Slides are 1920x1080, padding 128px, gap 40px.
- Sizes: pill 30px; sentence 104px; title 84px (64px next to a screenshot); card title 52px; card text 36 to 38px; list items 40px; body 44px; serif line 56px; note 30px; big numbers 124px; price 240px.
- Cards: tone background, radius 32px, padding 48px or more, pill label on top.
- Text is never cramped: no negative letter spacing on body text, line height 1.35 to 1.4.
- A short word left alone at the end of a line is tied with `&nbsp;` ("15&nbsp;minuti", "dal&nbsp;vivo").

## 5. Screenshots

- Real screens of the product with believable simulated data and Italian dates (Chrome with `LANGUAGE=it LANG=it_IT.UTF-8 --lang=it-IT`).
- Full-page, high resolution, uploaded with `upload_asset` and used as `/_blob/<id>`.
- Never the same screenshot on two slides.

## 6. Build

1. Have Artifact list the types and create the deck from **Slides** only once copy and screenshots are ready; follow the SKILL.md it returns.
2. Files: `project/deck.json` (order and sections), `project/deck.css` (shared style), `project/slides/<id>.html`.
3. **Check locally before publishing**: put every slide in one HTML page at 1920x1080 scaled down, turn off the cards' entry animation, screenshot it with headless Chrome. Look at each slide: no text past the margins, no big empty space inside cards, enough room between columns.
4. **Recompute the numbers in code**: hours, euro a month and a year, euro a day, months to pay back (the first year includes the yearly cost).
5. Publish with `publish_files`, `mode: patch`, the current `base_version`, only the changed files.
6. Reply with what changed, following `adhd-replies`.

## 7. Mistakes already made

- Text and screenshots too small: start from the sizes in section 4.
- Cards with a big empty bottom: make them as tall as their text and close the slide with a sentence.
- A deck that felt generic (other trades, other companies): rewrite everything for one client.
- A product name put in before it was chosen and checked.
- A price without timing, payment and VAT: the client asks "quando?" and "come pago?" straight away.
