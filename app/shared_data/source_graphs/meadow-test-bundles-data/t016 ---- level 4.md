### Level 4

By default this level 5 page will not show up.

[[t016 ---- level 5]]

By default this image will show up if `allowImagesToExtendToFrontier` is enabled.

[[t016 ---- level 5 - frontier image.png]]

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t016 ---- level 5.md
            isInGraph: false
          - linkPath: /t016 ---- level 5 - frontier image.png
            isInGraph: true
        inlinks:
          - linkPath: /t016 ---- level 3.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
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
