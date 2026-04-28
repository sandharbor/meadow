This page should only turn into SRS cards when the alpha tag is selected.

#t022-srs/alpha

What does [[t022 ---- beta cards|the beta page]] point back to?::The alpha page.
<!--SR:!2026-03-10,3,250-->

What nested tag matches this page?::The alpha nested tag.
<!--SR:!2026-03-11,4,250-->

Which separator creates a reverse card?:::Use the triple-colon form.
<!--SR:!2026-03-12,3,250-->

Brazilians speak ==Portuguese== and Argentinians speak ==Spanish==.
<!--SR:!2026-03-13,4,250-->

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t022/t022 ---- beta cards.md
          isInGraph: true
      inlinks:
        - linkPath: /t022 - spaced repetition.md
          isInGraph: true
        - linkPath: /t022/t022 ---- beta cards.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: ../x-tagpages/tag--t022-srs--alpha.html
        - relativeLinkPath: t022 ---- beta cards.html
      footerSectionBacklinks:
        - relativeLinkPath: ../t022 - spaced repetition.html
          backlinkContexts:
            - seeInContextLinkRelativePath: ../t022 - spaced repetition.html
              embeddedLinks: []
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
