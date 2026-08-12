# Outside note

This page remains outside both selected folder configurations, but Alpha note links to it.
It links one step farther to [[Beyond outside]].

```yaml
pagespecs:
  - site: single-folder-site
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Outside/Beyond outside.md
            isInGraph: true
        inlinks:
          - linkPath: /Alpha/Alpha note.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
  - site: ordered-folders
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Outside/Beyond outside.md
            isInGraph: true
        inlinks:
          - linkPath: /Alpha/Alpha note.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
