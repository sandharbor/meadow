An object that represents a page in the [[site]]

It contains information such as:
* what the [[site page]]'s [[sonst/depth]] in the [[tracked working graph]] 
* what the [[path]] was to reach it
* whether the associated page is [[site page tracking state -- tracked]] or [[site page tracking state -- untracked]].  Basically, does it have [[site page config]] or not.
* In the conf, what the [[site page config -- outlinksDepth]] and [[site page config -- inlinksDepth]]
* The [[site page type]], for example [[to delete - site page type -- canonical]] (first time we saw it in the graph... with the [[shortest path]] ) or [[to delete - site page type -- reference]] with a longer path to the same page.  This is because [[one source page can be in multiple site pages]]
