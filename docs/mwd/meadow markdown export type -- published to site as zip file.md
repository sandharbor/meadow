^ [[meadow markdown export type]] -- published to site as .zip file

---

**Changes from the original [[source graph]]'s markdown:**
* **SRS**
	* In [[meadow workflow -- SRS markdown to SRS interactive elements on the published site]] then [[the SRS modification to markdown removes the SR comments from the markdown]] which affects this markdown
* **Avoid sensitive stuff**
	* [[the markdown we publish should not have the page titles or content of untracked or blacklisted pages, or even tracked but orphaned site pages]]

**Things that should _not_ be changed from the original [[source graph]]'s markdown**
* no [[tag site page]] markdown files should be in the markdown.  Those are only needed for supporting [[html generation]] of tag-like pages, for navigation.
### Process verification

These two things are complex enough that we bias towards [[multi-stage processing]].  First, we export the resultant markdown to a [[site config content -- directory -- build slash markdown_export]], so that we can use it to do a [[git changes test against golden-set test]] in the system tests (and also to do quick manual inspections).  That directory gives a kind of [[dim - testing box color -- grey|grey box testing]] with just enough of the intermediate process state exposed to make it testable, so we can be confident that we're not [[sensitivity to accidentally publishing|accidentally publishing sensitive pages]].

After that, that directory's content is what is actually zipped up to make the final .zip that it adds to the [[site config content -- directory -- preview]].  That ought to make careful testing easier.  Again, the strong emphasis on clear verification here is because of the high [[sensitivity to accidentally publishing]].