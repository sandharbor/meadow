### Full Page Transclusion Test

This page tests full page transclusion. The content below should transclude the entire source page:

![[t017 ---- full page source]]

The transclusion should appear above this line.

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t017/t017 ---- full page source.md
            isInGraph: true
        inlinks:
          - linkPath: /t017 - transclusion.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t017 ---- full page source.html
        footerSectionBacklinks:
          - relativeLinkPath: ../t017 - transclusion.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t017 - transclusion.html
                embeddedLinks: []
  - site: meadow-test-site-small
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: null
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
