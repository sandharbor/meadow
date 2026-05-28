### Deep Transclusion - Level 5

This is level 5, and it transcludes level 6:

![[t017 ---- deep transclusion - level 6]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: 1
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
  - site: meadow-test-site-small
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: null
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
