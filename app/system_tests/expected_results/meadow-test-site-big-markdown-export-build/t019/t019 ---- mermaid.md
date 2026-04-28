This tests a minimal mermaid fenced code block.

```mermaid
graph TD
  A-->B
```

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks: []
      inlinks:
        - linkPath: /t019 - embeds.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: ../t019 - embeds.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t019 - embeds.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
