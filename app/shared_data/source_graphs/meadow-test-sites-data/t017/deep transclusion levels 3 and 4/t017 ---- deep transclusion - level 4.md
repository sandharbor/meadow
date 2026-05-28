### Deep Transclusion - Level 4

This is level 4, and it transcludes level 5:

![[t017 ---- deep transclusion - level 5]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t017/t017 ---- deep transclusion - level 5.md
            isInGraph: false
        inlinks:
          - linkPath: /t017/deep transclusion levels 3 and 4/t017 ---- deep transclusion - level 3.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t017 ---- deep transclusion - level 3.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t017 ---- deep transclusion - level 3.html
                embeddedLinks:
                  - linkName: ⤢
                    linkRelativePath: t017 ---- deep transclusion - level 4.html
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
