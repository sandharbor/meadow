## PNG

![[t006/t006 --- meadow.png]]

![[t006/t006 --- meadow.png|100]]

| test |
|------|
| ![[t006/t006 --- meadow.png\|100]] |

## Animated GIF

![[t006/t006 --- meadow-flower-petals-ani.gif]]

![[t006/t006 --- meadow-flower-petals-ani.gif|100]]

| test |
|------|
| ![[t006/t006 --- meadow-flower-petals-ani.gif\|100]] |

## Too Big PNG

![[t006/t006 --- too-big.png]]

![[t006/t006 --- too-big.png|100]]

| test |
|------|
| ![[t006/t006 --- too-big.png\|100]] |

## SVG

![[t006/t006 --- meadow-flower.svg]]

![[t006/t006 --- meadow-flower.svg|100]]

| test |
|------|
| ![[t006/t006 --- meadow-flower.svg\|100]] |

```yaml
pagespecs:
  - site: meadow-test-site-big
    isTracked: true
    isInWorkingGraph: true
    links:
      outlinks:
        - linkPath: /t006/t006 --- meadow-flower-petals-ani.gif
          isInGraph: true
        - linkPath: /t006/t006 --- meadow-flower.svg
          isInGraph: true
        - linkPath: /t006/t006 --- meadow.png
          isInGraph: true
        - linkPath: /t006/t006 --- too-big.png
          isInGraph: true
      inlinks:
        - linkPath: /main page.md
          isInGraph: true
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower.svg
        - relativeLinkPath: t006/t006 --- meadow-flower.svg
        - relativeLinkPath: t006/t006 --- meadow-flower.svg
        - relativeLinkPath: t006/t006 --- meadow.png
        - relativeLinkPath: t006/t006 --- meadow.png
        - relativeLinkPath: t006/t006 --- meadow.png
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
