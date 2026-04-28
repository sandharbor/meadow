### Block Source Content

This document contains multiple blocks with identifiers.

Here is the first block with some general information that should not be transcluded.

This is a key insight that should be transcluded. ^key-insight

Here is another block that comes after the key insight.

This block has a specific identifier for testing. ^f4c4d5

And this is the final paragraph without a block identifier.

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks: []
      inlinks:
        - linkPath: /t017/t017 ---- block transclusion.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: t017 ---- block transclusion.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t017 ---- block transclusion.html
              embeddedLinks:
                - linkName: "⤢"
                  linkRelativePath: t017 ---- block source.html
            - seeInContextLinkRelativePath: t017 ---- block transclusion.html
              embeddedLinks:
                - linkName: "⤢"
                  linkRelativePath: t017 ---- block source.html
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
