This should show an Excalidraw drawing that says "Simple Textbox".

It is in a sibling directory and the path is implicit, not explicit.

![[embedded in page in other t006 directory|500]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t006 - second directory/embedded in page in other t006 directory.excalidraw
          isInGraph: true
      inlinks:
        - linkPath: /t006 - embedded media.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../t006 - second directory/embedded in page in other t006 directory.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t006 - embedded media.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t006 - embedded media.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
