```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t017 - second directory/t017 ---- linked from deep transclusion level 3.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t017 ---- linked from deep transclusion level 3.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t017 ---- linked from deep transclusion level 3.html
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
