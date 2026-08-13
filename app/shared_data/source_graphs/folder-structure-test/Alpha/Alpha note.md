This page links to [[Nested note]] inside the selected structure and [[Outside note]] beyond it.

```yaml
pagespecs:
  - site: single-folder-site
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Alpha/Nested/Nested note.md
            isInGraph: true
          - linkPath: /Outside/Outside note.md
            isInGraph: true
        inlinks: []
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: Nested/Nested note.html
          - relativeLinkPath: ../Outside/Outside note.html
        footerSectionBacklinks: []
  - site: ordered-folders
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Alpha/Nested/Nested note.md
            isInGraph: true
          - linkPath: /Outside/Outside note.md
            isInGraph: true
        inlinks: []
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: Nested/Nested note.html
          - relativeLinkPath: ../Outside/Outside note.html
        footerSectionBacklinks: []
```
