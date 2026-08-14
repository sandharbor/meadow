Here we link to a png `t002 ---- dup 2` with no path from the extra nested folder

Should get the png in the same directory, which is the  `t002/extra nested` directory.
![[t002 ---- dup 2.png|300]].

Same folder as this file

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t002/extra nested/t002 ---- dup 2.png
            isInGraph: true
        inlinks:
          - linkPath: /t002 - dup pages and images.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t002 ---- dup 2.png
        footerSectionBacklinks:
          - relativeLinkPath: ../../t002 - dup pages and images.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../../t002 - dup pages and images.html
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
