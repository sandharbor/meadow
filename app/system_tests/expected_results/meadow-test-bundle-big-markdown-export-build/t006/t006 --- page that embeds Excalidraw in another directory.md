This should show an Excalidraw drawing that says "Simple Textbox".

It is in a sibling directory and the path is implicit, not explicit.

_link not tracked_

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t006 - second directory/embedded in page in other t006 directory.excalidraw
            isInGraph: true
        inlinks:
          - linkPath: /t006 - embedded media.md
            isInGraph: true
          - linkPath: /t006/t006 --- meadow-flower.svg
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: ../t006 - embedded media.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t006 - embedded media.html
                embeddedLinks: []
          - relativeLinkPath: t006 --- meadow-flower.svg
            backlinkContexts: []
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
