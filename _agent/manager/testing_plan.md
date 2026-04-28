# Agents Manager Testing Plan

Manual testing plan for the agents-manager.

## Prerequisites

- No existing `meadow_agents` tmux session
- No existing `/tmp/meadow_wt_*` directories
- Clean state: `tmux list-sessions | grep meadow` returns nothing

## 1. Launch

1. Run: `cd _agent/manager/agents-manager-node && npx tsx src/agentsManager.ts`
2. Verify: attaches to a `meadow_agents` tmux session
3. Verify: full-screen sidebar TUI is displayed with "Agents" header, `[new]` entry, and help line at bottom

## 2. Create Agent

1. Press `n` (or select `[new]` and press Enter)
2. Verify: a new agent appears in the list with `[Preparing]` tag
3. Verify: message area shows "Created <name>"
4. Verify: `tmux list-sessions` shows `meadow_agent_<name>` session exists
5. Verify: `/tmp/meadow_wt_<name>/_agent/agent/.agent_info/` exists with `name`, `phase`, `tmux_session` files
6. Verify: `_agent/agent/.agent_info/phase` contains "preparing"
7. Wait for prepare to finish — phase should change to `[Ready]` in sidebar (auto-refreshes every 2s)
8. Verify: `_agent/agent/.agent_info/phase` now contains "ready"

## 3. Attach to Agent

1. Select the agent with j/k or mouse click
2. Press Enter
3. Verify: message area shows `tmux attach -t meadow_agent_<name>`
4. From another terminal, run that command — verify you attach to the agent's Claude session

## 4. Create Second Agent

1. Press `n` again
2. Verify: second agent appears in list
3. Verify: both agents have independent tmux sessions (`tmux list-sessions`)
4. Verify: both have their own `/tmp/meadow_wt_<name>/` worktrees

## 5. Navigation

1. Press `j` — selection moves down
2. Press `k` — selection moves up
3. Press down/up arrows — same behavior
4. Click on an agent with mouse — selects it
5. Click on `[new]` — creates a new agent

## 6. Status

1. Select an agent, press `s`
2. Verify: message area shows agent id, branch, phase, and worktree path

## 7. Rename

1. Select an agent, press `r`
2. Verify: help line changes to "Rename: " with a cursor
3. Type a new name, press Enter
4. Verify: agent is renamed in the list
5. Verify: `tmux list-sessions` shows renamed session `meadow_agent_<newname>`
6. Verify: `_agent/agent/.agent_info/name` updated in worktree
7. Test cancel: press `r`, then Escape — verify rename mode exits without changes

## 8. Delete

1. Select an agent, press `d`
2. Verify: message area shows "Press d again to confirm delete <name>"
3. Press `d` again
4. Verify: agent removed from list
5. Verify: `tmux list-sessions` no longer shows that agent's session
6. Verify: `/tmp/meadow_wt_<name>` directory removed
7. Verify: git branch `wt-<name>` removed
8. Test cancel: select agent, press `d`, then press any other key — confirm not deleted

## 9. Merge

1. Have an agent in `[Ready]` state
2. Attach to the agent's tmux session and make a small commit on its branch
3. Back in sidebar, select that agent, press `m`
4. Verify: message area shows "Merging <name>..."
5. Verify: on success, shows merge success message, agent removed from list
6. Verify: the commit is now on main
7. Verify: worktree and branch cleaned up

## 10. Help

1. Press `?`
2. Verify: message area shows help text with all keybindings

## 11. Session Restore

1. Create an agent, wait for it to reach `[Ready]`
2. Kill the `meadow_agents` sidebar session: `tmux kill-session -t meadow_agents`
3. Also kill the agent session: `tmux kill-session -t meadow_agent_<name>`
4. Verify: `/tmp/meadow_wt_<name>` still exists with `_agent/agent/.agent_info/`
5. Re-launch: `npx tsx src/agentsManager.ts`
6. Verify: agent appears in the list (discovered from worktree scan)
7. Verify: a new `meadow_agent_<name>` session was created (restored)

## 12. Dead Session Detection

1. Create an agent
2. Kill only the agent's tmux session: `tmux kill-session -t meadow_agent_<name>`
3. Verify: sidebar shows `[Dead]` tag next to the agent within 2 seconds

## 13. Exit

1. Press `q` or Ctrl-C in the sidebar
2. Verify: sidebar exits cleanly (cursor restored, mouse tracking disabled)
3. Verify: agent tmux sessions are NOT killed (they're independent)

## 14. Existing Session Prompt

1. Launch the manager (creates `meadow_agents` session)
2. Detach from it (Ctrl-B, d)
3. Launch again
4. Verify: prompted "Session 'meadow_agents' already exists. Attach? [y/n]"
5. Press `y` — verify it reattaches
6. Repeat, press `n` — verify it kills and recreates

## Cleanup

After testing, clean up:
```bash
tmux kill-session -t meadow_agents
tmux list-sessions | grep meadow_agent_ | cut -d: -f1 | xargs -I{} tmux kill-session -t {}
rm -rf /tmp/meadow_wt_*
```
