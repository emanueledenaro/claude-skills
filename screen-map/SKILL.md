---
name: screen-map
description: "How to build and keep a product screen map that the whole team follows: one page with every screen per platform, real copy, a status per screen (exists, built to test, proposal), arrows for the flow, simulations of real users, and the rule that map changes before code. Use when asked for a map of the screens, a UI flow, a source of truth for app, menu, site or onboarding, or to keep design and code aligned, also in Italian (mappa delle schermate, flusso, schermate dell'app, fonte di verità), in any project."
---

A screen map is the reference every builder follows: app, menus, site and anything the person sees. It is not a mood board. Each screen on it says what is true today, in the product's own words. A project that already has a map skill (for example `mousegeist-map`) uses its content; this skill is the method.

## 1. What the map holds

- **Lanes** by phase of use (install, first action, while it works, …), one set per platform when the platforms differ (Mac, Windows), plus a style guide lane, a website lane and simulation lanes.
- **One frame per screen** drawn inside the real system frame (menu bar, taskbar, browser), with a number (`3.4`), a stable id and a short title.
- **A status** on every frame, never mixed: exists on the main branch, built in a PR and still to test, or proposal. A proposal is never presented as built.
- **Real copy**: the exact words of the interface, in the interface's language.
- **Arrows** for the flow, labelled with the action that moves the person ("Ferma", "Esc", "compra").
- **Per screen details**: what it does, what to know, what is still open, which plan it belongs to.
- **Simulations**: one real kind of user doing one real task end to end. Features come out of simulations, not from generic feature lists.

## 2. Rules

- Real data first. Check copy, colors and behaviour against the code and against photos of the real app before drawing. Mark anything not checked as an assumption.
- The map changes before the code. When a decision is taken, update the map, then tell the builders exactly what changed (values, copy, behaviour), not just "see the map".
- When the person tests the real app and something differs, fix the map to match what they want, then pass the fix on. A screenshot from the real device wins over the drawing.
- Decisions carry their date in the screen notes ("Deciso 4/11: …"). Superseded notes are removed, not left beside the new ones.
- Open points are listed, not solved silently. A question that changes the goal goes to the person once, with a recommendation.
- One look across the whole product: the same signal means the same thing everywhere; a color never carries a state alone.
- Keep it one page that opens on a phone: pan and zoom, a sidebar with every screen, a detail panel, and a link per screen (`#id`).

## 3. After every change

1. Render the changed frames and look at them before publishing.
2. Publish the new version at the same link.
3. Tell whoever tracks status what changed, and send builders the spec of the change.
4. Regenerate any skill made from the map, so the text and the drawing never disagree.

## Done when

- Every screen has a status, real copy and its notes, on every platform it exists on.
- Nothing on the map contradicts the latest decision or the latest test on a real device.
- Builders have been told what changed.
