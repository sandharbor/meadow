This tests a minimal mermaid fenced code block.

```mermaid
graph TD
  A-->B
```

```yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t019 - embeds.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: ../t019 - embeds.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t019 - embeds.html
                embeddedLinks: []
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
