[[t011 ---- page name with special characters -- before dot . and after dot]]

[[t011 ---- page name with special characters -- single quote ' in name]]

[[test.io which looks like a filename suffix]]

### Links in a table with escaped aliases

First, before we get into the table, let's just do one _outside_ the table:

[[t011/t011 --- pointed to by an escaped alias outside a table\|link with an escaped alias works outside a table]]

| Column 1 | Description Column | Column 3 |
|----------|--------------------|----------|
| [[t011/t011 --- table test row 1 column 1\|table test row 1 column 1]] | This is a test of row 1 | [[t011/t011 --- table test row 1 column 3\|table test row 1 column 3]] |
| [[t011/t011 --- table test row 2 column 1\|table test row 2 column 1]] | This is a test of row 2 | [[t011/t011 --- table test row 2 column 3\|table test row 2 column 3]] |

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t011/t011 ---- page name with special characters -- before dot . and after dot.md
          isInGraph: true
        - linkPath: /t011/t011 ---- page name with special characters -- single quote ' in name.md
          isInGraph: true
        - linkPath: /t011/test.io which looks like a filename suffix.md
          isInGraph: true
        - linkPath: /t011/t011 --- pointed to by an escaped alias outside a table.md
          isInGraph: true
        - linkPath: /t011/t011 --- table test row 1 column 1.md
          isInGraph: true
        - linkPath: /t011/t011 --- table test row 1 column 3.md
          isInGraph: true
        - linkPath: /t011/t011 --- table test row 2 column 1.md
          isInGraph: true
        - linkPath: /t011/t011 --- table test row 2 column 3.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
        - linkPath: /t011/t011 ---- page name with special characters -- single quote ' in name.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t011/t011 ---- page name with special characters -- before dot . and after dot.html
        - relativeLinkPath: t011/t011 ---- page name with special characters -- single quote ' in name.html
        - relativeLinkPath: t011/test.io which looks like a filename suffix.html
        - relativeLinkPath: t011/t011 --- pointed to by an escaped alias outside a table.html
        - relativeLinkPath: t011/t011 --- table test row 1 column 1.html
        - relativeLinkPath: t011/t011 --- table test row 1 column 3.html
        - relativeLinkPath: t011/t011 --- table test row 2 column 1.html
        - relativeLinkPath: t011/t011 --- table test row 2 column 3.html
      footerSectionBacklinks:
        - relativeLinkPath: main page.html
          backlinkContexts:
            - seeInContextLinkRelativePath: main page.html
              embeddedLinks: []
        - relativeLinkPath: t011/t011 ---- page name with special characters -- single quote ' in name.html
          backlinkContexts:
            - seeInContextLinkRelativePath: t011/t011 ---- page name with special characters -- single quote ' in name.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
