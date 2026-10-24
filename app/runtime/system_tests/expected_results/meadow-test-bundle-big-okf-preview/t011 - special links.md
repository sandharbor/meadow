---
title: t011 - special links
type: Knowledge Page
---
[t011 ---- page name with special characters -- before dot . and after dot](/t011/t011%20----%20page%20name%20with%20special%20characters%20--%20before%20dot%20.%20and%20after%20dot.md)

[t011 ---- page name with special characters -- single quote ' in name](/t011/t011%20----%20page%20name%20with%20special%20characters%20--%20single%20quote%20'%20in%20name.md)

[test.io which looks like a filename suffix](/t011/test.io%20which%20looks%20like%20a%20filename%20suffix.md)

A link whose letter case differs from the page name, which should still find the page: [T011 ---- Page Name With Special Characters -- Before Dot . And After Dot](/t011/t011%20----%20page%20name%20with%20special%20characters%20--%20before%20dot%20.%20and%20after%20dot.md)

A link to an alias, which should find the page whose frontmatter lists it under `aliases:` and show the alias as written (no page has this name, so Obsidian Publish falls back to aliases, in any letter case): [the page with a quote](/t011/t011%20----%20page%20name%20with%20special%20characters%20--%20single%20quote%20'%20in%20name.md)

### Links in a table with escaped aliases

First, before we get into the table, let's just do one _outside_ the table:

[link with an escaped alias works outside a table](/t011/t011%20---%20pointed%20to%20by%20an%20escaped%20alias%20outside%20a%20table.md)

| Column 1 | Description Column | Column 3 |
|----------|--------------------|----------|
| [table test row 1 column 1](/t011/t011%20---%20table%20test%20row%201%20column%201.md) | This is a test of row 1 | [table test row 1 column 3](/t011/t011%20---%20table%20test%20row%201%20column%203.md) |
| [table test row 2 column 1](/t011/t011%20---%20table%20test%20row%202%20column%201.md) | This is a test of row 2 | [table test row 2 column 3](/t011/t011%20---%20table%20test%20row%202%20column%203.md) |
