Here we link to a png `t002 ---- dup 2` with no path from the `t002 - second directory`

Should get the one in the `t002` directory because it is the closest to the root.

![[t002 ---- dup 2.png|300]].

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
        - relativeLinkPath: ../t002/t002 ---- dup 2.png
      footerSectionBacklinks:
        - relativeLinkPath: ../t002 - dup pages and images.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t002 - dup pages and images.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```