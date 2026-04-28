Here we link to a png `t002 ---- dup 2` with no path.

Since this file is in the root, I suspect that it should find the t002 ---- dup 2 that is closest to the root, which would be the one in the `t002` directory.

![[t002/t002 ---- dup 2.png]].

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t002/t002 ---- dup 2.png
          isInGraph: true
      inlinks:
        - linkPath: /t002 - dup pages and images.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t002/t002 ---- dup 2.png
      footerSectionBacklinks:
        - relativeLinkPath: t002 - dup pages and images.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t002 - dup pages and images.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```