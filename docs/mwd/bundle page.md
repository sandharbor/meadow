An object that represents a page in the [[bundle]]

It contains information such as:
* what the [[bundle page]]'s [[sonst/depth]] in the [[tracked working graph]] 
* what the [[path]] was to reach it
* whether the associated page is [[bundle page tracking state -- tracked]] or [[bundle page tracking state -- untracked]].  Basically, does it have [[bundle page config]] or not.
* In the config, what the [[bundle page config -- outlinksDepth]] and [[bundle page config -- inlinksDepth]]
* The [[bundle page type]], for example [[to delete - bundle page type -- canonical]] (first time we saw it in the graph... with the [[shortest path]] ) or [[to delete - bundle page type -- reference]] with a longer path to the same page.  This is because [[one source page can be in multiple bundle pages]]
