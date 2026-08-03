[[filter]]s can be combined to shape which pages are visible.

When at least two Solo or Hide controls are active, a **Mix view** control
appears below the filters. Its editor lets the publisher reorder filters,
choose **Any**, **All**, or **Without**, and drag filters into nested outlines.
The outlines act as parentheses.

The editor produces a serializable filter expression rather than directly
implementing visibility. A filter term records the filter identifier and the
control that activated it (`solo` or `hide`). Group terms record `union`,
`intersection`, or `difference` and contain other terms. The display graph
evaluates that expression against the page sets matched by the active filters.

The initial expression preserves the basic filter behavior: Solo filters are
combined with Any, while Hide filters are combined with All because each Hide
term means pages not matched by that filter. When both kinds are present, the
two results are combined with All.

Turning off a Solo or Hide control makes its term stop participating but does
not discard its position in the expression. Turning the control back on
restores it to the same group. A newly soloed filter joins the current result
with Any; a newly hidden filter narrows the current result with All. The
publisher can then reopen Mix view and arrange the new term differently.
