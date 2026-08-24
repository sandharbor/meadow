This page is linked to from the root via markdown link syntax.

Link back up: [Main markdown links page](../t024 - markdown links.md)

Link to sibling: [Deep Page](./deeper/t024 ---- deep page.md)

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t024 - markdown links.md
            isInGraph: true
          - linkPath: /t024/deeper/t024 ---- deep page.md
            isInGraph: true
        inlinks:
          - linkPath: /t024 - markdown links.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: ../t024 - markdown links.html
          - relativeLinkPath: deeper/t024 ---- deep page.html
        footerSectionBacklinks:
          - relativeLinkPath: ../t024 - markdown links.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t024 - markdown links.html
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
