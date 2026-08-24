This page uses the multiline question-mark SRS format.

#t022-srs/beta

What does [[t022 ---- alpha cards|the alpha page]] verify?
??
That `??` cards generate forward and reverse review prompts.


<!--MEADOW_SR_GUID:682dd677d64dc-->

What key ties a reader's card state to this prompt?
?
Its durable GUID.

That GUID is inserted back into the source markdown.
+++

<!--MEADOW_SR_GUID:cdcad6af0053b-->

The flag is {{c1::red}}, {{c1::white}}, and {{c2::blue}}.

<!--MEADOW_SR_GUID:7500eef2337bf-->

```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t022/t022 ---- alpha cards.md
            isInGraph: true
        inlinks:
          - linkPath: /t022 - spaced repetition.md
            isInGraph: true
          - linkPath: /t022/t022 ---- alpha cards.md
            isInGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks:
          - relativeLinkPath: ../_mw_gen/tagpages/tag--t022-srs--beta.html
          - relativeLinkPath: t022 ---- alpha cards.html
        footerSectionBacklinks:
          - relativeLinkPath: ../t022 - spaced repetition.html
            backlinkContexts:
              - seeInContextLinkRelativePath: ../t022 - spaced repetition.html
                embeddedLinks: []
  - bundle: meadow-test-bundle-small
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: null
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
```
