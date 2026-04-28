### Section Transclusion Test

This page tests section transclusion. Only the "Details" section should be transcluded:

![[t017 ---- section source#Details]]

The transclusion should appear above this line.

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t017/t017 ---- section source.md
          isInGraph: true
      inlinks:
        - linkPath: /t017 - transclusion.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t017 ---- section source.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t017 - transclusion.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t017 - transclusion.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
