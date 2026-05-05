---
name: merge
description: Merge a worktree branch into main - handle conflicts, run full checks, auto-fix issues
---

# Merge Worktree Branch into Main

Follow these steps to merge a parallel-development worktree branch back into main.

## Step 1: Preflight checks

1. Ensure we are not already on main
2. Ensure all changes are already committed.  If not, you can automatically commit them

## Step 2: Merge the branch to main

### If the merge succeeds with no conflicts

Proceed to Step 3.

### If there are merge conflicts

1. Run `git diff --name-only --diff-filter=U` to list conflicted files.
2. Tell the user which files have conflicts.
3. For each conflicted file:
   - Read the file to understand the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   - Analyze both sides of each conflict and resolve it intelligently, preserving the intent of both changes where possible
   - Edit the file to remove all conflict markers with the correct resolution
4. After resolving all files, stage them: `git add <resolved files>`
5. Complete the merge: `git commit --no-edit`
6. Tell the user what resolutions were made.

## Step 3: Rebuild native utilities if changed

After merging, check if the merged branch touched any native utility source code.
Use the merge commit's two parents to see what the branch changed:

```bash
git diff HEAD^1 HEAD --name-only -- app/native_utils/
```

If any files under `app/native_utils/` were changed, recompile the Rust binaries
by running `./prepare` from the repo root. This is critical because worktree
builds don't carry over to main — the release binaries in `target/release/`
are local to each worktree checkout.

```bash
./prepare
```

If no native utility files were changed, skip this step.

## Step 4: Run the checks

Run the check suite from the repo root:

```bash
./quickcheck
```

Then run the end-to-end test suite using the "e2e" skill.

### If checks pass

Proceed to Step 5.

### If checks fail

1. Read the check output carefully to identify what failed.
2. Investigate the failing code — read the relevant files and understand the issue.
3. Fix the problem.
4. Stage the fix and commit it with the prefix `merge fix:` in the commit message. For example:
   ```
   merge fix: update import paths after merge
   ```
5. Run `./quickcheck --full` again.
6. If it still fails, repeat this fix cycle up to 3 times. If checks still fail after 3 attempts, **stop** and tell the user:
   > "Checks are still failing after 3 fix attempts. Manual intervention needed."
   Show the remaining failure output so the user can debug.

## Step 5: Summary

Print a summary:

- Branch that was merged
- Whether there were conflicts (and how they were resolved)
- Whether any post-merge fixes were needed (list the fix commits)
- Final check status
- Remind the user they can delete the worktree branch if it's no longer needed:
  ```
  git branch -d <branch>
  git worktree remove <path>  # if the worktree directory still exists
  ```
