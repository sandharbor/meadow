---
title: t020 ---- tags in code blocks should not become tag links
type: Knowledge Page
---
This page should NOT create tag links from code blocks or inline code.

Inline code: `#tag-inside-code-ticks`

```txt
#tag-inside-fenced-code-block
some other text
```

A code block fenced with tildes:

~~~txt
#tag-inside-tilde-fenced-code-block
~~~

An indented code block:

    #tag-inside-indented-code-block
