### Introduction

This is the introduction section. It should not be transcluded.

This section has some content that is distinct from the other sections.

### Details

This is the Details section. This section should be transcluded.

It contains specific information that we want to embed in another document.

### Conclusion

This is the conclusion section. It should also not be transcluded.

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t017/t017 ---- section transclusion.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t017 ---- section transclusion.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t017 ---- section transclusion.html
                embeddedLinks:
                  - linkName: ⤢
                    linkRelativePath: t017 ---- section source.html
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
