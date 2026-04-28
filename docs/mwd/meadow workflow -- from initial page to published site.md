^ [[meadow workflow]] -- from initial page to published site

---

*We use [[multi-stage processing]].  This page describes the workflow from start to finish.*

First, in configuration we specify the [[site page type -- initial]] and [[site page config -- outlinksDepth]] for that page.

Then we pass that configuration (and more) to the [[native_utils -- working_graph]] which does the [[constrained graph expansion]] based on that config to get [[raw working graph]].  That raw working graph shows [[site page tracking state -- untracked]] as well as [[site page tracking state -- tracked]] [[site page]]s.
:
This raw working graph is the graph that powers the [[app component -- site page views]].  Each of the [[site page]]s in it has [[site page metadata]] including [[site page config]]

From there, once we [[site page tracking state -- tracked|track]] the pages we care about and [[blacklist]] those we don't want to include, a [[tracked working graph]] is created.

then in the [[app component - modal -- site preview|preview modal]] we create the [[local html preview site]].  From there the [[publisher]] can review differences compared to the previous version of the preview.  The user saves those changes.

Finally, in the [[app component - modal -- site preview -- publish tab|publish to meadow tab]] we copy that [[local html preview site]] to the [[published site type -- local html]] and then upload it to [[published site type -- remote html|the files on S3]].