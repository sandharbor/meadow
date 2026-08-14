Here we link to a png with the same name as the dup page, but nested under the `t002` folder.

Note that _this_ page, itself, is in the `t002` folder, too.

![[t002/t002 ---- dup.png|300]].

Same folder as this file:

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t002/t002 ---- dup.png
            isInGraph: true
        inlinks:
          - linkPath: /t002 - dup pages and images.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t002 ---- dup.png
        footerSectionBacklinks:
          - relativeLinkPath: ../t002 - dup pages and images.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t002 - dup pages and images.html
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
