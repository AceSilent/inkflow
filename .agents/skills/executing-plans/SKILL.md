---
name: executing-plans
description: "Ralph-loop executor: relentlessly iterates on an implementation plan until all tasks pass. Use AFTER writing-plans has produced a plan."
---

# Executing Plans (Ralph Loop)

不达目的，不罢休。

An autonomous, iterative execution engine that takes a plan produced by `writing-plans` and grinds through it task-by-task until every checkbox is checked and every test is green — or a hard safety limit is hit.

**Announce at start:** "I'm using the executing-plans (Ralph Loop) skill. Target plan: `<path>`."

## Core Philosophy

The Ralph Loop is named after the "Ralph Wiggum Technique" — a relentless, forgetful-but-persistent approach:

1. **Fresh context each iteration.** Don't trust accumulated chat history. Trust `docs/tasks.md` and the plan file.
2. **External memory is the source of truth.** All progress lives in files (plan checkboxes, `docs/tasks.md`, git history), never in your head.
3. **Tests are the only judge.** A task is done when its tests pass. Not when the code "looks right."
4. **Never modify tests to make them pass** (unless the user explicitly authorizes it). Fix the implementation, not the test.
5. **Fail forward.** If something breaks, log what you learned, adjust, and try again.

## Prerequisites

Before starting the loop, verify:

- [ ] A plan file exists (e.g. `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`)
- [ ] `docs/tasks.md` exists and is up to date
- [ ] `docs/spec.md` (or equivalent spec file referenced in the plan) is locked and reviewed
- [ ] Tests referenced in the plan are written (or the first task IS writing them)
- [ ] You have read the plan file completely and understand the full scope

If any prerequisite is missing, **STOP** and surface to the user. Do not improvise.

## The Loop

```
┌─────────────────────────────────────────────┐
│              RALPH LOOP START               │
│                                             │
│  1. Read state (tasks.md + plan file)       │
│  2. Find next unchecked task                │
│  3. Execute the task step-by-step           │
│  4. Run tests                               │
│  5. Tests pass? ──yes──► Mark done, commit  │
│       │                   go to step 2      │
│       no                                    │
│       │                                     │
│       ▼                                     │
│  6. Read error, diagnose                    │
│  7. Fix implementation (NOT tests)          │
│  8. Run tests again                         │
│  9. Still failing?                          │
│       │                                     │
│       ▼                                     │
│  retry_count++ ──► over limit? ──► STOP     │
│       │                 surface to user     │
│       │                                     │
│       └──────── go to step 6                │
│                                             │
│  ALL TASKS DONE? ──► EXIT WITH VICTORY 🎉  │
└─────────────────────────────────────────────┘
```

## Detailed Steps

### Step 1: Read State (Every Iteration)

At the START of every iteration, re-read from disk:

1. `docs/tasks.md` — the master progress tracker
2. The plan file — to find the next unchecked `- [ ]` step
3. Any error logs or test output from the previous iteration

**Never rely on memory from previous iterations.** The files are the truth.

### Step 2: Pick the Next Task

Scan the plan file for the first unchecked `- [ ]` item. This is your current task.

- If a task has sub-steps, execute them in order
- Mark the current task as `[/]` (in-progress) in both the plan and `docs/tasks.md`

### Step 3: Execute

Follow the plan's instructions exactly:

- If the step says "write code" → write exactly that code
- If the step says "run command" → run exactly that command
- If the step says "commit" → commit with exactly that message

**Do not improvise.** The plan was reviewed and approved. Follow it.

### Step 4: Run Tests

After implementing, run the tests specified in the plan:

```bash
# Example: run the specific test for this task
pytest tests/path/test_file.py::test_name -v
```

Always capture the full output.

### Step 5: Evaluate

**If tests pass:**
1. Mark the step as `[x]` in the plan file
2. Update `docs/tasks.md` to reflect progress
3. Commit the changes with the message from the plan
4. Go back to Step 2

