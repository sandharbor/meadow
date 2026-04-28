Embed tests live in the `t019/` folder.

[[t019/t019 ---- mermaid]]

[[t019/t019 ---- typescript]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t019/t019 ---- mermaid.md
          isInGraph: true
        - linkPath: /t019/t019 ---- typescript.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t019/t019 ---- mermaid.html
        - relativeLinkPath: t019/t019 ---- typescript.html
      footerSectionBacklinks:
        - relativeLinkPath: main page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: main page.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
