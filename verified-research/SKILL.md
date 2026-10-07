---
name: verified-research
description: "Research method that returns only checked facts: scoped areas, parallel readers, an adversarial verifier per area, a completeness critic, and an answer sorted into confirmed, refuted, unverified and not covered. Use when the answer rests on fast-changing facts (plans, usage limits, prices, model names, versions, CLI flags, APIs, mod or plugin behaviour), when the person asks to research, verify, fact-check or compare options, or says 'is this still true', 'ricerca', 'verifica', 'controlla le fonti', before writing a skill, mod or plan from such facts, not for checking whether a known source changed (that is release-watch), in any project."
---

Research that feeds a plan, a skill or a mod is only as good as its weakest claim. This skill decides how to collect claims, who checks them, and how to report what survived. Workflow shapes and fleet width come from `smart-ultracode`, models and effort from `model-mix`, the script API from `workflow-authoring`. For a recurring check of known sources, use `release-watch` instead of a new research run.

## 1. Gate: pick the cheapest rung

- One fact, one official page: fetch it yourself, quote the line, date it. No workflow.
- A fact already verified this session: reuse it with its date.
- About 3 or more areas, or a decision that rides on the answer (plan profile, limits, a mod's API): run the full method below, as one workflow per phase per `smart-ultracode`.
- When unsure, take the lower rung and escalate if the result is thin.

## 2. Source rules

- Official first: the vendor's docs, support articles, pricing page, changelog and repository. For a CLI, a local read-only check on this machine is a source too: `claude --version`, `claude --help`, the generated types in a mod's `.claude-plugin/types/`. Say the version it ran on.
- The current state beats older posts. When two sources disagree, the newest official one wins. When two official pages disagree with each other, report both, take the safer value, and mark the claim contested.
- Third-party pages (blogs, forums, issues, reports) are low confidence. They can point to a lead. They never confirm a claim alone: only an official source or a local check does.
- Model memory is never a source for fast-changing facts: prices, limits, versions, model names, flags, APIs. A claim with no opened source is unverified, however sure it feels.
- A fetch tool may return a summary, not the page. For numbers, versions and exact strings, ask for the verbatim row or line. For GitHub use `gh api`. **Why:** in earlier research a third-party summary garbled a price ratio and a fetch summary merged two plan prices into one.
- Date everything: the page's own updated date when it shows one, plus the day it was read. An undated claim is low confidence.
- Quotes stay under 15 words, in quotation marks, with the source. Paraphrase the rest.
- Undocumented behaviour (binary strings, hidden flags, issue comments) is labelled undocumented and never promoted to confirmed.

## 3. Scope into areas

- Split the question into 3 to 6 areas that do not overlap, each with a one-line question and the official sources to start from. Write them down before any reader runs.
- Check the fleet: each area costs one reader and its verifiers (count them per section 5), plus one critic. Width comes from today's profile in `model-mix`: merge areas until it fits, and log what you dropped.
- Take the in-flight check from `smart-ultracode` section 2 first: skip areas another run already covers.

## 4. Readers

- One reader per area, Sonnet medium per `model-mix`, read-only, web fetch and search allowed. Every reader of the stage gets the same settings and a shared prompt prefix.
- A reader returns atomic claims, one fact each, in the claim schema (`workflow.md`): id, claim, scope (plan, version, platform), source URL, source date, quote under 15 words, confidence (high, medium, low), kind (security, money, consent or other), and the sources it could not open.
- Readers also return open questions: what they looked for and did not find. An empty list is suspicious.

## 5. Verifiers

- Verifier width follows today's profile in `model-mix` and `smart-ultracode` section 4: on Max 20x one verifier per claim, or per small group of claims that cite the same source, grouped only as far as the width needs (`smart-ultracode` section 2); below Max 20x one verifier per area with all its claims. Opus high (Pro: medium), never the reader that wrote the claims. It gets the claims and the sources, never the reader's reasoning.
- It opens every source itself, or reruns the local check. A claim whose source it cannot open is unverified.
- Verdict per claim: confirmed, refuted (with the corrected fact and its evidence) or unverified (with what is missing). It also adds missed facts it found while reading and keeps the open questions.
- Security, money and consent claims (who can read what, what costs credits) get their own verifier each, per `smart-ultracode` section 4.

## 6. Completeness critic

- One agent after all areas, Opus high. It gets the goal, the area list and the verified results, and ranks the gaps: what the decision needs and no claim covers, what stayed unverified, what contradicts.
- It settles the top gaps itself with a source or a local check, and marks each gap settled or not.
- Settled gaps go into the answer. Unsettled ones go into the answer as unverified. Run a second round only when a gap is critical and cheap to close.

## 7. The answer

Sort by evidence, in this order:

- **Confirmed:** claim, scope, source, date.
- **Refuted:** the wrong claim, the corrected fact, the evidence. Say where the wrong claim came from (memory, a third party, an old page).
- **Unverified:** what is missing and the one check that would settle it.
- **Not covered:** areas dropped for width, sources unreadable, questions nobody asked.
- Footer: fleet size, models and effort, weekly points spent (usage read before and after, per `model-mix` `budget.md`), and the day the facts were read.

State design consequences next to the facts only after the sort, and mark each as inference.

## Done when

- Every claim in the answer is confirmed with an opened, dated source, or labelled unverified.
- No fast-changing fact rests on memory or on a third party alone.
- A verifier saw every area and the critic ran, or the answer says why not.
- Dropped areas, failed agents and unreadable sources are logged under not covered.
- The footer has fleet size, models and weekly points.

Read `workflow.md` when writing the workflow script: it has the schemas, a minimal skeleton and the prompt skeletons.
