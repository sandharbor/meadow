```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks: []
      inlinks:
        - linkPath: /t011 - special links.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: ../t011 - special links.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t011 - special links.html
              embeddedLinks:
                - linkName: table test row 1 column 3
                  linkRelativePath: t011 --- table test row 1 column 3.html
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
