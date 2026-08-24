^ [[meadow workflow]] -- from initial page to published bundle

---

*We use [[multi-stage processing]].  This page describes the workflow from start to finish.*

First, in configuration we specify the [[bundle page type -- initial]] and [[bundle page config -- outlinksDepth]] for that page.

Then we pass that configuration (and more) to the [[runtime native -- working_graph]] which does the [[constrained graph expansion]] based on that config to get [[raw working graph]].  That raw working graph shows [[bundle page tracking state -- untracked]] as well as [[bundle page tracking state -- tracked]] [[bundle page]]s.
:
This raw working graph is the graph that powers the [[app component -- bundle page views]].  Each of the [[bundle page]]s in it has [[bundle page metadata]] including [[bundle page config]]

From there, once we [[bundle page tracking state -- tracked|track]] the pages we care about and [[blacklist]] those we don't want to include, a [[tracked working graph]] is created.

then in the [[app component - modal -- bundle preview|preview modal]] we create the [[generated html bundle]].  From there the [[publisher]] can review differences compared to the previous version of the preview.  The user saves those changes.

Finally, in the [[app component - modal -- bundle preview -- publish tab|publish tab]] we copy that [[generated html bundle]] to the [[published bundle type -- local html]] and then upload it to [[published bundle type -- remote html|the files on S3]].
