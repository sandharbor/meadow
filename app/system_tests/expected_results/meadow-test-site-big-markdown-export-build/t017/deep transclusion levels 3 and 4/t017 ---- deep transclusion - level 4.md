### Deep Transclusion - Level 4

This is level 4, and it transcludes level 5:

_link not tracked_

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t017/t017 ---- deep transclusion - level 5.md
          isInGraph: false
      inlinks:
        - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: t017 ---- deep transclusion - level 3.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t017 ---- deep transclusion - level 3.html
              embeddedLinks:
                - linkName: "⤢"
                  linkRelativePath: t017 ---- deep transclusion - level 4.html
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
