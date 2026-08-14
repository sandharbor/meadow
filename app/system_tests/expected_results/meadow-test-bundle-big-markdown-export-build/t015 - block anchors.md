### The identical blocks pointing to page 1

The following identical blocks test the functionality that differentiates the
block anchors for blocks with duplicate content.

Here is a block that is identical to another block in this page.
...
[[t015 ---- page 1 with backlinks to block anchors]]

Here is a block that is identical to another block in this page.
...
[[t015 ---- page 1 with backlinks to block anchors]]

### A different block pointing to page 1

[[t015 ---- page 1 with backlinks to block anchors]]
is a different block that points to the first page.


### A block pointing to page 2

Here's a block that points to the second page with this link [[t015 ---- page 2 with backlinks to block anchors]].  It's good.

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t015 ---- page 1 with backlinks to block anchors.md
            isInGraph: true
          - linkPath: /t015 ---- page 2 with backlinks to block anchors.md
            isInGraph: true
        inlinks:
          - linkPath: /main page.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t015 ---- page 1 with backlinks to block anchors.html
          - relativeLinkPath: t015 ---- page 1 with backlinks to block anchors.html
          - relativeLinkPath: t015 ---- page 1 with backlinks to block anchors.html
          - relativeLinkPath: t015 ---- page 2 with backlinks to block anchors.html
        footerSectionBacklinks:
          - relativeLinkPath: main page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: main page.html
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
