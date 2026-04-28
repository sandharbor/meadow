[[t010 ---- same depth 3 - 1 out 3 in]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t010/t010 ---- same depth 3 - 1 out 3 in.md
          isInGraph: true
      inlinks:
        - linkPath: /t010 - linking in same depth.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t010 ---- same depth 3 - 1 out 3 in.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t010 - linking in same depth.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t010 - linking in same depth.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```