This page remains outside both selected folder configurations, but Alpha note links to it.
It links one step farther to [[Beyond outside]].

```yaml
pagespecs:
  - bundle: single-folder-bundle
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
        mainSectionLinks:
          - relativeLinkPath: Beyond outside.html
        footerSectionBacklinks:
          - relativeLinkPath: ../Alpha/Alpha note.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../Alpha/Alpha note.html
                embeddedLinks:
                  - linkName: Nested note
                    linkRelativePath: ../Alpha/Nested/Nested note.html
  - bundle: ordered-folders
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
        mainSectionLinks:
          - relativeLinkPath: Beyond outside.html
        footerSectionBacklinks:
          - relativeLinkPath: ../Alpha/Alpha note.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../Alpha/Alpha note.html
                embeddedLinks:
                  - linkName: Nested note
                    linkRelativePath: ../Alpha/Nested/Nested note.html
```
