This test covers standard markdown link syntax.

Link to a page in subdirectory: [Linked Page](./t024/t024 ---- linked page.md)

Link to a deeper page: [Deep Page](./t024/deeper/t024 ---- deep page.md)

Link to inlink-only page: [Inlink Only](./t024/t024 ---- inlink only.md)

Link to an image: [Test Image](./t024/t024 ---- test image.png)

Link outside the source graph: [Outside](../../../somewhere/else.md)

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t024/t024 ---- linked page.md
            isInGraph: true
          - linkPath: /t024/deeper/t024 ---- deep page.md
            isInGraph: true
          - linkPath: /t024/t024 ---- inlink only.md
            isInGraph: true
          - linkPath: /t024/t024 ---- test image.png
            isInGraph: true
        inlinks:
          - linkPath: /main page.md
            isInGraph: true
          - linkPath: /t024/t024 ---- linked page.md
            isInGraph: true
          - linkPath: /t024/deeper/t024 ---- deep page.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t024/t024 ---- linked page.html
          - relativeLinkPath: t024/deeper/t024 ---- deep page.html
          - relativeLinkPath: t024/t024 ---- inlink only.html
          - relativeLinkPath: t024/t024 ---- test image.png
        footerSectionBacklinks:
          - relativeLinkPath: main page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: main page.html
                embeddedLinks: []
          - relativeLinkPath: t024/deeper/t024 ---- deep page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t024/deeper/t024 ---- deep page.html
                embeddedLinks: []
          - relativeLinkPath: t024/t024 ---- linked page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t024/t024 ---- linked page.html
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
