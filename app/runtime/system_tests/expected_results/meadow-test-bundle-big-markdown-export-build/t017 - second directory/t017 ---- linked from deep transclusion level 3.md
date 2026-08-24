And this links to a page in the same directory [[t017 ---- linked from within this second directory]]

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t017 - second directory/t017 ---- linked from within this second directory.md
            isInGraph: true
        inlinks:
          - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t017 ---- linked from within this second directory.html
        footerSectionBacklinks:
          - relativeLinkPath: ../t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.html
                embeddedLinks: []
  - bundle: meadow-test-bundle-small
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: null
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
