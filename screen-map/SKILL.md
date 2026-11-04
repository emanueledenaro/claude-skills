---
name: screen-map
description: "Build and keep a product screen map that every builder follows as the source of truth: one page with every screen per platform, real copy, a status per screen (exists, built to test, proposal), arrows for the flow, simulations of real users, a style guide, and a project skill generated from it. Use when asked for a map of the screens, a UI flow, a source of truth for app, menu, site or onboarding, to turn a map into a skill, or to keep design and code aligned, also in Italian (mappa delle schermate, flusso, schermate dell'app, fonte di verità, trasforma la mappa in una skill), in any project."
---

A screen map is the reference every builder follows: the app, its menus, the website, and anything else the person sees. It is not a mood board. Each screen on it says what is true today, in the product's own words. The entry format, the page layout, the handoff message and the generator for the project skill are in `reference.md`. Read it when you create a map, add screens, or turn a map into a skill.

## 1. What the map holds

- **Lanes** follow the phases of use: install, first action, while it works, settings, and so on.
  - Give each platform its own set of lanes when the platforms differ (macOS, Windows, web, mobile).
  - Add one lane for the style guide, one for the website, and one for each simulation.
- **One frame per screen**, drawn inside the real system frame (menu bar, taskbar, browser, phone). Each frame has a number (`3.4`), a stable id (`mac-panel`, `win-panel`) and a short title.
- **One status per frame**, never mixed:
  - **exists** means it is on the main branch.
  - **built, to test** means it is in a pull request and has not yet been tried on a real device.
  - **proposal** means it is designed but not built.

  A proposal is never shown as built.
- **Real copy**: the exact words of the interface, in the interface's language.
- **Arrows** show the flow. Each one is labelled with the action that moves the person ("Stop", "Esc", "Buy").
- **Details for each screen**: what it does, what to know, what is still open, and which plan or tier it belongs to if the product has tiers.
- **Simulations**: one real kind of user doing one real task from start to finish. Features come out of simulations, not out of generic feature lists.
- **Style guide**: colour tokens with their roles, type, corners per platform, and the rules that apply on every screen.

## 2. Rules

- **Real data first.** Before drawing, check copy, colours and behaviour against the code and against photos of the real app. Mark anything you have not checked as an assumption.
- **The map changes before the code.** When a decision is taken, update the map first. Then tell builders exactly what changed (values, copy, behaviour), not only "see the map".
- **A photo of the real device beats the drawing.** When a test on a real device shows a difference, ask what the person wants. Then fix the map and pass the fix on.
- **Values come from the real thing.** When the person says "make it like X", sample X from the photo or the code. Do not use a guessed colour, such as white or black.
- **Decisions are dated** in the screen notes ("Decided 2026-11-04: …"). Remove the note a decision replaces; do not leave both.
- **Open points are listed, not solved silently.** A question that changes the goal goes to the person once, with a recommendation.
- **One visual language.** A signal means the same thing on every screen, and a colour never carries a state on its own.
- **One page that also works on a phone**, with:
  - pan and zoom;
  - a sidebar listing every screen;
  - a detail panel;
  - a link to each screen (`#id`);
  - a platform switch when the screens differ by platform.

## 3. After every change

1. Render the frames you changed and look at them before you publish.
2. Publish the new version at the same link, so links that were already shared keep working.
3. Tell whoever tracks status what changed. Send builders the spec of the change.
4. If the project has a skill made from the map, generate it again (`reference.md` section 4), so the text and the drawing never disagree.

## 4. Turning a map into a skill

A map becomes a **project skill**. It lives in the project's own repository, for example `.claude/skills/<product>-map/`, and never in a shared or public skills repository. Product facts stay with the product. The skill has:

- a `SKILL.md` with the global rules, the colour tokens, the status legend, and how to work with the map;
- one reference file per platform or lane group, generated from the map's data, with the exact copy for each screen.

Before a map's content goes anywhere other people can see, remove prices that are not yet announced, PR numbers, code internals, supplier names and real people's names.

## Done when

- Every screen has a status, real copy and notes, on every platform where it exists.
- Nothing on the map contradicts the latest decision or the latest test on a real device.
- Builders have been told what changed, and any skill made from the map has been generated again.
