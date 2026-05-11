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

_link not tracked_

_link not tracked_

| test embed in table                 |
| ----------------------------------- |
| _link not tracked_ |

## SVG

![[t006/t006 --- meadow-flower.svg]]

![[t006/t006 --- meadow-flower.svg|78]]

| test embed in table                       |
| ----------------------------------------- |
| ![[t006/t006 --- meadow-flower.svg\|100]] |

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
  - site: meadow-test-site-big
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
    htmlRenderedLinks:
      mainSectionLinks:
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower-petals-ani.gif
        - relativeLinkPath: t006/t006 --- meadow-flower.html
        - relativeLinkPath: t006/t006 --- meadow-flower.html
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
  - site: meadow-test-site-small
    isTracked: false
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: null
    htmlRenderedLinks:
      mainSectionLinks: []
      footerSectionBacklinks: []
```
