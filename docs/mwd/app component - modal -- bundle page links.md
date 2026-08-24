^ [[app component]] [[app component - modal]] -- [[bundle page]] [[inlink]]s and [[outlink]]s

---

Opened by clicking a [[app component - bundle page links button]] button in the [[app component -- bundle page card]]

It shows two link sections.  First [[outlink]]s then [[inlink]]s.

For each link it shows:
* the title of the [[source page]]
* the relative path of the source page to the base.  Basically the same information as [[bundle page config -- sourceGraphSubdirectory]] (but for the bundle page, since we don't always have [[bundle page]]s for each of these links.
* information about the [[bundle page]]
	* does it exist?
		* If no
			* if [[outlink]]
				* is it because it exceeds the _link not tracked_
				* Note that even [[leaf bundle page]]s should have information about [[source page]]s at one-greater depth, which they get from [[runtime native -- working_graph]], even if those source pages are not [[bundle page]]s
			* if [[inlink]]
				* is it because the remaining inlink depth is < 0?
				* Note that this [[bundle page]] we're looking at has information about all its [[source page]] inlinks, even if those inlinks are not part of the [[raw working graph]]
		* if yes
			* Is it [[bundle page tracking state -- tracked]]?  Is it a [[sensitive bundle page]]?  Is it a [[blacklisted bundle page]]?  Uses the [[app component - bundle page pill]]s that are also used in [[app component -- bundle page card]]
			* should also have a "link" button that updates this modal to show the information for _that_ bundle page.
			* should have a button that selects or de-selects the [[bundle page]] in the [[raw working graph]], so when the [[publisher]] closes this modal they can see it and do things to it.
