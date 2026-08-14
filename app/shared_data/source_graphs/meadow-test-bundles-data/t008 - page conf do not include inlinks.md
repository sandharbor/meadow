```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /main page.md
            isInGraph: true
          - linkPath: /t008 ---- has in link to page conf test.md
            isInGraph: false
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: main page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: main page.html
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
