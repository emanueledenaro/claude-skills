---
name: mousegeist-map
description: "The Mousegeist screen map as a build spec: every screen of the app, menu-bar panel, confirmation card, AI cursor, Windows version and website, with the exact Italian UI copy, colors, the approval modes and the decisions taken. Use when building, changing, reviewing or testing any Mousegeist screen (installer, permissions, panel, confirmation card, modes Manuale/Piano/Auto, Esc and Ferma, AI cursor, Dock or taskbar cards, activity log, licence, company features, website pages), also in Italian (schermata, pannello, menu in alto, scheda di conferma, cursore, sito, mappa delle schermate)."
---

The screen map is the reference for Mousegeist. The app, the menu-bar panel, the cursor and the website follow it; when code and map disagree, the map wins until the person decides otherwise. This skill is the map turned into text. The per-screen detail is in the reference files, in Italian like the interface:

- `screens-mac.md`: sections 1 to 3 on macOS (install, permissions, connect, first start, licence, modes, cursor, panel, stop, log).
- `screens-windows.md`: the same sections on Windows 11.
- `brand.md`: the style guide.
- `simulations.md`: a developer with Claude Code (5.x) and a company with Claude Code Enterprise (6.x), the flows that justify each feature.
- `website.md`: the site pages (home, pricing, checkout, thank-you, download).

Read the reference file for the screen you touch before writing code. Each screen has its number (`3.4`), id (`f-panel` Mac, `w-panel` Windows), state, plan, description, notes, open points, exact copy and the screens it leads to.

## 1. States

- **Esiste**: on the main branch.
- **Costruita, da provare**: built in a pull request, not yet tried on a real Mac or PC.
- **Proposta**: designed, not built. Build it only when asked.

Plans: **Core** is free (safety: modes, confirmations, Esc). **Personal** adds background work, the cursor on the Dock or taskbar, the "+1" cards and the readable log. **Team** adds company rules, seats, audit export and company stop. Prices are not in this skill: take them from the project, never invent them.

## 2. Rules every screen follows

- Mousegeist is a tool that AIs use (an MCP server), not an AI. Copy says "la tua AI", "Claude Code chiede", never "Mousegeist pensa".
- The interface speaks Italian; the website speaks English. Short sentences, no technical words for the person.
- The person's mouse and keyboard stay theirs. Nothing steals focus: no centred windows, no modal dialogs at start.
- Default mode is **Piano**: the AI shows a numbered plan, the person says yes once. **Manuale** asks for every action. **Auto** runs alone and asks only for risky actions.
- Risky actions always ask, in every mode, and can never be remembered: open, close or hide an app, bring a window forward, Enter, Delete, text ending with a newline.
- The mode is chosen **only** in the menu-bar panel. The confirmation card has no mode selector.
- The confirmation card appears only in Manuale and Piano. In Auto it appears only for a risky action, with "Azione rischiosa" in the top chip instead of "Claude Code chiede", and without "Ricorda".
- Panel and card are never open together. A request arriving while the panel is open closes the panel and the card takes its place under the icon. Opening the panel while a request waits hides the card and shows "1 richiesta in attesa · Apri ›" under the title; one click closes the panel and brings the card back.
- The card sits under the menu-bar icon on macOS and above the clock on Windows, never in the middle of the screen.
- One stop button: **Ferma** (same as Esc) interrupts the action in progress and blocks the next ones; after it the title is "Fermato" and the button becomes **Riprendi**. Esc works everywhere, always.
- Typed text is never shown or saved, only its length ("Scrivere 4 caratteri").
- The AI has its own pixel cursor, twice the system size, separate from the person's. If the app it works in is covered, the cursor sits on the app's Dock or taskbar icon and pulses at each click; several covered apps stack as cards with "+1".

## 3. Colors and shapes

Brand (website, cursor, map, dark surfaces):

| Token | Value | Use |
| --- | --- | --- |
| Vuoto | `#0B0B0C` | background |
| Inchiostro | `#EDEDED` | text |
| Fosforo | `#7CFF6B` | only what is active or what says yes |
| Palco / Palco 2 | `#141416` / `#1C1C1F` | surfaces |
| Quieto | `#A3A3A3` | secondary text |
| Attenzione | `#FFB020` | risky steps |
| Pericolo | `#FF6B6B` | refusals, Esc not ready |

Menu-bar panel and confirmation card use **the same material**: the blue-violet translucent glass of the real confirmation card on macOS, with light text. Never solid white, never solid black. The safest way is to give the panel the very material the card already uses, so they match by construction.

| Part | Value (as simulated on the map) |
| --- | --- |
| Background | blue-violet glass, about `rgba(78,80,146,.80)` with a strong blur; on Windows the same tint, square corners |
| Text / secondary / tertiary | `#F4F4F8` / 72% / 52% of it |
| Ferma and neutral buttons (Annulla) | lighter glass capsule, white at 14–16% |
| Yes buttons (Consenti, Esegui il piano, Riprendi) and chosen mode | Fosforo, text `#0B0B0C` |
| Fills and separators | white at 6–14% |
| "Azione rischiosa" chip | amber at about 26%, text `#FFD28A` |
| "1 richiesta in attesa" row | Fosforo at about 20% |

Type: JetBrains Mono for the wordmark, labels and times; Inter (system font in native UI) for text. macOS: rounded glass, capsule buttons. Windows: square corners everywhere. Cursor "A v3": dark pixel arrow with a green line, no ghost (the ghost is only in the logo). Action states are grey; only refusals are red; "Esci" turns red only on hover.

## 4. Working with the map

- Before building a screen, read its entry and copy the text exactly. A missing string is a question for the person, not an invention.
- A change to behaviour or look is first a change to the map, then to code. If you find the code differs from the map, say so and ask which one moves.
- A screen marked Proposta is not a task by itself.
- Open points listed under "Aperto" are undecided: do not settle them in code.

## Done when

- The screen matches its entry: copy, order of elements, colors, corners, and where it appears.
- The global rules in section 2 hold, on both macOS and Windows.
- Any difference from the map is named to the person, not silently shipped.
