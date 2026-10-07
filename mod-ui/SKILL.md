---
name: mod-ui
description: "The person's visual language for Claude Code mods: what goes in the band above the prompt, a pane with tabs, a command card in the chat or a toast, which theme colors and marks, Italian for the person and English for the model, relative times, aligned columns, and the element limits per surface (terminal, Desktop). Use when designing, drawing, restyling or reviewing anything a mod shows the person (a band, pane, card, toast, status line, table, progress bar or color), or when asked for a status view, dashboard or notification inside Claude Code, in any project."
---

What a mod may draw and how it should look, so every mod of the person feels like `coordinator-lens`: calm, clear, quiet when there is nothing to say. Whether to write a mod at all, the hook rules, tests and install live in `smart-mods`; model and effort for the work come from `model-mix`. A mod that draws is a UI change, so `coordinator-method` applies: show a screenshot of each drawing and its fallback, and wait for the ok before committing.

Element and prop limits are in `limits.md`, taken from the types Claude Code writes into the mod's `.claude-plugin/types/`. Those types match the running version and win over `limits.md`. Code patterns from the real mod are in `patterns.md`: read it when building a view. The reference implementation is the `coordinator-lens` mod's source (`hooks/views.js`, `hooks/i18n.js`): it is not part of this skills repo. If it is installed, its folder is in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (`smart-mods` section 5); otherwise ask the person once.

## 1. Principles

- Calm and clear first. Draw nothing when there is nothing to say: a band with no data returns `next(e)` and takes no rows.
- One signal keeps one meaning everywhere (`coordinator-method`). A color or mark never means two things.
- Never documents. No reports, long Markdown or file output in the interface; a summary is a few short rows, with "+n more" when a list is cut.
- Color never carries a state alone: the word sits beside it (`● green`).

## 2. What goes where

| Site | Use it for | Rules |
| --- | --- | --- |
| Band (`AbovePrompt`) | The one-line state that is always true | One line, two when narrow. **No buttons:** a bare digit in an empty composer presses a band Button. Size to `bodyColumns`. Yield with `next(e)` when `hasSurvey` is true or there is nothing to show. |
| Pane (`Pane`, opened by a command) | The full view and actions | Numbered tab buttons (`1 Overview`), the current one `primary`, the rest `secondary`; a close button on the right (`hotkey: 'x'`, `role: 'dismiss'`). Open with `focus: true, closeOnEscape: true`. Short tab labels under 90 columns. |
| Card (`CommandOutput` row) | A snapshot after a command | The command returns short English text, a `ui.render` hook draws a rounded Box from the snapshot taken when the command ran. Title in `claude` bold, state at the right, a dim footer that says "snapshot" and names the pane command. No buttons, no live data. |
| Toast (`$.ui.toast`) | Only: a decision waits for the person, a merge happened, a color changed, work stalled | Dedupe by key, announce a color change only after it holds, never hold toasts with `holdToasts`. Progress, success and routine errors are not toasts. |
| Log line (`$.ui.log`) | A permanent audit line that stays in scrollback | One dim line of text, for example the color change next to its toast. |
| Status (`$.ui.status`) | One pinned line under the prompt, one per mod | The band is the first choice; status is for a state that must show where no band does. |

- A pane opened by a command the person typed is placed at any width. One opened unasked (timer, `session.start`) needs 144 columns, so never open one unasked. Check `isPlaced` and fall back to the card text when it is false.
- Where nothing draws (VS Code panel, `claude -p`, cloud sessions, Desktop WSL sessions), the command text carries the facts: English, at most 10 lines.
- A transcript card is a snapshot. Whether an already printed `CommandOutput` row redraws on `$.ui.invalidate('ui.render')` is unverified, and so is whether a Button inside a transcript row receives clicks: design for neither.

## 3. Colors and marks

- Theme keys, never raw colors: `success`, `warning`, `error`, `inactive`, `claude`, `subtle`, plus `suggestion` for "waiting for you". There is no key named red, green or yellow; for a pace use green = `success`, yellow = `warning`, red = `error`, no data = `inactive`. Hex appears only inside Svg source.
- Secondary text is `dimColor`; bold is for titles and the state word. Borders are `subtle`.
- Marks: `●` running (`claude`), `○` launched, `✓` done (`success`), `✗` failed (`error`), `!` stalled or denied (`warning`). Checklists: solid = done, hollow = to do, dim hollow = probable.
- Unknown color strings are drawn however the surface chooses, so a raw name is never safe.

## 4. Text

- The person's text is Italian by default, English with a `language` option in the manifest's `userConfig`. Everything the model reads (command text, context lines, tool output) is English. Keep both in one module of `it` and `en` keys, with `.one` and `.other` for plurals, and a test that both languages have the same keys.
- Text the person sees carries no tool names, API terms or prompt wording.
- Short and dense: `3 al lavoro`, `1 fermo`, `sett 17% · ritmo 20%`. Compact numbers: rounded percentages, points with at most two decimals under 10 and one from 10 up, trailing zeros dropped (`2`, `0.8`, `12.3`).
- Relative times, never clock times: `<1m`, `12m`, `1h 5m`, `2d 3h` (`2g 3h` in Italian). Only model-facing text may carry a UTC clock.
- Aligned columns: pad by cell count, right-align numbers, cap each column, and when narrow drop the lowest-priority column first and keep the name. Cut with `…`. Header row only in the pane.
- Strip control characters from every string before it enters a tree: the whole tree is refused with one. Emojis are not used; the marks above are.

## 5. Surfaces

- Draw with the common subset: Box, Text, Button, Link, Code, Markdown (Input and Select not on mobile). Get elements per surface with `$.ui.resolve(e)`.
- `Svg` only when `e.surface === 'desktop'`, the constructor exists, and the same information also exists as text (the card's pace bar is a text bar on the terminal). A tree with an element missing on the surface is refused whole. `Raster` and `Image` draw only in the terminal: avoid them.
- Svg needs `alt`, and its colors are the only place hex is allowed. The pane has no Svg.
- Per the types, the band, `Spinner`, `SessionMode` and `PromptHint` are raised on terminal and Desktop only; the other sites are in `limits.md`.

## 6. Check before showing

- Band: one row at a normal width, no Button, no Svg, nothing drawn when empty.
- Pane: opened by a command, tabs numbered, close on `x`, every tab works at 60 and 120 columns, in both languages.
- Card: no Button, an Svg only on Desktop, a text fallback on the terminal, English command text of at most 10 lines.
- Toasts: only the four causes, each deduped.
- Colors: theme keys only; hex only in Svg.
- Texts: both languages complete, relative times, no control characters.
- Screenshot of each drawing and its fallback, in the app where the person will see it (terminal or Desktop), sent for the ok. A Desktop-only drawing is never reported as checked from a terminal run.

## Done when

- Every drawing sits on the site the table gives it, and nothing outside the four toast causes toasts.
- The checklist in section 6 passes, and `claude plugin test` has a test for the band (no Button), the card (no Svg on the terminal) and the language keys.
- The screenshots and fallbacks are with the person, and the ok is in before the commit (before the merge for a cloud worker's PR).
