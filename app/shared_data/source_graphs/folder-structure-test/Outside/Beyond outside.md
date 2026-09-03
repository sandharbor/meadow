This page is linked from Outside note at the second configured outlink depth.
Its links extend one step farther, to contrast an ordinary depth-three frontier
page with a frontier image extension.

[[Frontier image.png]]

[[Frontier page]]

```yaml
pagespecs:
  - bundle: single-folder-bundle
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Outside/Frontier image.png
            isInGraph: true
          - linkPath: /Outside/Frontier page.md
            isInGraph: false
        inlinks:
          - linkPath: /Outside/Outside note.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: Frontier image.png
        footerSectionBacklinks:
          - relativeLinkPath: Outside note.html
            backlinkContexts:
              - seeInContextLinkRelativePath: Outside note.html
                embeddedLinks: []
  - bundle: ordered-folders
    curation:
      isTracked: false
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /Outside/Frontier image.png
            isInGraph: true
          - linkPath: /Outside/Frontier page.md
            isInGraph: false
        inlinks:
          - linkPath: /Outside/Outside note.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: Frontier image.png
        footerSectionBacklinks:
          - relativeLinkPath: Outside note.html
            backlinkContexts:
              - seeInContextLinkRelativePath: Outside note.html
                embeddedLinks: []
```
