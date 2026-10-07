# Element and prop limits

What a mod's drawing may contain. Source: the mods types (`claude-code/index.d.ts`) read in the session that wrote this skill, version 2.1.292 era. The types in the mod's own `.claude-plugin/types/` match the version that runs and win over this file. A drawing that breaks any rule below is refused whole and the engine draws its own component.

## Render sites and where they draw

`ui.render` has one event for every site: `AskUserQuestion`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `ToolProgress`, `CommandOutput`, `Spinner`, `TurnDuration`, `InfoNotice`, `SessionMode`, `PromptHint`, `AbovePrompt`, `Pane`. A hook returns a tree, or `next(e)`, or `next({ ...e, props })` to rewrite props.

| Sites | Surfaces |
| --- | --- |
| `AskUserQuestion`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `Pane` | every surface (`terminal`, `desktop`, `mobile`, `vscode`) |
| `Spinner`, `SessionMode`, `PromptHint`, `AbovePrompt` | terminal and desktop |
| `ToolProgress`, `TurnDuration`, `InfoNotice` | terminal only |

- The permission dialog cannot be redrawn. `$.ui.notice(tool_use_id, text)` adds one line under it.
- No site and no API adds a new row or card to the transcript. Rows exist only where the engine makes one: a message, a tool call or result, a command's output, a `$.ui.log` line. `$.session.append` takes text blocks only, and whether a `system` row is drawn is unverified.
- A rich card comes from a `CommandOutput` hook: the command returns non-empty `text` (so a row exists), the hook returns a tree in its place. `command.run` cannot return a tree, and returning `{}` prints nothing.
- Wrapping an engine row: `const theirs = await next(e)` then a Box column holding `theirs` and your element.
- Remote surfaces report `viewport.isFullscreen` once measured (mobile reports false), and the Desktop dock follows it. This comes from the types and is not checked in the Desktop app.

## Elements per surface

| Surface | Elements |
| --- | --- |
| terminal | Box, Text, Button, Input, Select, Link, Code, Markdown, Client, Raster, Image |
| desktop | Box, Text, Button, Input, Select, Svg, Link, Code, Markdown, Client |
| mobile | Box, Text, Button, Svg, Link, Code, Markdown |
| vscode | desktop without Client |

- Elements are not globals: `const { Box, Text } = $.ui.resolve(e)`. Constructors are plain functions taking props and `children`, so JSX is optional.
- No Card, Table, Chart, Progress, Badge or Tabs element exists. Build them from Box and Text.
- No text-width helper exists. Size by `e.props.bodyColumns` (band, pane) or `e.viewport.columns`. The mod counts cells by code points: wide characters are unverified, so avoid them.

## Props

