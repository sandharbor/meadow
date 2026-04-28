[[design motivation]]

We carefully separate things into [[multi-stage processing]].  For example, tools like [[app component -- site page views]] are primarily aimed at helping to generate the [[local configuration]] ([[site page config]]) that creates the [[raw working graph]].  If you took the [[raw source]]s that were copied into the [[to delete - pre-publishing staging area]] and re-used the other artifacts stored in that staging area, you should be able to repeat the publishing.
:
This [[repeatability]] of individual steps allows the [[publisher]] to very carefully change things.  For example, we could change a [[publish option]] without needing to redo the [[constrained graph expansion]] on a potentially changed set of [[raw source]]s.  There's less change to manage, which directly addresses the [[sensitivity to accidentally publishing]]
......
Related to [[design motivation -- easy automation]] and [[design motivation -- great change management]].