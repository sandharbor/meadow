^ [[type-safe]] specification

---

The idea that statically-typed languages may be a better medium for [[app specification]] than markdown.

[[scenario doc]]s in meadow are a working example: TypeScript interfaces enforce structure that markdown can't. Fields must exist, types must match, and the compiler _quickly_ catches inconsistencies before anyone reads the document.

At scale, type-safe specs could enable real tooling — autocomplete, refactoring, cross-reference validation — things that are impossible with free-form prose (except with very slow AI processing).

This is an emergent idea. There may be a particularly good statically-typed way of describing software systems, just as [[project - TLA plus]] showed that formal math is the best way of describing distributed systems.

If specs are code, they become [[executable requirements]] — they can be run, checked, and explored. They could be surfable like a [[Bartosz-style explorable explanation]], especially with [[agent-generated artifact for human review -- video showing changes]] or things like [[meadow e2e tests -- test suite run report review tool]] showing the videos and other information. They could connect to use-case modeling (like [[book -- Writing Effective Use Cases]]) or even to just general requirements documentation like in _link not tracked_ )

This stands in [[productive tension]] with [[app specification will be done with agents and markdown]] — markdown is accessible and flexible, but types are verifiable and toolable. The answer may involve both.  Perhaps [[YAML frontmatter enables dependency-aware specifications]] is _enough_ of a push in this direction to be meaningfully helpful without needing to go to fully-typed interface?

See also: [[spec-driven development]], [[declarative specification]]
