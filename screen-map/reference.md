# screen-map reference

## 1. Entry format

Keep the screens as data in the page, one object per screen. The sidebar, the detail panel and the generated skill all read from this data.

```js
const LANES = { 1: "Install and connect", 2: "First action", 3: "While it works",
                w1: "Install and connect", w2: "First action", w3: "While it works",
                brand: "Style guide", sim1: "A developer with an AI agent", site: "Website" };

const DATA = [
  { id: "mac-panel",            // stable, used in links (#mac-panel) and arrows
    n: "3.4",                   // number shown on the frame
    lane: 3,
    t: "Menu-bar panel",        // short title
    s: "pr",                    // "main" | "pr" | "prop"
    tier: "Core",               // optional, if the product has plans
    what: "One sentence on what the screen does for the person.",
    notes: ["Decided 2026-11-04: one Stop button, same as Esc."],
    prop: "Open: what is proposed or undecided." },
];

const ARROWS = [ ["mac-panel", "mac-stopped", "Stop"] ];   // from, to, label
```

- Ids carry the platform (`mac-…`, `win-…`, `web-…`) and never change once they are shared.
- `notes` hold facts and dated decisions. `prop` holds only what is still open.
- A frame on the page has the same id as its entry. Its exact copy is in the frame markup, so the drawing and the text come from one place.

## 2. Page layout

- **Top bar:** product name, date, platform switch, status legend, zoom.
- **Left:** sidebar with every screen, grouped by lane, each with a status mark.
- **Centre:** the board, with lanes as rows and frames inside real system chrome. Arrows are curves with their labels.
- **Right:** detail panel for the selected screen: status, source, tier, what, notes, open points.
- **Colours** are defined as tokens on `:root`, with a dark board, so the product's light and dark surfaces both read well.
- **Narrow screens:** the sidebar and the detail panel collapse, and the board still pans and zooms.
- **Status marks:**
  - a solid green square means it exists;
  - a blue square means built, to test;
  - an amber dashed square means proposal.

  Each mark always has its word next to it.

## 3. Handoff message to builders

Send one message per change, written so it can be built without opening the map:

```text
Spec for <PR or screen>, from <who decided, when> (map v<N>, screens <n, n>):
1) <change>: <exact values: colours, sizes, copy in quotes>.
2) <behaviour>: <when it appears, when it does not, what happens on each action>.
Unchanged: <what stays as it was, so nothing is undone by mistake>.
```

If a later message corrects an earlier one, say which point it replaces and tell the builder to drop the old values.

## 4. Generating the project skill

Turn the map into the project skill with a small script, so the skill can be regenerated after every change:

1. Take the `LANES`, `DATA` and `ARROWS` source from the page and evaluate it in Node.
2. Open the page in a headless browser. For each frame, collect the visible text of its screen, leaving out map-only labels, system chrome and annotations. Keep one line per block, and join inline items with ` · `.
3. For each lane group, write one Markdown file. For each screen, include:
   - the heading `n title (id)`;
   - the status and tier;
   - `what`;
   - the notes;
   - the open points;
   - the exact copy as a text block;
   - "Leads to:" with the ids its arrows point to.
4. Apply the clean-up rules before writing, and grep the output for what must not appear. The rules: no unannounced prices, PR numbers, code internals, supplier names or real names.
5. Write `SKILL.md` by hand. Generate the reference files every time.

## 5. Checks before publishing

- Every entry has a frame, and every frame has an entry.
- No arrow points to a missing id.
- The page opens at phone width with no horizontal scroll.
- A screenshot of each changed frame has been looked at, on both platforms when the screen exists on both.
- The console shows no errors.
