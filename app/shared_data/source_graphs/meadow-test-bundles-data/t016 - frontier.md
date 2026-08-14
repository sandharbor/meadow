### Tests frontier pages

[[t016 ---- level 2]]

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t016 ---- level 2.md
            isInGraph: true
        inlinks:
          - linkPath: /main page.md
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
