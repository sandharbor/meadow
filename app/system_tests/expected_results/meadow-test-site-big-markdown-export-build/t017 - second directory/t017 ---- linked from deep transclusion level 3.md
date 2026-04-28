And this links to a page in the same directory [[t017 ---- linked from within this second directory]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t017 - second directory/t017 ---- linked from within this second directory.md
          isInGraph: true
      inlinks:
        - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../t017 - second directory/t017 ---- linked from within this second directory.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```