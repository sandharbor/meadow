Here we call the [[t002/extra nested/t002 ---- dup|dup page]] in the nested
`t002/extra nested/` location specifically, so it should point to the extra
nested one.

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t002/extra nested/t002 ---- dup.md
            isInGraph: true
        inlinks:
          - linkPath: /t002 - dup pages and images.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: ../t002 - dup pages and images.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t002 - dup pages and images.html
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
