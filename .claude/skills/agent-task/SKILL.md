---
name: agent-task
description: List and run agent tasks defined in _module/agent_tasks/ directories across the repo
---

# /agent-task — Run Agent Tasks

Run agent tasks defined in `_module/agent_tasks/` directories throughout the
repo using the `tools/agent_task/run_agent_task` runner.

## When invoked with no arguments (`/agent-task`)

Scan for all agent task markdown files and list them:

```bash
find . -path '*/_module/agent_tasks/*.md' -not -path '*/node_modules/*' | sort
```

Display the results as a list showing the full paths so the user can see where
each task lives.

## When invoked with arguments (`/agent-task <name> [options]`)

1. **Resolve the task file** — match the user's `<name>` against the discovered
   agent task files. Use fuzzy/substring matching (e.g. "pagespec" matches
   `pagespec_chaos_check.md`). If the match is ambiguous, ask the user to
   clarify.

2. **Determine run count** — look for a number in the user's request (e.g.
   "run pagespec chaos 30 times", or "-n 30"). Default to 1 if not specified.

3. **Run it** — execute the runner, which invokes `claude --print` in a loop:

   ```bash
   ./tools/agent_task/run_agent_task -n <count> -v <resolved_task_file>
   ```

   Run this in the background since agent tasks are long-running. The runner
   logs to `tools/agent_task/run_agent_task.log` — tell the user they can
   `tail -f` that file to watch progress.

   Use the `-v` (verbose) flag by default so tool calls are visible in the log.
