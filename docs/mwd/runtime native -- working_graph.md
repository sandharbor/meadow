^ [[runtime native]] -- working_graph

---

The [[rust]] binary that creates the [[raw working graph]] by essentially indexing _all_ [[inlink]]s,
then doing [[constrained graph expansion]] based on the [[bundle config]] and [[bundle page config]].  For example, it takes [[bundle page config -- outlinksDepth]], [[bundle page config -- inlinksDepth]], and [[bundle page config -- blacklist]] into consideration when expanding the graph to create the [[raw working graph]].

This is written in [[rust]] to [[design motivation -- support large bundles|support large bundles]] [[design motivation -- speed|quickly]].  The somewhat surprising bit is that [[we must process the entire source graph for links]], so we need something very fast to be able to do that.  [[TypeScript]] wasn't doing the trick.


Source discovery maintains a persistent index under Meadow Home `cache/source-index/`,
excluded from Git. Each source directory has an index keyed by SHA-256 of its
resolved absolute path. The index records that path, format and parser versions,
file metadata, content fingerprints, and unresolved parsed links. Every live
request reconciles file metadata; changed files are read and parsed, and links
are resolved against the current file set before graph traversal. Returned file
nodes include `sourceFile` metadata (physical path, SHA-256 digest, and size).
Sourcing uses those nodes to construct candidate snapshots without a separate
library-wide content scan.

`--source-index-root` selects the cache parent and `--rebuild-index` forces a
complete replacement, which is committed only after successful indexing. The
Sourcing action **Recheck all source files** requests this rebuild. Missing
starting sources require user repair and preserve the accepted snapshot.
