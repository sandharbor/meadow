^ [[meadow workflow]] -- SRS markdown to SRS interactive elements on the published [[site]]

---

*Note that this stuff only happens if [[html site component -- spaced repetition]] is enabled, otherwise Meadow treats the SRS formatting as if it's just normal text in a markdown file*

[[meadow workflow]]
### Source Graph

There are special [[obsidian plugin -- spaced repetition]] formatted blocks in the [[source graph]] markdown including the [[obsidian plugin -- spaced repetition -- SR comment|SR comment]], because the user has been using them locally.

Here what one of the many formats looks like:

```
What color is the sky?::Blue
<!--SR:...-->
```

### SRS GUIDs

We need to add a [[MEADOW_SR_GUID]] to the bottom of the [[obsidian plugin -- spaced repetition -- card|card]], two lines after the block (or the [[obsidian plugin -- spaced repetition -- SR comment|SR comment]] if there is one).  That GUID will give the card a durable identity, which will be important later because when we process the markdown for publishing, we remove the [[obsidian plugin -- spaced repetition -- SR comment|SR comment]], since it is specific to the [[publisher]], and wouldn't be applicable to the [[reader]].

Here's what [[MEADOW_SR_GUID insertion into source graph pages]] looks like:

either

```
What color is the sky?::Blue

<!--MEADOW_SR_GUID:123e4567f9012-->
```

or

```
What color is the sky?::Blue
<!--SR:...-->

<!--MEADOW_SR_GUID:123e4567f9012-->
```

This is an example of [[changing things in the source graph from the app]].  Since it is [[dim - sensitivity -- high]] to change things in the user's [[source graph]], we need to show the user a confirmation of this using a [[app component -- callout]], just like we do for [[setting a source page sensitive from in the app]].

Like the [[obsidian plugin -- spaced repetition]], we don't want to modify pages that don't actually contain spaced repetition prompts.  The way the plugin does it is to have a list of flashcard tags that apply.  For example

```
#flashcard #srs
```

In that case, anything with those two tags, or with nested tags like this...

```
#flashcards/ka-quiz
```

... would match.

The user interface for enabling [[html site component -- spaced repetition]] will need to show the user a modal explaining that it will modify their source graph, and also allow them to specify (and then later edit) the associated tags.

### SRS GUID insertion and git checks against a golden-set 

One challenge that [[MEADOW_SR_GUID insertion into source graph pages]] poses is for our [[git changes test against golden-set test]]s.  The problem is that if the GUIDs do not exist on a page in the source graph, and we add them as part of a [[system test]] scenario, then if we don't take care the GUID will not be a [[stable identifier]], meaning we cannot add it to a [[golden-set]] because it will change from run-to-run.  The solve is for the [[MEADOW_SR_GUID insertion creates content-aware GUIDs]].  It is a hash of `pageRelativePath + cardIndex + cardContent` .

### Raw tracked version

When a page is [[site page tracking state -- tracked]], we store a version of the source graph's markdown in [[meadow config directory path - tracked markdown - HOME slash .config slash meadow slash sites slash the site slash raw slash tracked_page_content|raw tracked markdown]].

### Modified markdown

If [[html site component -- spaced repetition]] is enabled, then we do a second stage of markdown processing.  As this step processes each markdown page, first it adds [[GUID]]s to all the cards in the [[source graph]] page, if that page has a tag that matches the provided ones, then it updates the [[meadow config directory path - tracked markdown - HOME slash .config slash meadow slash sites slash the site slash raw slash tracked_page_content|raw tracked markdown]] with those changes.  Next, it creates a modified version of the markdown that is used for the remainder of the process.

[[the SRS modification to markdown removes the SR comments from the markdown]]


This modified version is used _both_ for generating the HTML pages, and also for generating the content of the .zip file that can be optionally published to the [[site]] by the [[publisher]].

### Modified markdown to custom HTML elements

When rendering the HTML for publishing, it uses the modified markdown which looks like this (remember the GUID is added and the [[obsidian plugin -- spaced repetition -- SR comment|SR comment]] is removed):

```
What color is the sky?::Blue

<!--MEADOW_SR_GUID:123e4567f9012-->
```

which generates a custom spaced repetition HTML representation that looks like this

```html
<meadow-srs-card guid="123e4567f9012" kind="basic">
  <meadow-srs-prompt>What color is the sky?</meadow-srs-prompt>
  <meadow-srs-answer>Blue</meadow-srs-answer>
</meadow-srs-card>
```

Note that this rendering must happen in a way that ensures the links are fully processed, just as if they had been in a non-SRS part of the markdown.

In other words, like this:

```
What color is [[the sky]]?::Blue

<!--MEADOW_SR_GUID:923e4567f9015-->
```

which generates a custom spaced repetition HTML representation that looks like this (just showing that there is a hyperlink)

```html
<meadow-srs-card guid="123e4567f9012" kind="basic">
  <meadow-srs-prompt>What color is <a href="some/path/to/the sky.html">the sky</a>?</meadow-srs-prompt>
  <meadow-srs-answer>Blue</meadow-srs-answer>
</meadow-srs-card>
```

### Compiling into the published site

In addition to generating the custom HTML representation in-place in the pages we render, we also create a **single** page with _all_ the spaced repetition cards for the whole site.  The use of that file is described below.

Additionally the [[published_site_util -- srs]] utility generates javascript and css specifically for SRS, which is explained more below.

### Using in the published site 

The Javascript from the [[published_site_util -- srs]] interacts with the custom spaced repetition HTML.  In the single pages, It turns those custom `meadow-srs-card` components into little Applet-like interactive elements positioned directly in the page.

In the single page that contains all the cards, the javascript allows for different ways of viewing the content.  Either it will show all the due cards, or all the cards.  Maybe it will have a simple search.  That kind of thing.

The state of the [[reader]]'s SRS cards is stored in [[localStorage]] and connected to the card via the card's GUID.

### Testing

`t022` is in `meadow-test-sites-data` and has two separate pages with some spaced repetition cards in them (with two different tags in the pages), as a test. That way, in the `home_fixture_big_and_small`, after it loads, we can easily enable the spaced repetition option and see the resulting changes to the generated HTML.

Also, we'll be able to add new fixture that has spaced repetition enabled by default and pointing to a tag that matches one one of the two pages, so we'll be able to test that we get the `system_tests/expected_results`