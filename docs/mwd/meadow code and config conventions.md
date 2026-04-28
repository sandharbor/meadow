### Naming

[[naming]]

title or name? **title**

directory or folder? **directory**

in-links of inlinks?  [[inlink]]s (no hyphen) Also [[outlink]]s

### Config

[[naming]]... conf or config? **config** (just because of the macintosh `.config` folder, so align to that)

[[naming]]... "call outs", "call-outs", or "callouts"?  **callout** (singular)

In YAML, single or double quotes?  **double quotes**.  Functionally equivalent to single quotes in YAML, but matches what's in the fixtures, and is more conventional in YAML.

camelCase or `snake_case` for config variables?  [[camel case]], like [[site config -- initialSitePageDirectory]] s, because we're primarily using TypeScript, and it will aid in 1:1 grepability.  TODO - need a coding motivation (or principles) page like [[design motivation]]

An empty [[site config -- initialSitePageDirectory]] should be "/" because that matches Obsidian's root page.

### Camel or Snake Case

[[camel case or snake case]]

### TypeScript Coding conventions

For `types` files, it should only be the type definitions, not any additional utility logic.  That should live elsewhere.