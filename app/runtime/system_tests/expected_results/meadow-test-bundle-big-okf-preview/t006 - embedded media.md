---
title: t006 - embedded media
type: Knowledge Page
---
## PNG

![t006 --- meadow.png](/t006/t006%20---%20meadow.png)

![t006 --- meadow.png](/t006/t006%20---%20meadow.png)

| test embed in table                |
| ---------------------------------- |
| ![t006 --- meadow.png](/t006/t006%20---%20meadow.png) |

## Image Sizes

Obsidian sizes an image with a width (`|100`, above) or a width and height (`|100x50`, here):

![t006 --- meadow.png](/t006/t006%20---%20meadow.png)

In Markdown image syntax the size goes where the alt text goes, optionally after the alt text and a `|`. A local image, 80 pixels wide, with alt text:

![A meadow|80](t006/t006%20---%20meadow.png)

An external image, 250 pixels wide, with no alt text:

![250](https://example.com/meadow-external.png)

## Animated GIF

![t006 --- meadow-flower-petals-ani.gif](/t006/t006%20---%20meadow-flower-petals-ani.gif)

![t006 --- meadow-flower-petals-ani.gif](/t006/t006%20---%20meadow-flower-petals-ani.gif)

| test embed in table                                  |
| ---------------------------------------------------- |
| ![t006 --- meadow-flower-petals-ani.gif](/t006/t006%20---%20meadow-flower-petals-ani.gif) |

## Too Big PNG

_link not tracked_

_link not tracked_

| test embed in table                 |
| ----------------------------------- |
| _link not tracked_ |

## SVG

![t006 --- meadow-flower.svg](/t006/t006%20---%20meadow-flower.svg)

![t006 --- meadow-flower.svg](/t006/t006%20---%20meadow-flower.svg)

| test embed in table                       |
| ----------------------------------------- |
| ![t006 --- meadow-flower.svg](/t006/t006%20---%20meadow-flower.svg) |

with a **container directive** that makes the SVG's links interactive

:::meadow
![t006 --- meadow-flower.svg](/t006/t006%20---%20meadow-flower.svg)

enableEmbeddedLinks: true
enableFullscreenButton: true
enableOpenDedicatedPage: false
:::

## Excalidraw

_link not tracked_

with a **container directive** that causes the links to be functional

:::meadow
_link not tracked_

enableEmbeddedLinks: true
enableFullscreenButton: true
enableOpenDedicatedPage: false
:::

| test embed in table                         |
| ------------------------------------------- |
| _link not tracked_ |
[t006 --- page that embeds Excalidraw in another directory](/t006/t006%20---%20page%20that%20embeds%20Excalidraw%20in%20another%20directory.md)

## Audio, video, and PDF

Obsidian embeds audio and video with a player. These are a quarter-second tone and two seconds of green, kept small on purpose. The video is displayed at 320 by 180 pixels so its player controls are usable.

![t006 --- short tone.mp3](/t006/t006%20---%20short%20tone.mp3)

![t006 --- short clip.mp4](/t006/t006%20---%20short%20clip.mp4)

A PDF embeds as a viewer, here opened at its first page and 200 pixels high. Its links work, and one goes to a page in this bundle, so that page is in the graph too. The icon at the top right opens the PDF's own page.

![t006 --- document with a link.pdf](/t006/t006%20---%20document%20with%20a%20link.pdf#page=1&height=200)

A container directive can give the viewer a fullscreen button:

:::meadow
![t006 --- document with a link.pdf](/t006/t006%20---%20document%20with%20a%20link.pdf#height=160)

enableFullscreenButton: true
:::