- **Box:** `key` (hover scope), `hover`, `position` (`relative`, `absolute`), `top`, `left`, `right`, `bottom`, `flexDirection`, `flexGrow`, `flexShrink`, `flexWrap`, `alignItems`, `alignSelf`, `justifyContent`, `gap`, `columnGap`, `rowGap`, `width`, `height`, `minWidth`, `minHeight`, margins, paddings, `borderStyle`, `borderColor`, `borderDimColor`, `backgroundColor`, `overflow`, `display`. A Box holds elements and strings.
- **Text:** `hover`, `color`, `backgroundColor`, `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`, `wrap` (`wrap`, `end`, `middle`, `truncate`, `truncate-start`, `truncate-middle`, `truncate-end`). A Text holds strings and inline Link.
- Any other prop on Box or Text fails the whole tree. Strings must be printable: control characters are refused, and tab or newline belong only in Markdown and Code.
- **Button:** `key` (default label), `label` or one string child, `hotkey` (one digit or one lowercase letter), `action`, `plain`, `dimColor`, `variant` (`primary`, `secondary`), `role: 'dismiss'`, `autoFocus`, `onPress`. Hotkeys work only while the site holds keyboard focus: a pane when focused; the band after the person clicks it or presses ctrl+x then tab, and a bare digit in an empty composer presses a band Button.
- **Input** (not on mobile): `key`, `label`, `placeholder`, `value`, `submitLabel`, `autoFocus`, `onInput`, `onSubmit`. **Select** (not on mobile): `key`, `label`, `options` (`{ value, label? }`), `value`, `autoFocus`, `onSelect`.
- **Link:** `href` (at most 2048 characters), `label`. Use https only.
- **Code:** `source`, `language`, `path`, `startLine`, `format` (`source`, `diff`), `wrap`; 100000 characters per drawing. **Markdown:** `text` (100000 characters per drawing, http, https and file links only), `dimColor`, `onLinkPress`, `pressableLinks`. Their colors come from the engine and cannot be set.
- **Svg:** `source` (at most 131072 characters, starts with `<svg`), `alt` (required), `width`, `height` in CSS px, `isInteractive` (script-less sandboxed frame: CSS `:hover`, SMIL, `<title>` tooltips). Without `isInteractive` it is an image.
- **Client:** `key`, `module` (a string literal path), `props` (JSON, 100000 characters), `width`, `height`, `flexGrow`. One per plugin, terminal and desktop, at most 20000 nodes, 32 deep, 1 s per call. Not used by `coordinator-lens`; a failure raises `ui.fault`, so leave the Client out as the fallback.

## Colors

`ThemeKey`: `text`, `inverseText`, `inactive`, `subtle`, `suggestion`, `remember`, `success`, `error`, `warning`, `merged`, `claude`, `permission`, `planMode`, `autoAccept`, `promptBorder`, `bashBorder`, `ide`, `diffAdded`, `diffRemoved`, `diffAddedDimmed`, `diffRemovedDimmed`, `diffAddedWord`, `diffRemovedWord`. Any other string is a raw color that the surface interprets.

## Band, pane, toast

- **Band props (read-only):** `hasSurvey`, `isWorking`, `maxRows` (in fullscreen the bottom slot is capped at half the terminal rows including the prompt), `bodyColumns` (column width minus 5 for the engine's collapse mark), `scroll`, `view`. A tree up to `maxRows` shows whole, a taller one scrolls. The person collapses it with ctrl+x ctrl+a or `[-]`. One instance, shared by every mod. Keep it to 1 to 3 rows.
- **`$.ui.open`:** `id` (1 to 64 of letters, digits, `_`, `-`), `title`, `focus: true` (a request: granted only when the prompt has keys over an empty composer), `closeOnEscape`, `holdToasts` (silences every mod's toasts: do not use), `rows`, `columns` (requests: a size the person dragged wins). It resolves `{ isPlaced: true }` or `{ isPlaced: false, reason }`. Several panes are tabs of one dock; one shows. Docking exists in a fullscreen terminal from 110 columns, otherwise the pane sits inline above the prompt.
- **Toast:** text up to 2000 characters (10000 on remote surfaces), 4000 ms by default, clicking dismisses, hover holds, more than 50 waiting drops the oldest. Where the transcript is in scrollback a toast is one line in the notification bar.
- **`$.ui.log`:** a dim text row, not sent to the model, first 2000 characters on the terminal, 10000 on remote surfaces. **`$.ui.status`:** one pinned line per mod, 2000 characters.
- **Redraw:** `$.ui.invalidate('ui.render')` at most 10 per second (30 per second in the terminal for a shown pane, an expanded band and the hint line). A `$.state` write read while drawing redraws by itself. The engine never redraws on a timer: use `$.clock.every`. `ui.render` hooks must not write `$.state`.

## Unverified

- Whether an already printed `CommandOutput` row redraws on invalidate, and whether Buttons inside a transcript row get clicks or hotkeys: `coordinator-lens` treats the card as a snapshot with no Button.
- Pane placement on Desktop (`isFullscreen`) and the width of wide or emoji characters: checked only against the types.
- `$.session.append` `system` rows: not known to be drawn.
