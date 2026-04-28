### Deep Transclusion - Level 3

This page is transcluded by level 2.   This page is in a further-nested directory.

It links to a page in another directory [[t017 ---- linked from deep transclusion level 3]] to test that the link resolution works from within a transclusion.

It also transcludes level 4, which is in this same directory

![[t017 ---- deep transclusion - level 4]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t017 - second directory/t017 ---- linked from deep transclusion level 3.md
          isInGraph: true
        - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 4.md
          isInGraph: true
      inlinks:
        - linkPath: /t017/t017 ---- deep transclusion.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../../t017 - second directory/t017 ---- linked from deep transclusion level 3.html
        - relativeLinkPath: t017 ---- deep transclusion - level 4.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t017 ---- deep transclusion.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t017 ---- deep transclusion.html
              embeddedLinks:
                - linkName: "⤢"
                  linkRelativePath: t017 ---- deep transclusion - level 3.html
                - linkName: t017 ---- linked from deep transclusion level 3
                  linkRelativePath: ../../t017 - second directory/t017 ---- linked from deep transclusion level 3.html
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
