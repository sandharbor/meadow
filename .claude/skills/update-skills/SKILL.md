---
name: update-skills
description: Verify and update agent skills so their system descriptions stay accurate as the codebase evolves
disable-model-invocation: true
---

# Update Skills

Skills encode two kinds of knowledge: **why** (purpose, goals, workflow steps)
and **how** (file paths, command names, architecture details, code patterns).
The "why" is stable, but the "how" drifts as the codebase evolves. This skill
systematically verifies each skill's factual claims and updates them.

## Step 1: Enumerate all skills

List every skill directory under `.claude/skills/` (excluding this one):

```bash
ls -d .claude/skills/*/
```

Read each `SKILL.md` file to build the full list.

## Step 2: For each skill, verify factual claims

Work through the skills one at a time. For each skill:

### 2a. Identify verifiable claims

Read the skill file and extract every factual claim about the system. These
fall into several categories:

- **File paths** — e.g. `app/e2e-tests/tests/*.spec.ts`, `app/electron_app/package.json`
- **Directory structures** — e.g. ASCII trees showing project layout
- **Command names and flags** — e.g. `./app/e2e-tests/check`, `./app/e2e-tests/dev-e2e`
- **Script behavior descriptions** — e.g. "starts MinIO in Docker", "allocates free ports"
- **Code patterns** — e.g. fixture APIs like `snapshot(message)`, function signatures
- **Architecture details** — e.g. port numbers, API routes, file formats
- **Configuration** — e.g. backing-store table names, Docker container names

### 2b. Check each claim against reality

For each claim:

1. **File/directory paths**: Use Glob to confirm they exist. Check for files
   that were added, renamed, or removed.
2. **Commands and scripts**: Read the script to confirm it still works as
   described. Check flags, arguments, and behavior.
3. **Code patterns**: Read the referenced source files to confirm APIs,
   function signatures, and usage patterns still match.
4. **Architecture details**: Read config files, server code, and test
   infrastructure to verify port numbers, route paths, table names, etc.
5. **Directory trees**: Compare the claimed tree against what actually exists
   via Glob and ls.

### 2c. Classify each finding

For each discrepancy found, classify it:

- **Stale path**: file was renamed or moved
- **Missing file**: file was deleted
- **New file**: relevant file exists but isn't mentioned
- **Changed behavior**: script or code works differently than described
- **Changed API**: function signature, route, or interface changed
- **Changed config**: port, table name, container name, etc. changed

## Step 3: Report findings before editing

Before making any changes, present a summary to the user for each skill:

> **Skill: `<name>`**
> - [list of discrepancies found, or "No issues found"]

Ask the user to confirm before proceeding with edits. This prevents
well-intentioned but unwanted changes.

## Step 4: Update the skill files

For each confirmed discrepancy:

1. **Preserve the "why"** — do not change the skill's purpose, workflow steps,
   or decision logic. Only update factual descriptions of the system.
2. **Update file paths** to reflect renames/moves.
3. **Add new files** to directory trees and key-file lists where relevant.
4. **Remove references** to deleted files.
5. **Update behavior descriptions** to match current script/code behavior.
6. **Update code examples** to match current APIs.
7. **Update config values** (ports, table names, routes) to match reality.

Use the Edit tool for surgical updates — do not rewrite entire skill files.

## Step 5: Verify the updates

After editing, re-read each modified skill file and do a quick spot-check that
the updates are accurate and that nothing was accidentally broken.

Then run:

```bash
./quickcheck
```

This confirms the skill file edits didn't break anything (skill files
themselves aren't validated by check, but this ensures you didn't accidentally
modify non-skill files).

## Step 6: Summary

Print a final summary:

- How many skills were checked
- How many had discrepancies
- What was updated (brief list per skill)
- Any claims that couldn't be verified and may need manual review
