---
name: work
description: Delegate work to a new agent in an isolated worktree
disable-model-invocation: true
---

# Delegate Work to a New Agent

Spin up a new agent worktree and hand off the task. This is a delegation — you
create the agent, pass it the work description, and return control to the user.
You do NOT implement the work yourself.

## Step 1: Prepare the delegation

1. Parse the user's description to determine what needs to be built.
2. Pick a short kebab-case name (e.g., `add-dark-mode`, `fix-login-redirect`).
3. Compose a clear task prompt that includes everything the new agent needs to
   know to do the work. Include relevant context, file paths, requirements,
   and any constraints the user mentioned.

## Step 2: Write the task to a temp file

Write the task prompt to a temporary file. This avoids any shell quoting issues
with complex multi-line descriptions.

```bash
# Write task to a temp file (use Write tool, not echo/cat)
/tmp/meadow_task_<name>.txt
```

## Step 3: Create the agent

```bash
cd <repo-root>/_agent/manager/agents-manager-node
./node_modules/.bin/tsx src/cli.ts create --name <chosen-name> --task-file /tmp/meadow_task_<name>.txt
```

The CLI will:
- Create a worktree with proper agent manager conventions
- Copy the task into `_agent/agent/messages/in/initial_prompt.txt` in the worktree
- Launch a tmux session that runs `./prepare`, then hands the task to claude

The new agent will appear in the agent manager sidebar automatically.

## Step 4: Report back

Tell the user:
- The agent name and worktree path
- That the agent is preparing and will start on the task automatically
- They can monitor it in the agent manager sidebar or attach directly:
  `tmux attach -t meadow_agent_<name>`
