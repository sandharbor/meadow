[[t005 ---- has in link and points back to same page]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
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
    generation:
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
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: null
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