**If tests fail:**
1. Increment `retry_count` for this task
2. Read the error message carefully
3. Go to Step 6

### Step 6: Diagnose & Fix

When a test fails:

1. **Read the full error output** — stack trace, assertion error, line numbers
2. **Identify the root cause** — is it a typo? Logic error? Missing import? Wrong path?
3. **Fix the implementation** — apply the smallest change that addresses the root cause
4. **DO NOT modify the test** — the test is the spec. Fix your code.
5. **Run tests again** — go back to Step 4

### Step 7: Retry Limits

Each task gets a maximum number of retries:

| Scope | Max Retries |
|-------|-------------|
| Single step fix attempt | **5** |
| Single task (all steps) | **10** |
| Entire plan | **30** |

When a limit is hit:

1. **Log what you tried** — write a summary of attempts and errors to `docs/tasks.md`
2. **STOP the loop**
3. **Surface to the user** with:
   - What task you're stuck on
   - What errors you're seeing
   - What you've already tried
   - Your best guess at the root cause

**Never silently skip a failing task.** Never move on hoping it'll fix itself later.

## State Management

### `docs/tasks.md` Format

```markdown
# Current Execution

**Plan:** `docs/superpowers/plans/2026-03-22-feature-name.md`
**Status:** IN PROGRESS
**Current Task:** Task 3, Step 2
**Iteration:** 7
**Retry Count (current task):** 1

## Progress
- [x] Task 1: Component A — ✅ passed, committed abc1234
- [x] Task 2: Component B — ✅ passed, committed def5678
- [/] Task 3: Component C — 🔄 in progress
- [ ] Task 4: Component D
- [ ] Task 5: Integration

## Error Log
### Iteration 5 — Task 3, Step 1
- Error: `ImportError: cannot import name 'foo' from 'bar'`
- Fix applied: added missing export to `bar/__init__.py`
- Result: resolved, moved to Step 2
```

### Git Commits

Commit after every successfully completed task (not every step):

```bash
git add -A
git commit -m "<message from plan>"
```

This creates a clean, reviewable git history and provides rollback points.

## Safety Rules

> [!CAUTION]
> These rules are non-negotiable. Violating them wastes the user's time and trust.

1. **Never modify tests** without explicit user authorization
2. **Never skip a failing task** — fix it or stop
3. **Never exceed retry limits** — respect the safety valves
4. **Never improvise beyond the plan** — if the plan is wrong, stop and tell the user
5. **Always commit after passing tasks** — partial progress must be saved
6. **Always update `docs/tasks.md`** — the file IS your memory

## Handling Plan Defects

If you discover the plan itself is wrong (e.g., it references a file that doesn't exist, or the architecture doesn't work as designed):

1. **STOP the loop**
2. **Do NOT try to "fix" the plan yourself**
3. **Surface to the user** with:
   - What's wrong with the plan
   - Where you noticed the defect
   - A suggested correction (if you have one)
4. Wait for the user to approve a plan amendment before continuing

## Completion

When all tasks in the plan are marked `[x]`:

1. Run the **full test suite** one final time
2. Update `docs/tasks.md` status to `COMPLETE`
3. Write a brief summary:
   - Total iterations used
   - Any retries and what caused them
   - Final test results
4. Commit final state
5. Report to the user: **"Plan complete. All tasks pass. N iterations, M retries."**

## Quick Reference

```
Entry point:    Plan file from writing-plans
State file:     docs/tasks.md
Truth source:   Plan file + test results + docs/tasks.md
Test policy:    NEVER modify tests (unless user says so)
Retry limits:   5 per step, 10 per task, 30 per plan
On failure:     Log, fix implementation, retry — or stop and surface
On stuck:       STOP. Tell the user. Don't spiral.
On plan defect: STOP. Tell the user. Don't improvise.
On victory:     Full test suite, update state, commit, celebrate 🎉
```
