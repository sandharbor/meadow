Here we link to a png in the root with the same name as the dup page

![[t002 ---- dup.png|300]].


```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t002 ---- dup.png
          isInGraph: true
      inlinks:
        - linkPath: /t002 - dup pages and images.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../t002 ---- dup.png
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