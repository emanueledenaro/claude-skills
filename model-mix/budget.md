# Budget check

How `model-mix` turns a usage reading into a color. When a usage mod already puts the color into the session's context, skip Compute only: Read, Overrides and Run cost still apply, and the actions per color stay the ones in `SKILL.md`.

## Read

- **Desktop session:** the read-only tool `get_usage` (`mcp__ccd_session_mgmt__get_usage`) returns the windows `5-hour limit` (Pro and Max; a verified Ultra account has none), `Weekly · all models` and, on Max and Ultra, `Weekly · Fable` (a separate weekly limit), each with `percentUsed` and `resetsAt`, plus `extraUsage.enabled`. Call it from the main session, which owns the budget decision; cloud sessions cannot read it.
- **Terminal session:** read the file named by `usage file:` in the person's plan line, which their statusline script writes from `rate_limits.five_hour` and `rate_limits.seven_day` (`used_percentage`, `resets_at` in epoch seconds). The statusline has no Fable window. Without that file, ask the person for `/usage`.
- On Ultra, no `Current session` bar in Settings > Usage means a verified account with no five-hour limit: the weekly limit and the Fable weekly limit are the ones to read. If the bar shows, the account is unverified and has a temporary limit: treat that bar as the 5-hour window.
- A reading counts only if it is less than 10 minutes old and its `resetsAt` is still in the future. Ignore a missing window. With no valid reading and nobody to ask (overnight, unattended), the color is red until the next wakeup.
- Limits are per account: other sessions, cloud workers, routines and the person's chats spend the same budget.

## Compute

- d = days elapsed in the weekly window, as a decimal: 7 − (hours until the weekly `resetsAt`) / 24, clamped between 0.5 and 7, so the first hours of a week are not judged against a pace near 0.
- Banked resets come from the plan line, never from a tool. Count only weekly resets that are not redeemed and whose expiry date is after today. For each one, W = weeks until it expires, as a decimal, at least 1. A weekly reset with no expiry and every 5-hour reset (Pro and Max only) count 0 here.
- pace = d / 7 × 100 × (1 + Σ 1 / W).
- in flight = projected remaining cost of the work still running (cloud sessions, workflows), from the run-cost note.
- margin = weekly percent used + in flight − pace.

Example: one day into the week, with one weekly reset banked that expires in two weeks: pace = 1/7 × 100 × 1.5 ≈ 21. At 15% used and nothing in flight, the margin is −6: green.

Stop counting a banked weekly reset as soon as the person says they redeemed it, or its date has passed. Stop counting it as well when two readings of the same weekly window (same weekly `resetsAt`) show weekly use falling by more than 2 points: only a redemption lowers it inside a window. When unsure which entry was redeemed, drop the weekly one that expires first. Then tell the person, offer to remove the entry from the plan line, and discard any run-cost reading whose before and after straddle the drop.

## Overrides

- **Last 12 hours before the weekly reset:** the leftover expires, so the color is green until used ≥ 100 − reserve.
- **5-hour window at 90% or more** (Pro and Max; none on a verified Ultra account, skip this override there): pause new launches until its `resetsAt` and wake up then; do not stop the work. If a 5-hour reset is banked and the weekly color is green, ask the person whether to redeem it instead of pausing. A fan-out can exhaust the weekly limit before the 5-hour window resets, so the weekly color sets the width.
- **Projected cost:** never start a run that would push weekly use past 100 − reserve, or, where a 5-hour window exists, the 5-hour window past 100. A limit hit in the middle of a run pauses it only when that limit resets within 24 hours, in an interactive claude.ai session with `autoContinueAtUsageLimit` on, at most twice per run. Otherwise its agents fail, including every `-p`, background and Remote Control run.
- **Banked weekly reset:** a reset sets weekly use back to 0% once and leaves the reset day where it is, so it is worth only the percent used when redeemed. Ask the person to redeem it when weekly used ≥ 100 − reserve with at least 2 days left before the weekly reset. If it is still unredeemed on the day before its expiry date, ask then whatever the weekly percent: an unredeemed reset is lost at the day and time on the offer, and Compute already stops counting it on its expiry date. Only the person can redeem it: Settings → Usage on the web or in Desktop, never from Claude Code.
- **Fable weekly limit at 80% or more, or not readable** (terminal, cloud): no Fable use, a `claude-agent/fable` subagent in OpenCode included.
- **Usage credits on** (`extraUsage.enabled` true, or not readable, as in a terminal): Fable stays in the main session or a short foreground subagent. When weekly used reaches 100 − reserve or a 5-hour window (Pro, Max) reaches 90%, tell the person that running cloud sessions and routines will continue on paid credits past the limit if credits are on, and offer to stop them. Never start a run that could only finish on credits.

## Run cost

Read the weekly percent before and after every workflow and every cloud session, and keep one line per plan in the project memory, replacing the previous one:

```
run cost: 2026-10-06 Ultra (then Max 20x) · 4 Sonnet medium + 5 Opus high agents (1.5M subagent tokens) = 2 weekly points, 5 five-hour points
```

That line is a real reading from one account, taken when the plan was still called Max 20x (it has five-hour points because Max 20x had a five-hour window); the reading is account-wide, so the main session and another session running at the time are inside it. Project only from notes taken on the same plan and the same model mix: a note with Haiku readers does not project a run with Sonnet readers. A note taken before the 2026-10-30 rename may not carry over to Ultra if its weekly cap changed (unverified). On another plan, run the first workflow at half the profile width and take its own before and after reading. After three notes on a plan, narrow the profile width if a full-width run would cost more than one day of pace (100 / 7 ≈ 14 weekly points).

## Plan facts and sources

Read on 2026-11-06 (both pages marked updated that week): [What is the Ultra plan?](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan) and [What is the Max plan?](https://support.claude.com/en/articles/11049741-what-is-the-max-plan).

- Ultra (formerly Max 20x, $200/month): 10× Pro usage every week; verified accounts have no five-hour limit. Anthropic verifies accounts automatically from account and payment history; an unverified account has a temporary limit until verified. Check: claude.ai, Settings > Usage; no `Current session` bar means verified.
- Max (formerly Max 5x, $100/month): 5× Pro usage every five hours and every week; it keeps the five-hour limit.
- Max and Ultra: a weekly limit across all models plus a separate weekly limit for Fable. Anthropic may add other limits (weekly or monthly caps, model or feature caps). A limit reset restores the weekly limits on Ultra, and the five-hour limit or the weekly limits on Max.
- Fable, read 2026-11-10 ([Claude Fable models on your plan](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan), [Fable 5.2 launch offers](https://support.claude.com/en/articles/17506494-claude-fable-5-2-launch-offers)): Max and Ultra can use up to 50% of the weekly limits on Fable at no extra cost, then usage credits or another model; Pro and standard seats run Fable on usage credits. Launch offers: Pro gets Fable included through 2026-11-16; Max and Ultra get one to three Fable resets by subscription length, expiring 2027-03-08. A Fable reset restores only Fable usage on the weekly limit, so Compute counts it as 0.
- Unverified: whether the Ultra weekly cap was halved against the old Max 20x. Some articles say weekly limits are unchanged; the official page says "10× Pro weekly" for a plan once called 20x. No primary source settles it.
