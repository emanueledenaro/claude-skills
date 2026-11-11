# UI checklist

Every UI worker brief points here. The worker checks each item on its own screenshots, at every width the project shoots (for example 360, 768, 1024 and 1440), before it stops with "READY FOR SCREENSHOT REVIEW". The pre-PR reviewer uses the same list. Project rules (a UI library, a preset, a design system) win on components, colours and fonts; this list judges layout, spacing, copy and states.

Source: the faults that came back on every UI PR of one project (5 to 10 fixes per screen) and a full design audit of its app, 2026-11-11.

## Layout

- One left edge per card column: alert, card title, table header, first cell, chart and form start on the same x. Measure it; a few pixels show.
- One spacing scale and one gutter between cards, filters and stat tiles on every view.
- Tables fill their container; nothing shrinks a table to half its card.
- Columns hide by container width (container queries), not by viewport width, so a table in a narrow card never gets cut. A hidden column's value moves into a folded line under the row name, with each label and value kept together on one line.
- Nothing is cut and nothing scrolls sideways at any width; phone rows stay short (one or two lines).
- Numbers are right-aligned with tabular figures and a fixed column width; no number is written twice in one row.

## Forms

- Inputs are full width inside a form of bounded width.
- An error or refusal shows next to the action that failed; any collapsed section holding the bad field opens and the field gets the focus.
- Inputs are disabled while saving.
- Numbers are read and shown in the person's locale ("45.000" is forty-five thousand in Italian, not 45). Limits are grouped ("10.000.000").

## Copy

- No jargon, internal names, API or model terms on screen.
- An alert is a title plus one sentence; longer detail goes behind a collapsible or into a field description.
- A fact the whole page shares (a period, a data source) is stated once, not on every tile.
- Empty and error states say what happened and what to do next; the retry action sits inside the alert.

## States and consistency

- Loading keeps the loaded layout's real heights: no square placeholder block, no jump when data arrives.
- Each view uses the shared filter bar, stat grid, page width and skeleton; no per-view variants.
- Every screenshot is honest: the data in one shot agrees with itself, and a "loaded" shot has rows.
