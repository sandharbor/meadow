This page should NOT create tag links from code blocks or inline code.

Inline code: `#tag-inside-code-ticks`

```txt
#tag-inside-fenced-code-block
some other text
```

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t020 - code blocks.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: ../t020 - code blocks.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t020 - code blocks.html
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
