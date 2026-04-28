^ [[site config content]] -- directory -- tracked_page_content

---

As part of saving the [[site config]], we copy the [[site page tracking state -- tracked]]'s [[source page]] markdown files into the `tracked_page_content` folder, and then do a [[commit point -- saving site config]].

When we generate the [[local html preview site]], we use these `tracked_page_content` files, not the original source page markdown.
### Design motivation

There are several motivations for using the tracked page content.  First, this is a part of the [[multi-stage processing]], driven by [[design motivation -- processing stage repeatability]].

Also [[design motivation -- great change management]] and [[design motivation -- reviewability]].  The idea is that you ought to be able to see what differs in the markdown for what are are about to publish now, vs. what you published in the past. (TODO... this idea has changed a bit... the thing we _actually_ surface now in the [[app component - modal -- site preview -- tab changes]] is the result of the rendered HTML, since ultimately that is what is _actually_ changing)
...
[[diff - markdown vs. rendered HTML]]
...
[[app component - modal -- site preview -- tab changes]]

### Special Cases

[[blacklisted site pages should not have their file content in the tracked_page_content directory]]