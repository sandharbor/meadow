^ [[native_utils]] -- working_graph

---

The [[rust]] binary that creates the [[raw working graph]] by essentially indexing _all_ [[inlink]]s,
then doing [[constrained graph expansion]] based on the [[site config]] and [[site page config]].  For example, it takes [[site page config -- outlinksDepth]], [[site page config -- inlinksDepth]], and [[site page config -- blacklist]] into consideration when expanding the graph to create the [[raw working graph]].

This is written in [[rust]] to [[design motivation -- support large sites|support large sites]] [[design motivation -- speed|quickly]].  The somewhat surprising bit is that [[we must process the entire source graph for links]], so we need something very fast to be able to do that.  [[TypeScript]] wasn't doing the trick.
