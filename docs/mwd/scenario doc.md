^ [[type-safe specification - 2026-02]] -- scenario doc

---

Scenario docs are TypeScript objects in the meadow codebase that implement a `ScenarioDoc` interface (id, name, description, slugPrefixes). They organize [[e2e test]]s by feature area — publishing, filters, frontier, call out, etc.

Tests match to scenario docs via slug prefix matching. They live in `~/meadow/app/e2e-tests/test-runner/src/scenario-docs/`.

The key observation: scenario docs are **not markdown**. They are structured, type-safe TypeScript. The `ScenarioDoc` interface enforces structure that free-form prose cannot — missing fields, invalid types, and inconsistencies are caught at compile time rather than by human review.

This makes them a concrete, working example of a [[type-safe specification - 2026-02]].

See also: [[app specification]], [[executable requirements]]
