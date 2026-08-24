This test begins in Markdown and crosses into a native HTML page.

[Open the first HTML page](./t026/t026 ---- first HTML page.html)

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t026/t026 ---- first HTML page.html
            isInGraph: true
        inlinks:
          - linkPath: /main page.md
            isInGraph: true
          - linkPath: /t026/t026 ---- first HTML page.html
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: t026/t026 ---- first HTML page.html
        footerSectionBacklinks:
          - relativeLinkPath: main page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: main page.html
                embeddedLinks: []
          - relativeLinkPath: t026/t026 ---- first HTML page.html
            backlinkContexts: []
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
