/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, pdf, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleGeneration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Audio, video, and PDF embeds play, and a PDF's links work`);

const description = linkedScenarioDescription(conceptText`Preview a PDF in the curation list, then view a page that embeds audio, video, and a
PDF. Follow the PDF's link to a page in the bundle, and reach the PDF's own page from
that page's backlink and from the embed.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the big bundle is open in the list view.` },
  previewVideo: { type: 'test', text: conceptText`Audio and video have distinct colored graph glyphs. Hover the video icon to see a decoded frame.` },
  previewPdfInList: { type: 'test', text: conceptText`Hover the PDF's document icon in the list. The hover preview draws the PDF's first page.` },
  openBundlePreview: { type: 'test', text: conceptText`Open the bundle preview.` },
  inspectMediaEmbeds: { type: 'test', text: conceptText`Inspect the audio player, play the video with usable player controls, and inspect the two PDF viewers. Each viewer draws the PDF with its links in place.` },
  dedicatedMediaPages: { type: 'test', text: conceptText`Open audio and video pages from their action menus and an image page from its hover controls. Dedicated pages retain backlinks and offer fullscreen and download.` },
  openPdfFullscreen: { type: 'test', text: conceptText`Open the PDF viewer whose Meadow container adds a fullscreen button, then close it.` },
  followPdfLink: { type: 'test', text: conceptText`Follow the PDF's link to the page in this bundle.` },
  openPdfPageFromBacklink: { type: 'test', text: conceptText`Open the PDF's own page from that page's backlink. It draws the PDF at full width.` },
  openPdfPageFromEmbed: { type: 'test', text: conceptText`Return to the embedding page and open the PDF's own page from the embed's icon.` },
});
const areas = scenarioAreas([bundleCuration, bundleGeneration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '123ca774-77ce-4590-b6e7-ad0afbcc3fed' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const { editor, previewModal, generatedBundle } = await test.step(sections.steps.setup, async () => {
    const workflows = new Workflows(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const previewModal = new PreviewPublishModal(page, expect);
    const generatedBundle = previewModal.generatedBundle;

    await sourceCommand(() => workflows.navigateToBigBundle());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => checkpoint("list view loaded"));
    return { editor, previewModal, generatedBundle };
  });

  await test.step(sections.steps.previewVideo, async () => {
    await sourceCommand(() => editor.switchToGraphView());
    await sourceCommand(() => editor.expectMediaGraphIndicators());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.hoverListViewVideoIcon('t006 --- short clip'));
    await sourceCommand(() => addKeyFrame(bundleCuration));
    await sourceCommand(() => checkpoint('video hover shows a captured frame'));
    await sourceCommand(() => page.mouse.move(0, 0));
  });

  await test.step(sections.steps.previewPdfInList, async () => {
    await sourceCommand(() => editor.hoverListViewPdfIcon("t006 --- document with a link"));
    await sourceCommand(() => editor.expectPdfHoverPreviewVisible("t006 --- document with a link"));
    await sourceCommand(() => addKeyFrame(pdf));
    await sourceCommand(() => checkpoint("PDF hover preview shows the first page"));
    await sourceCommand(() => page.mouse.move(0, 0));
  });

  await test.step(sections.steps.openBundlePreview, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => previewModal.waitForPreviewComplete());
    await sourceCommand(() => previewModal.expectUntrackedPagesWarning());
    await sourceCommand(() => checkpoint("the generated bundle preview is ready"));
  });

  const pageLinkedFromPdf = "t006/t006%20---%20page%20linked%20from%20a%20pdf.html";
  await test.step(sections.steps.inspectMediaEmbeds, async () => {
    await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
    await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

    await sourceCommand(() => generatedBundle.media.expectAudioPlayer("short%20tone.mp3"));
    await sourceCommand(() => generatedBundle.media.expectVideoPlayer("short%20clip.mp4"));
    await sourceCommand(() => addKeyFrame(bundleGeneration));
    await sourceCommand(() => checkpoint("video plays with usable controls"));
    await sourceCommand(() => generatedBundle.media.expectPdfEmbedsRendered(2));
    await sourceCommand(() => generatedBundle.media.expectPdfLink(pageLinkedFromPdf));
    await sourceCommand(() => generatedBundle.media.expectPdfLink("https://example.com/"));
    await sourceCommand(() => addKeyFrame(pdf));
    await sourceCommand(() => checkpoint("media players and PDF viewers rendered"));
  });

  await test.step(sections.steps.dedicatedMediaPages, async () => {
    for (const media of [
      { fragment: 'short%20tone.mp3', title: 't006 --- short tone', menu: true },
      { fragment: 'short%20clip.mp4', title: 't006 --- short clip', menu: true },
      { fragment: 'meadow.png', title: 't006 --- meadow', menu: false },
      { fragment: 'meadow-flower.svg', title: 't006 --- meadow-flower', menu: false },
    ]) {
      if (!media.menu) {
        await sourceCommand(() => generatedBundle.media.openEmbeddedImageFullscreen(media.fragment));
        await sourceCommand(() => addKeyFrame(bundleGeneration));
        await sourceCommand(() => checkpoint('embedded image fullscreen'));
        await sourceCommand(() => generatedBundle.media.closeMediaFullscreen());
      }
      await sourceCommand(() => generatedBundle.media.openEmbeddedMediaPage(media.fragment, media.menu));
      await sourceCommand(() => generatedBundle.expectHeading(media.title));
      await sourceCommand(() => generatedBundle.media.expectBacklink('t006 - embedded media'));
      await sourceCommand(() => generatedBundle.media.expectDedicatedMediaActions(media.fragment));
      await sourceCommand(() => addKeyFrame(bundleGeneration));
      await sourceCommand(() => checkpoint(`${media.title} page has backlinks and media actions`));
      await sourceCommand(() => generatedBundle.media.openDedicatedMediaFullscreen());
      await sourceCommand(() => checkpoint(`${media.title} fullscreen is above page navigation`));
      await sourceCommand(() => generatedBundle.media.closeMediaFullscreen());
      const downloaded = await sourceCommand(() => generatedBundle.media.downloadMedia());
      expect(downloaded).toContain(decodeURIComponent(media.fragment));
      await sourceCommand(() => generatedBundle.clickPageLink('t006 - embedded media'));
      await sourceCommand(() => generatedBundle.expectHeading('t006 - embedded media'));
    }
  });

  await test.step(sections.steps.openPdfFullscreen, async () => {
    await sourceCommand(() => generatedBundle.media.openPdfFullscreen());
    await sourceCommand(() => addKeyFrame(pdf));
    await sourceCommand(() => checkpoint("PDF viewer fullscreen open"));
    await sourceCommand(() => generatedBundle.media.closePdfFullscreen());
  });

  await test.step(sections.steps.followPdfLink, async () => {
    await sourceCommand(() => generatedBundle.media.clickPdfLink(pageLinkedFromPdf));
    await sourceCommand(() => generatedBundle.expectHeading("t006 --- page linked from a pdf"));
    await sourceCommand(() => checkpoint("PDF link opened the page in the bundle"));
  });

  await test.step(sections.steps.openPdfPageFromBacklink, async () => {
    await sourceCommand(() => generatedBundle.clickPageLink("t006 --- document with a link"));
    await sourceCommand(() => generatedBundle.expectHeading("t006 --- document with a link"));
    await sourceCommand(() => generatedBundle.media.expectStandalonePdfRendered());
    await sourceCommand(() => generatedBundle.media.expectDedicatedMediaActions('document%20with%20a%20link.pdf'));
    await sourceCommand(() => generatedBundle.media.openDedicatedMediaFullscreen());
    await sourceCommand(() => generatedBundle.media.closeMediaFullscreen());
    await sourceCommand(() => addKeyFrame(pdf));
    await sourceCommand(() => checkpoint("the PDF's own page drew the PDF"));
  });

  await test.step(sections.steps.openPdfPageFromEmbed, async () => {
    await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
    await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));
    await sourceCommand(() => generatedBundle.media.openPdfPage());
    await sourceCommand(() => generatedBundle.expectHeading("t006 --- document with a link"));
    await sourceCommand(() => checkpoint("the embed's icon opened the PDF's own page"));
  });

  void bigBundle;
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      "bundles/meadow-test-bundle-big/raw/generation_inputs/",
      "bundles/meadow-test-bundle-big/raw/tracked_page_content/",

      "bundles/meadow-test-bundle-big/build/",
      "bundles/meadow-test-bundle-big/config/generated_bundle_versions.yaml",
      "bundles/meadow-test-bundle-big/html/",
      "bundles/meadow-test-bundle-big/raw/",
    ],
  }));
});
