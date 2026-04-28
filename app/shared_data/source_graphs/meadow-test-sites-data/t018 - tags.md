Tag tests live in the `t018/` folder.

[[t018/t018 ---- unique tags]]

[[t018/t018 ---- shared tags page 1]]

[[t018/t018 ---- shared tags page 2]]

[[t018/t018 ---- code blocks and inline code should not create tag links]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t018/t018 ---- unique tags.md
          isInGraph: true
        - linkPath: /t018/t018 ---- shared tags page 1.md
          isInGraph: true
        - linkPath: /t018/t018 ---- shared tags page 2.md
          isInGraph: true
        - linkPath: /t018/t018 ---- code blocks and inline code should not create tag links.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t018/t018 ---- unique tags.html
        - relativeLinkPath: t018/t018 ---- shared tags page 1.html
        - relativeLinkPath: t018/t018 ---- shared tags page 2.html
        - relativeLinkPath: t018/t018 ---- code blocks and inline code should not create tag links.html
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
