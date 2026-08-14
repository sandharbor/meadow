[[t010 ---- same depth 2 - 1 out 2 in]]

[[t010 ---- same depth 3 - 1 out 3 in]]

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t010/t010 ---- same depth 2 - 1 out 2 in.md
            isInGraph: true
          - linkPath: /t010/t010 ---- same depth 3 - 1 out 3 in.md
            isInGraph: true
        inlinks:
          - linkPath: /t010 - linking in same depth.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t010 ---- same depth 2 - 1 out 2 in.html
          - relativeLinkPath: t010 ---- same depth 3 - 1 out 3 in.html
        footerSectionBacklinks:
          - relativeLinkPath: ../t010 - linking in same depth.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t010 - linking in same depth.html
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
