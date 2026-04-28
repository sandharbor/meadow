Code block tests live in the `t020/` folder.

[[t020/t020 ---- tags in code blocks should not become tag links]]

[[t020/t020 ---- page links in code blocks should not become links]]

[[t020/t020 ---- code blocks should end properly]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t020/t020 ---- tags in code blocks should not become tag links.md
          isInGraph: true
        - linkPath: /t020/t020 ---- page links in code blocks should not become links.md
          isInGraph: true
        - linkPath: /t020/t020 ---- code blocks should end properly.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t020/t020 ---- tags in code blocks should not become tag links.html
        - relativeLinkPath: t020/t020 ---- page links in code blocks should not become links.html
        - relativeLinkPath: t020/t020 ---- code blocks should end properly.html
      footerSectionBacklinks:
        - relativeLinkPath: main page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: main page.html
              embeddedLinks: []
        - relativeLinkPath: t020/t020 ---- page links in code blocks should not become links.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t020/t020 ---- page links in code blocks should not become links.html
              embeddedLinks: []
            - seeInContextLinkRelativePath: t020/t020 ---- page links in code blocks should not become links.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
