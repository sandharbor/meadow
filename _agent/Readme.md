# Agent Development

The agents manager (`_agent/manager/`) lets you run multiple Claude Code agents
in parallel, each in its own git worktree. A tmux-based sidebar TUI
(`agents-manager-node/`) provides agent lifecycle management: create, attach,
rename, merge, and delete agents. Each agent gets an isolated
`/tmp/meadow_wt_<name>/` worktree on its own branch, so agents can work on
independent tasks without interfering with each other or with main.

Individual agents live in `_agent/agent/` within their worktree. The `_module/`
directories at each level contain the standard quickcheck scripts, docs, and
agent task definitions. The manager's `settings.yaml` configures the agent
prefix and worktree root path.
