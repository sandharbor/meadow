This page tests relative path resolution from a deeper directory.

Link two levels up: [Main Page](../../t024 - markdown links.md)

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t024 - markdown links.md
          isInGraph: true
      inlinks:
        - linkPath: /t024 - markdown links.md
          isInGraph: true
        - linkPath: /t024/t024 ---- linked page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../../t024 - markdown links.html
      footerSectionBacklinks:
        - relativeLinkPath: ../../t024 - markdown links.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../../t024 - markdown links.html
              embeddedLinks: []
        - relativeLinkPath: ../t024 ---- linked page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t024 ---- linked page.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
