```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t011 - special links.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: ../t011 - special links.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t011 - special links.html
                embeddedLinks:
                  - linkName: table test row 2 column 3
                    linkRelativePath: t011 --- table test row 2 column 3.html
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
