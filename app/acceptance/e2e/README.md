# Scenario identity and reviews

## Tick source markers

Include the `sourceCommand` fixture in each scenario and wrap its awaited commands:

```ts
await sourceCommand(() => editor.checkSourceChanges());
await sourceCommand(() => checkpoint('source changes are ready for review'));
```

This captures the executing command's position and status for each tick. The
report viewer hides these wrappers by default while preserving the recorded line
numbers. Use an async callback when the expression itself contains an await.
Older recordings without this capture cannot identify individual tick commands;
rerun the scenario to obtain source markers.

## Stable scenario IDs

Each scenario carries a permanent UUID in its Playwright `scenario-id` annotation:

```ts
test('Scenario title', {
  annotation: { type: 'scenario-id', description: 'a-permanent-uuid' },
}, async ({ page }) => {
  // ...
});
```

Generate a fresh UUID when adding a scenario. Keep that UUID when renaming or
moving the scenario; give copied scenarios new UUIDs. The report viewer uses this
identity to preserve review status across runs and title changes.

The viewer stores review status and its append-only event history in
`~/meadow-e2e-artifacts/scenario-reviews.json`, outside individual run directories.
Deleting a recording therefore preserves its review history, including the
captured scenario name, run, source path, and code revision. Older recordings use
the current spec's annotation when available, with a name-based fallback.
