# Meadow

[![CI](https://github.com/sandharbor/meadow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sandharbor/meadow/actions/workflows/ci.yml)

Turn source graphs of notes into focused, shareable bundles and publish them as microsites.

<img src="ui.png" alt="Meadow UI" width="500">

Learn more about Meadow at [meadow-notes.com](https://meadow-notes.com).

# Dev

See the Readme in `_agent` for how we do agentic development

# Running the development tooling

`/dev` skill (either on `main` or in a worktree.  Works from either place)

It starts the app's backend, frontend, and then `app/tooling/dev_tools`, which is
just a nice UI for launching the app with different configurations.

# Building the app

There is an `app-build` skill that runs the build script under `app/hosts/desktop`

# Testing - Quick

`./quickcheck` recursively runs the `./quickcheck` files nested under the
`_module/scripts` directories.  Mostly that's linting and unit tests, but it can
also be small (quick) integration tests (like for the `runtime/native` Rust files)
or even slightly more comprehensive `app/runtime/system_tests` (which are still pretty
quick).

# Testing - E2E (Slow)

Run with the `/e2e` skill, which runs `app/acceptance/e2e/_module/scripts/slowcheck`

It runs a large number of end-to-end scenarios using Playwright, recording
videos and snapshotting state.

To see the resulting "review packet" you can use the `/packet` skill.  That runs
the app/acceptance/report_viewer where you can see the results of the run, view the videos,
and look at the "packet" associated with each scenario.
