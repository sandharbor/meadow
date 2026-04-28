### Deep Transclusion - Level 2

This tests deep transclusion that may exceed graph depth limits.

This is level 2, and it transcludes level 3 (and that, in-turn, transcludes other pages that are deeper).
It eventually hits the remaining depth limit and stops including any deeper pages.

![[t017 ---- deep transclusion - level 3]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.md
          isInGraph: true
      inlinks:
        - linkPath: /t017 - transclusion.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.html
        - relativeLinkPath: ../t017 - second directory/t017 ---- linked from deep transclusion level 3.html
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
