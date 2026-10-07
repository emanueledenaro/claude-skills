# Patterns from coordinator-lens

Condensed from the `coordinator-lens` mod's `hooks/views.js`, `i18n.js` and `register.js`. Read the real files for full code: find the mod's folder as `mod-ui` `SKILL.md` says, it is not in this skills repo. Code rules (static analysis, `$` use, `.catch`, state) are in `smart-mods`.

## Structure

- Views are pure: `bandView(vm, E, { cols, surface })`, `paneView(vm, E, { cols, surface, tab, actions })`, `cardView(vm, E, { cols, surface })`. No `$` inside. `E` is what `$.ui.resolve(e)` returns, so tests pass a fake `E` and read the tree back as text lines.
- Texts live in `i18n.js`: `t(lang, key, vars)` with `{name}` placeholders, `tn(lang, key, n)` choosing `key.one` or `key.other`, `fmtDuration`, `fmtPoints`. Italian is the default; a missing Italian key falls back to English, and a test fails if the key sets differ.
- Text for the model is built elsewhere (`summaryText`, at most 10 lines, English even in an Italian session) and the card is looked up from it.
- A view returns `null` when it has nothing to show, and the hook then returns `next(e)`.

## Hooks

```js
on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  if (e.props.hasSurvey) return next(e)
  const tree = bandView(vm, $.ui.resolve(e), { cols: e.props.bodyColumns, surface: e.surface })
  return tree || next(e)
}).catch(async ($, e, next) => next(e))
```

- A failed render hook draws the engine's own component, so `.catch` passes on with `next(e)`.
- Pane: `if (e.requestId !== PANE_ID) return next(e)`, then `paneView(..., { tab, actions })`. Actions (`setTab`, `close`) are top-level functions in the same file, called from `onPress`.
- Card: `command.run` returns `{ text }` and stores the snapshot under that text (a capped Map, about 20); the `CommandOutput` hook matches the command, finds the snapshot by `e.props.text`, and uses `e.viewport.columns` for width. Unknown arguments and errored output keep the plain text.
- `/coord pane`: open the pane and return `{}` when it was placed, otherwise fall through to the card text.
- Spinner: add a short suffix with `next({ ...e, props: { ...e.props, suffix } })` instead of drawing a tree.

## Band

One row of groups joined by a dim ` · `: the state dot and word, then weekly use against pace, the 5-hour window, workers running, stalled, decisions, night. Pace color sits only on the dot and the stalled or paused group; the rest is dim. When the groups do not fit `cols - 2`, split into two rows and truncate the last text with `wrap: 'truncate-end'`. `paddingX: 1`, no border, no Button.

## Pane

```js
E.Box({ flexDirection: 'row', justifyContent: 'space-between', children: [
  E.Box({ flexDirection: 'row', flexWrap: 'wrap', gap: 1, children: tabButtons }),
  closeButton ] })
```

- Tab button: `key: 'tab-' + name`, `label: (i + 1) + ' ' + name`, `hotkey: String(i + 1)`, `variant: current ? 'primary' : 'secondary'`.
- Close button: `hotkey: 'x'`, `role: 'dismiss'`, `variant: 'secondary'`.
- Then a blank row (`Box({ height: 1 })`) and the tab body. Each section is a bold header with a dim count, then rows. Pressing with no action given does nothing and does not throw.

## Card

Rounded Box, `borderColor: 'subtle'`, `paddingX: 1`, `width` at most 100. Title row: `Text` in `claude` bold on the left, dot and state word on the right. Then label-and-value rows with a dim label padded to one width, a blank row, and the footer. On Desktop the budget row's bar is an `Svg` (`alt` set, fixed width and height); on the terminal it is a text bar of `█`, `░` and a `│` pace mark, colored by pace.

## Rows and columns

- `seg(text, { color, bold, dim, wrap })` builds a piece; `row(E, segs)` turns pieces into a row Box with only the props the allowlist has (drop `undefined` and `false` first).
- Column table: `{ k, prio, cap, min, right }`. Width of a column is the longest cell, capped. While the row is wider than the pane, shrink the name column to its `min`, then drop the column with the lowest `prio`. `fit(s, n)` cuts with `…`, `pad` and `padL` align left and right.
- A cloud worker with an https session URL shows its name as a `Link`; its width is given by hand because pieces holding an element have no text.
- Lists show at most N rows, then a dim `+n` row.

## Toasts

Notifications are computed by comparing the previous view model with the new one, so nothing fires on the first draw. Kinds: `decision` (a decision became pending), `merge` (a merge decision appeared), `color` (green, yellow or red changed and the new color held 5 minutes), `stalled` (a worker became stalled). Each has a key; a key is shown once (a Set capped at 300). A toast lasts 6000 ms. A color change also writes a one-line `$.ui.log` so it stays in scrollback.

## Tests to write

- The band has no Button and no Svg on either surface, and takes no rows when empty.
- The card has no Svg and no Button on the terminal; the Desktop tree has the Svg and the terminal one is built from Box and Text.
- Every Text child is free of control characters; every Button hotkey matches `^[0-9a-z]$`.
- Pane: tabs, hotkeys 1 to 5 and `x`, the current tab `primary`, narrow labels under 90 columns, every tab in both languages, partial or odd view models do not throw.
- Italian and English key sets are equal; plural keys exist in both.
- `summaryText` is English and at most 10 lines.
