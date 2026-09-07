### Section 1

Here's some stuff

### Section 2

This section now contains a revised explanation supplied as a complete source page.

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks: []
        inlinks:
          - linkPath: /t003 - link to section.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks:
          - relativeLinkPath: t003 - link to section.html
            backlinkContexts:
              - seeInContextLinkRelativePath: t003 - link to section.html
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
