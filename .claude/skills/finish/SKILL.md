---
name: finish
description: Finish a worktree development session - commit, merge to main, and clean up
---

# Finish Worktree Development

High-level orchestrator that completes a worktree development session. This
skill manages three phases — commit, merge, cleanup — delegating each to a
sub-agent via the Agent tool so failures are isolated and the parent never
loses track of its checklist.

**Critical rule**: The parent agent does almost no real work itself. It
launches sub-agents, checks their results, and moves to the next phase. Only
Steps 4–5 (lightweight verification and summary) are done by the parent
directly.

Run each step sequentially. If any step fails, stop and report the failure to
the user. Do not proceed to the next step.

---

## Step 1: Commit any uncommitted work

Launch a **foreground sub-agent** (via the Agent tool) with this prompt:

> Check for uncommitted changes and commit them if needed.
>
> 1. Run `git status --porcelain` to check for uncommitted changes.
> 2. If the working tree is clean (no output), report "Nothing to commit" and
>    stop.
> 3. If there are uncommitted changes, commit them. Follow the standard commit
>    procedure: stage relevant files, write a concise commit message describing
>    the changes, and create the commit.
> 4. Verify the commit succeeded by confirming `git status --porcelain` is now
>    clean.
> 5. If the commit fails (e.g. pre-commit hook rejection), fix the issue and
>    retry once. If it still fails, report the error.
>
> Report back: what was committed (file list + commit message), or that the
> tree was already clean.

Wait for the result. If the agent reports a commit failure, stop and tell the
user.

---

## Step 2: Merge to main

Before launching the agent, capture the worktree info for later:

```bash
WORKTREE_NAME=$(basename "$(git rev-parse --show-toplevel)")
AGENT_NAME=$(cat _agent/agent/.agent_info/name 2>/dev/null || echo "")
```

Launch a **foreground sub-agent** (via the Agent tool) with the full merge +
e2e instructions inlined. Do NOT tell the agent to "invoke the /merge skill"
or "invoke the /e2e skill". Instead, use this prompt:

