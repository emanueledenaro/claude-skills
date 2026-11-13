---
name: assertions-go-red
description: "Proving that every new or changed test assertion can fail: break the code on purpose, run the test, record the red output, restore; keep the red runs as evidence and name each mutation in the PR body; catch an assertion masked by an earlier one; stop the processes a test starts. Use when writing or changing tests, when a worker reports tests added, when reviewing a PR that adds assertions, or when a green test might be checking nothing, in any project."
---

A test that cannot fail proves nothing. Before a PR is done, every assertion it adds or changes has been seen red. `tdd` writes the test first; `clean-code` holds the code rules; this skill checks that the finished assertions bite. The project's standards win over it.

## 1. Mutate and record

For each new or changed assertion:

1. Break the code under test on purpose: flip a condition, drop a line, return a wrong value. This is a mutation.
2. Run the test. It must go red on the assertion you are checking.
3. Save the red output as an evidence file in the PR's evidence folder, named after the mutation.
4. Restore the code and run the test again. It must be green, and `git diff` must show no trace of the mutation.

The PR body lists each mutation and the red line it produced, one row per assertion: mutation, test, red line.

A red run is saved as evidence, so its output holds no secrets: a failure message never prints the environment or a variable's value (no env dumps, `repr=False` on env fields, no `--showlocals`). Why: on 2026-11-13 a worker's first red run printed the whole environment, a personal access token included, into a log and its own output. If it happens: delete the log, check git history, the PR body and the evidence for the value without printing it (`grep -c`), and tell the person to rotate the token.

## 2. A mutation can mask another

- When an earlier line goes red first, the test stops there and the later assertion is still unproven.
- Record a mutation that reaches the later assertion: keep the earlier lines passing, break only what the later one checks.
- If no mutation can reach it, the assertion adds nothing: drop it.

## 3. Setup guards are exempt

A guard that fails only when the test itself is broken (the fixture loaded, the server answered) needs no mutation. Write this exemption in the project's standards, so reviewers do not ask for it.

## 4. Tests that start processes

- A test that starts a process, a server or a container stops it: record the process group when it starts, and kill that group in `afterEach` or `finally`, even when the test fails.
- Stop by the recorded PID or group only (`shared-machine-checks` §5).
- The mutation run shows nothing is left running: after the red run, list the processes and containers the test started. The list must be empty.

## 5. Review

A reviewer treats an assertion with no recorded red run as unproven, and treats a mutation row with no evidence file as a claim to test (`merge-gate`). Removed or weakened assertions follow the same rule as any weakened test.

## Done when

- Every new or changed assertion has a red run saved as evidence, or is a named setup guard.
- The PR body maps each mutation to its red line.
- Masked assertions got their own mutation or were dropped.
- The code was restored after each mutation, and no test left a process or container running.
