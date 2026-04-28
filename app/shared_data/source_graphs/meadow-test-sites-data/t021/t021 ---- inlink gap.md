```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks: []
      inlinks:
        - linkPath: /t021 - link gaps.md
          isInGraph: true
        - linkPath: /t021/t021 ---- inlink gap pages/t021 ---- inlink source 1.md
          isInGraph: false
        - linkPath: /t021/t021 ---- inlink gap pages/t021 ---- inlink source 2.md
          isInGraph: false
        - linkPath: /t021/t021 ---- inlink gap pages/t021 ---- inlink source 3.md
          isInGraph: false
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: ../t021 - link gaps.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t021 - link gaps.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
