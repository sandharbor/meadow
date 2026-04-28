Note that all the dups are called `t002 ---- dup`.  They are either `.md` files or `.png` files.

The folders these tests are in doesn't really matter, but I thought
it would be a good idea to have them in different folders.

[[t002 ---- points to root dup]]

[[t002 ---- points to nested dup]]

[[t002 ---- points to extra nested dup]]

### test of first image dup

The title of this image is the same as the duplicate pages... `t002 ---- dup`.  It is also in the same directories as those duplicate pages.  The `file_type` is png, though.

[[t002 ---- points to root png dup]]

[[t002 ---- points to nested png dup]]

### test of second image dup

This image is called `t002 ---- dup 2`.  It is not named the same as any pages.

The purpose of this test is to ensure that duplicate image paths are correctly resolved even when there is no image directly at the root.  So that `t002 ---- dup 2` image is only in the `t002` directory and the `t002/extra nested` directory, not at the root.  But we target them from a lot of different places to test what happens.

[[t002 ---- points to png dup 2 with no path from root]]

[[t002 ---- points to png dup 2 with no path from t002]]

[[t002 ---- points to png dup 2 with no path from extra nested]]

[[t002 ---- points to png dup 2 with no path from second directory]]

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t002/t002 ---- points to root dup.md
          isInGraph: true
        - linkPath: /t002/t002 ---- points to nested dup.md
          isInGraph: true
        - linkPath: /t002/t002 ---- points to extra nested dup.md
          isInGraph: true
        - linkPath: /t002/t002 ---- points to root png dup.md
          isInGraph: true
        - linkPath: /t002/t002 ---- points to nested png dup.md
          isInGraph: true
        - linkPath: /t002 ---- points to png dup 2 with no path from root.md
          isInGraph: true
        - linkPath: /t002/t002 ---- points to png dup 2 with no path from t002.md
          isInGraph: true
        - linkPath: /t002/extra nested/t002 ---- points to png dup 2 with no path from extra nested.md
          isInGraph: true
        - linkPath: /t002 - second directory/t002 ---- points to png dup 2 with no path from second directory.md
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t002/t002 ---- points to root dup.html
        - relativeLinkPath: t002/t002 ---- points to nested dup.html
        - relativeLinkPath: t002/t002 ---- points to extra nested dup.html
        - relativeLinkPath: t002/t002 ---- points to root png dup.html
        - relativeLinkPath: t002/t002 ---- points to nested png dup.html
        - relativeLinkPath: t002 ---- points to png dup 2 with no path from root.html
        - relativeLinkPath: t002/t002 ---- points to png dup 2 with no path from t002.html
        - relativeLinkPath: t002/extra nested/t002 ---- points to png dup 2 with no path from extra nested.html
        - relativeLinkPath: t002 - second directory/t002 ---- points to png dup 2 with no path from second directory.html
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
