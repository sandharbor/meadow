Here we are with a link to a specific section: [[t003 ---- page with section to link to#Section 2]]

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t003 ---- page with section to link to.md
            isInGraph: true
        inlinks:
          - linkPath: /main page.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t003 ---- page with section to link to.html
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
