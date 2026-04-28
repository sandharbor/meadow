### Level 4

By default this level 5 page will not show up.

[[t016 ---- level 5]]

By default this image will show up if `allowImagesToExtendToFrontier` is enabled.

[[t016 ---- level 5 - frontier image.png]]

```yaml
pagespecs:
  - site: meadow-test-site-big
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
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```