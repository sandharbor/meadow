The idea that requirements and specifications should be executable — not just read, but run, tested, and validated.

[[scenario doc]]s are a small example: they are TypeScript that the test runner actually uses to organize and match [[e2e test]]s. The spec isn't separate from the system — it's part of it.

At the extreme end: specifications that generate or validate the system they describe. The spec becomes the source of truth that the implementation must conform to, checked automatically.

Executable specs could be surfed interactively, like a [[Bartosz-style explorable explanation]] — letting someone explore the system's behavior by running the spec itself.

See also: [[type-safe specification - 2026-02]], [[app specification]]
