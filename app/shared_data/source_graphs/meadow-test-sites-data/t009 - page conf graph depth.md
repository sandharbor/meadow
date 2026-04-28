[[t009 ---- page conf graph depth 2]] (should say "link not tracked", but actually it _is_ tracked, it just isn't in the graph because the graph depth for this site page is set to 0 as an override)

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t009 ---- page conf graph depth 2.md
          isInGraph: false
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
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