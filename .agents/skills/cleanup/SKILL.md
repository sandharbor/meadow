---
name: cleanup
description: Safely clean up the current worktree after verifying no unmerged work would be lost
---

# Clean Up Current Worktree

Safely remove the current worktree and its branch, but only after verifying
that no work would be lost.

## Step 1: Preflight checks

Run all of these. If any check fails, tell the user why and stop.

1. Run `git rev-parse --git-dir` and confirm we are inside a worktree (the
   git-dir path will contain `/worktrees/`). If not, stop.
2. Run `git status --porcelain`. If there is any output, stop — there are
   uncommitted changes.
3. Record the current state for later steps:
   ```bash
   BRANCH=$(git branch --show-current)
   WORKTREE_PATH=$(git rev-parse --show-toplevel)
   MAIN_REPO=$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')
   ```

## Step 2: Determine if it is safe to delete

There are exactly two safe conditions. Check them in order:

### Condition A: No work done — branch is identical to main

```bash
git diff main...HEAD --quiet
git rev-list main..HEAD --count   # must be 0
```

If both pass, the branch has no unique work. It is safe to delete.

### Condition B: All work has been merged to main

```bash
git rev-list main..HEAD --count   # greater than 0 means there are commits
git branch --contains HEAD main   # if main appears, all commits are merged
```

If there are commits but main contains HEAD, everything is already merged.
It is safe to delete.

### Neither condition met

Tell the user:

> This branch has commits that are not yet on main. Use `/merge` to merge
> first, or confirm you want to discard the work.

Do **not** delete anything. Stop here.

## Step 3: Clean up

First, capture the worktree name for tmux cleanup:

```bash
WORKTREE_NAME=$(basename "$WORKTREE_PATH")
```

Kill any tmux sessions associated with this worktree:

```bash
# Kill the dev server session (format: meadow_dev_<worktree-name>)
tmux kill-session -t "meadow_dev_${WORKTREE_NAME}" 2>/dev/null || true

# Kill any other sessions containing the worktree name
tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "$WORKTREE_NAME" | while read -r sess; do
  tmux kill-session -t "$sess" 2>/dev/null || true
done
```

Navigate out of the worktree, then remove it and the branch:

```bash
cd "$MAIN_REPO"
git worktree remove --force "$WORKTREE_PATH"
git branch -D "$BRANCH"
git worktree prune
```

## Step 4: Summary

Print what was cleaned up:

- Worktree path that was removed
- Branch that was deleted
- Tmux sessions that were killed (if any)
- Which condition applied (no work done, or already merged to main)
