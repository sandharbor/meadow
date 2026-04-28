[[t005 ---- has in link and points back to same page]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t005 ---- has in link and points back to same page.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
        - linkPath: /t005 ---- has in link and points back to same page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t005 ---- has in link and points back to same page.html
      footerSectionBacklinks:
        - relativeLinkPath: main page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: main page.html
              embeddedLinks: []
        - relativeLinkPath: t005 ---- has in link and points back to same page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t005 ---- has in link and points back to same page.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```