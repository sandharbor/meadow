^ [[type-safe specification - 2026-02]] -- Meadow concept

---

Meadow concepts are TypeScript values in `app/concepts/` that define the
application's stable domain and architecture language. Each has a typed ID,
name, kind, definition, mechanics, interplay, and explicit links to other
concepts. App areas are concepts too.

[[e2e test]]s import the concepts they exercise. Reports derive acceptance
coverage and app-area grouping from those references rather than maintaining a
second documentation registry.

The key observation remains that the specification is structured, type-safe
TypeScript rather than disconnected Markdown. Concept links and implementation
roles are checked at compile time, while inline type-only participation
declarations connect cross-cutting concepts to their real code symbols without
creating a production runtime dependency.

This makes Meadow concepts a concrete, working example of a
[[type-safe specification - 2026-02]].

See also: [[app specification]], [[executable requirements]]
