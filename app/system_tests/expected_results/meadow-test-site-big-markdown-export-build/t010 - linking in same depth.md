[[t010 ---- same depth 1 - 2 out 0 in]]

[[t010 ---- same depth 2 - 1 out 2 in]]

[[t010 ---- same depth 3 - 1 out 3 in]]

[[t010 ---- same depth 4 - no connection]]

[[t010 ---- same depth 5 - 1 out 0 in]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t010/t010 ---- same depth 1 - 2 out 0 in.md
          isInGraph: true
        - linkPath: /t010/t010 ---- same depth 2 - 1 out 2 in.md
          isInGraph: true
        - linkPath: /t010/t010 ---- same depth 3 - 1 out 3 in.md
          isInGraph: true
        - linkPath: /t010/t010 ---- same depth 4 - no connection.md
          isInGraph: true
        - linkPath: /t010/t010 ---- same depth 5 - 1 out 0 in.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t010/t010 ---- same depth 1 - 2 out 0 in.html
        - relativeLinkPath: t010/t010 ---- same depth 2 - 1 out 2 in.html
        - relativeLinkPath: t010/t010 ---- same depth 3 - 1 out 3 in.html
        - relativeLinkPath: t010/t010 ---- same depth 4 - no connection.html
        - relativeLinkPath: t010/t010 ---- same depth 5 - 1 out 0 in.html
      footerSectionBacklinks:
        - relativeLinkPath: main page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: main page.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```