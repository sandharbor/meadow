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

import { test, expect } from '../src/run/test-fixtures.js';
import { CustomizeTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import {
  bundleGeneration, bundleReview, customize, tagPageGeneration, generatedPagesDirectory,
  conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, scenarioSections,
} from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ executionSurface: 'browser' });

const name = linkedScenarioName(conceptText`Web App tag pages regenerate from Customization and connect their source pages`);
const description = linkedScenarioDescription(conceptText`Turn ${conceptLink(tagPageGeneration.id, 'Tag Page Generation')} off and back on in Customization.
Tag text should become navigable links again, leading to a page in the ${conceptLink(generatedPagesDirectory.id, 'Generated Pages Directory')}
whose backlinks connect both source pages.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a tracked source page containing a tag shared by two pages, then open Customization.` },
  disableTags: { type: 'test', text: conceptText`Disable Tags. The source page should retain its tag text without a generated tag link.` },
  enableTags: { type: 'test', text: conceptText`Enable Tags again and follow the generated link into the ${conceptLink(generatedPagesDirectory.id, 'Generated Pages Directory')}. The tag page should link back to both source pages.` },
  followBacklink: { type: 'test', text: conceptText`Follow the backlink to the other source page and verify that its tag leads to the same generated page.` },
});
const areas = scenarioAreas([bundleGeneration, bundleReview], { subAreas: [customize, tagPageGeneration] });
const tag = 't018-shared-1';
const firstSource = 't018 ---- shared tags page 1';
const secondSource = 't018 ---- shared tags page 2';
const tagRoute = `_mw_gen/tagpages/tag--${tag}.html`;

test(name.name, { annotation: [{ type: 'scenario-id', description: '07a9d781-7567-4e0f-9e76-9a5e23747fa4' },
  name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck,
}) => {
  const { generated, options } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundlePreview());
    const modal = new PreviewPublishModal(page, expect);
    const generated = modal.generatedBundle;
    await sourceCommand(() => generated.clickPageLink('t018 - tags'));
    await sourceCommand(() => generated.clickPageLink(firstSource));
    await sourceCommand(() => generated.expectSingleHeading(firstSource));
    await sourceCommand(() => modal.openCustomizeSidebar());
    const options = new CustomizeTab(page, expect).generationOptions;
    await sourceCommand(() => options.expectOptionsHeading());
    await sourceCommand(() => checkpoint('shared-tag source page is open with Customization available'));
    return { generated, options };
  });

  await test.step(sections.steps.disableTags, async () => {
    await sourceCommand(() => options.setTagsEnabled(false));
    await sourceCommand(() => generated.expectSingleHeading(firstSource));
    await sourceCommand(() => generated.expectTagTextWithoutLink(tag));
    await sourceCommand(() => addKeyFrame(customize));
    await sourceCommand(() => checkpoint('Tags disabled leaves source tag text without a generated link'));
  });

  await test.step(sections.steps.enableTags, async () => {
    await sourceCommand(() => options.setTagsEnabled(true));
    await sourceCommand(() => generated.expectTagLink(tag, `../${tagRoute}`));
    await sourceCommand(() => generated.clickPageLink(`#${tag}`));
    await sourceCommand(() => generated.expectSingleHeading(`tag--${tag}`));
    const tagUrl = await sourceCommand(() => generated.getUrl());
    expect(new URL(tagUrl).pathname).toMatch(/\/_mw_gen\/tagpages\/tag--t018-shared-1\.html$/);
    await sourceCommand(() => generated.expectBacklink(firstSource));
    await sourceCommand(() => generated.expectBacklink(secondSource));
    await sourceCommand(() => addKeyFrame(tagPageGeneration));
    await sourceCommand(() => addKeyFrame(generatedPagesDirectory));
    await sourceCommand(() => checkpoint('generated tag page is under _mw_gen and links back to both source pages'));
  });

  await test.step(sections.steps.followBacklink, async () => {
    await sourceCommand(() => generated.clickPageLink(secondSource));
    await sourceCommand(() => generated.expectSingleHeading(secondSource));
    await sourceCommand(() => generated.expectTagLink(tag, `../${tagRoute}`));
    await sourceCommand(() => addKeyFrame(tagPageGeneration));
    await sourceCommand(() => checkpoint('the other source page links to the same generated tag page'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
