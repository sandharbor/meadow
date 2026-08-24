^ [[runtime native]] -- working_graph

---

The [[rust]] binary that creates the [[raw working graph]] by essentially indexing _all_ [[inlink]]s,
then doing [[constrained graph expansion]] based on the [[bundle config]] and [[bundle page config]].  For example, it takes [[bundle page config -- outlinksDepth]], [[bundle page config -- inlinksDepth]], and [[bundle page config -- blacklist]] into consideration when expanding the graph to create the [[raw working graph]].

This is written in [[rust]] to [[design motivation -- support large bundles|support large bundles]] [[design motivation -- speed|quickly]].  The somewhat surprising bit is that [[we must process the entire source graph for links]], so we need something very fast to be able to do that.  [[TypeScript]] wasn't doing the trick.
