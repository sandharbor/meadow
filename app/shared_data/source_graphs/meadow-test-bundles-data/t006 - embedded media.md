## PNG

![[t006/t006 --- meadow.png]]

![[t006/t006 --- meadow.png|100]]

| test embed in table                |
| ---------------------------------- |
| ![[t006/t006 --- meadow.png\|100]] |

## Animated GIF

![[t006/t006 --- meadow-flower-petals-ani.gif]]

![[t006/t006 --- meadow-flower-petals-ani.gif|100]]

| test embed in table                                  |
| ---------------------------------------------------- |
| ![[t006/t006 --- meadow-flower-petals-ani.gif\|100]] |

## Too Big PNG

![[t006/t006 --- too-big.png]]

![[t006/t006 --- too-big.png|100]]

| test embed in table                 |
| ----------------------------------- |
| ![[t006/t006 --- too-big.png\|100]] |

## SVG

![[t006/t006 --- meadow-flower.svg]]

![[t006/t006 --- meadow-flower.svg|78]]

| test embed in table                       |
| ----------------------------------------- |
| ![[t006/t006 --- meadow-flower.svg\|100]] |

with a **container directive** that makes the SVG's links interactive

:::meadow
![[t006/t006 --- meadow-flower.svg|300]]

enableEmbeddedLinks: true
enableFullscreenButton: true
enableOpenDedicatedPage: false
:::

## Excalidraw

![[t006 --- meadow-flower.excalidraw]]

with a **container directive** that causes the links to be functional

:::meadow
![[t006 --- meadow-flower.excalidraw|300]]

enableEmbeddedLinks: true
enableFullscreenButton: true
enableOpenDedicatedPage: false
:::

| test embed in table                         |
| ------------------------------------------- |
| ![[t006 --- meadow-flower.excalidraw\|100]] |
[[t006 --- page that embeds Excalidraw in another directory]]


```yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      links:
        outlinks:
          - linkPath: /t006/t006 --- page that embeds Excalidraw in another directory.md
            isInGraph: true
          - linkPath: /t006/t006 --- meadow-flower-petals-ani.gif
            isInGraph: true
          - linkPath: /t006/t006 --- meadow-flower.excalidraw
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
          - linkPath: /t006/t006 --- meadow-flower.svg
            isInGraph: true
    generation:
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
          - relativeLinkPath: t006/t006 --- page that embeds Excalidraw in another directory.html
        footerSectionBacklinks:
          - relativeLinkPath: main page.html
            backlinkContexts:
              - seeInContextLinkRelativePath: main page.html
                embeddedLinks: []
          - relativeLinkPath: t006/t006 --- meadow-flower.svg
            backlinkContexts: []
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
