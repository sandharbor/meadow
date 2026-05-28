### Full Page Source Content

This is the content that should be transcluded into another page.

It has multiple paragraphs to make the transclusion more visible when it's implemented.

This content will be embedded in its entirety when transcluded using the full page syntax.

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t017/t017 ---- full page transclusion.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t017 ---- full page transclusion.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t017 ---- full page transclusion.html
                embeddedLinks:
                  - linkName: ⤢
                    linkRelativePath: t017 ---- full page source.html
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