> Merge the current worktree branch into main and run full checks.
>
> ### Preflight
>
> 1. Ensure we are not already on main.
> 2. Ensure all changes are committed. If not, commit them automatically.
>
> ### Merge
>
> 1. Run `git checkout main && git merge <branch>`.
> 2. If the merge succeeds with no conflicts, proceed to the check step.
> 3. If there are merge conflicts:
>    a. Run `git diff --name-only --diff-filter=U` to list conflicted files.
>    b. For each conflicted file, read it, understand both sides of each
>       conflict, resolve intelligently, and edit to remove all conflict
>       markers.
>    c. Stage resolved files: `git add <resolved files>`
>    d. Complete the merge: `git commit --no-edit`
>    e. Report what resolutions were made.
>
> ### Rebuild native utilities if changed
>
> After merging, check if native utility source code changed:
>
> ```bash
> git diff HEAD^1 HEAD --name-only -- app/native_utils/
> ```
>
> If any files under `app/native_utils/` were changed, run `./prepare` from
> the repo root. If none changed, skip this.
>
> ### Run checks
>
> 1. Run `./quickcheck` from the repo root.
> 2. Then run the end-to-end tests. Determine a short note describing why this
>    run is happening. Include the branch name and, if an agent name was
>    provided, the agent name (e.g. "Verifying main after merging branch
>    `wt-pale-dot` from agent `fix-graph-drag-selection`"). If no agent name
>    is available, omit the "from agent" part. The agent name for this
>    worktree is: "${AGENT_NAME}". Run:
>    ```bash
>    ./app/e2e-tests/_module/scripts/slowcheck --run-notes "<your note>"
>    ```
> 3. If any check fails:
>    a. Read the output carefully to identify what failed.
>    b. Investigate the failing code — read relevant files and understand the
>       issue.
>    c. Fix the problem.
>    d. Stage the fix and commit with the prefix `merge fix:` in the message.
>    e. Re-run `./quickcheck` (and e2e if the e2e test failed).
>    f. Repeat up to 3 times. If still failing after 3 attempts, report:
>       "Checks are still failing after 3 fix attempts. Manual intervention
>       needed." and include the failure output.
>
> ### Key files for e2e debugging
>
> - `app/e2e-tests/tests/*.spec.ts` — test specs
> - `app/e2e-tests/src/run/test-fixtures.ts` — custom Playwright fixtures
> - `app/e2e-tests/src/run/pages/` — page object models used by tests
> - `app/e2e-tests/playwright.config.ts` — test configuration, Docker container setup
> - `~/meadow-e2e-artifacts/` — test run output (videos, logs, state snapshots)
>
> ### Report back
>
> - Branch that was merged
> - Whether there were conflicts (and how they were resolved)
> - Whether any post-merge fixes were needed (list the fix commits)
> - quickcheck result (pass/fail)
> - e2e test result (pass/fail, which tests ran)

Wait for the result. **Verify that e2e tests were actually executed** — look
for e2e test output in the agent's response. If there is no evidence that e2e
tests ran and the agent reported success, that is a failure — report it to the
user. If the merge or checks failed, stop and tell the user. Do not proceed to
cleanup.

---

## Step 3: Clean up the worktree

Launch a **foreground sub-agent** (via the Agent tool) with the cleanup
instructions inlined plus the tmux cleanup. Use the WORKTREE_NAME captured
earlier. Do NOT tell the agent to "invoke the /cleanup skill". Use this prompt:

> Safely clean up the current worktree and its branch.
>
> ### Preflight checks
>
> Run all of these. If any check fails, report why and stop.
>
> 1. Run `git rev-parse --git-dir` and confirm we are inside a worktree (the
>    git-dir path will contain `/worktrees/`). If not, stop.
> 2. Run `git status --porcelain`. If there is any output, stop — there are
>    uncommitted changes.
> 3. Record the current state:
>    ```bash
>    BRANCH=$(git branch --show-current)
>    WORKTREE_PATH=$(git rev-parse --show-toplevel)
>    MAIN_REPO=$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')
>    WORKTREE_NAME=$(basename "$WORKTREE_PATH")
>    ```
>
> ### Determine if it is safe to delete
>
> Check these conditions in order:
>
> **Condition A: No work done — branch is identical to main**
> ```bash
> git diff main...HEAD --quiet
> git rev-list main..HEAD --count   # must be 0
> ```
> If both pass, the branch has no unique work. Safe to delete.
>
> **Condition B: All work has been merged to main**
> ```bash
> git rev-list main..HEAD --count   # greater than 0 means there are commits
> git branch --contains HEAD main   # if main appears, all commits are merged
> ```
> If there are commits but main contains HEAD, everything is already merged.
> Safe to delete.
>
> **Neither condition met**: Report that this branch has commits not yet on
> main and stop. Do not delete anything.
>
> ### Clean up
>
> Kill any tmux sessions associated with this worktree:
> ```bash
> tmux kill-session -t "meadow_dev_${WORKTREE_NAME}" 2>/dev/null || true
> tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "$WORKTREE_NAME" | while read -r sess; do
>   tmux kill-session -t "$sess" 2>/dev/null || true
> done
> ```
>
> Navigate out and remove the worktree and branch:
> ```bash
> cd "$MAIN_REPO"
> git worktree remove --force "$WORKTREE_PATH"
> git branch -D "$BRANCH"
> git worktree prune
> ```
>
> ### Report back
>
> - Worktree path that was removed
> - Branch that was deleted
> - Tmux sessions that were killed (if any)
> - Which condition applied (no work done, or already merged to main)

Wait for the result. If cleanup failed, report the issue to the user.

---

## Step 4: Final verification checklist

The parent does this itself — no sub-agent needed.

Run through this checklist. If any item fails, report it to the user as a
warning.

- [ ] `git status --porcelain` is clean on main (no uncommitted changes)
- [ ] The worktree directory no longer exists on disk
- [ ] `git worktree list` does not mention the old worktree path
- [ ] `git branch` does not list the old worktree branch
- [ ] No tmux sessions remain for this worktree (`tmux list-sessions 2>/dev/null | grep "$WORKTREE_NAME"` returns nothing)
- [ ] `./quickcheck` was run during merge and passed
- [ ] End-to-end tests were run during merge and passed

---

## Step 5: Summary

Print a final summary:

- What was committed (if anything)
- Merge result (branch name, any conflicts or fixes)
- Cleanup result (worktree path and branch removed, tmux sessions killed)
- Verification checklist results
- Final status: success or which step failed
