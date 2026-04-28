To do this, we need a type that represents non-empty lists. Fortunately, the existing `NonEmpty` type from `Data.List.NonEmpty` is exactly that. It has the following definition:
:
```haskell
data NonEmpty a = a :| [a]
```
......
The dots line above should not be included in the haskell code block

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks: []
      inlinks:
        - linkPath: /t020 - code blocks.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks:
        - relativeLinkPath: ../t020 - code blocks.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t020 - code blocks.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
