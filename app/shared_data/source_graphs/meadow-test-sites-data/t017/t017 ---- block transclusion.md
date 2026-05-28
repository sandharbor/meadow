### Block Transclusion Test

This page tests block transclusion. Only the specific block with the key-insight identifier should be transcluded:

![[t017 ---- block source#^key-insight]]

The transclusion should appear above this line.

Here's another block transclusion with a different identifier:

![[t017 ---- block source#^f4c4d5]]

This second transclusion should also appear above this line.

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t017/t017 ---- block source.md
            isInGraph: true
        inlinks:
          - linkPath: /t017 - transclusion.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t017 ---- block source.html
          - relativeLinkPath: t017 ---- block source.html
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
