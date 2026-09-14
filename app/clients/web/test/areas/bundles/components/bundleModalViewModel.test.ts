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

import { describe, expect, it } from 'vitest';
import { createBundleModalViewModel } from '../../../../src/areas/bundles/components/bundleModalViewModel';

describe('bundle modal directory choices', () => {
  it.each([
    { directories: [], visible: false },
    { directories: ['/notes'], visible: false },
    { directories: ['', '/notes', '/notes'], visible: false },
    { directories: ['/notes', '/work'], visible: true },
    { directories: ['/notes', '', '/work', '/notes'], visible: true },
  ])('requires multiple distinct directories at opening: $directories', ({ directories, visible }) => {
    const model = createBundleModalViewModel({ mode: 'create', directories });
    expect(model.sourceDirectoryChoices(model.form.sourceDirectory).visible).toBe(visible);
    expect(model.sourceDirectoryChoices('/new/directory').visible).toBe(visible);
    expect(model.sourceDirectoryChoices('').visible).toBe(visible);
  });

  it('does not introduce the chooser when browsing creates a second directory choice', () => {
    const directories = ['/notes'];
    const model = createBundleModalViewModel({ mode: 'create', directories });
    expect(model.form.sourceDirectory).toBe('/notes');

    const selectedDirectory = '/notes/films';
    directories.push(selectedDirectory);
    expect(model.sourceDirectoryChoices(selectedDirectory).visible).toBe(false);
    expect(model.sourceDirectoryChoices('/another/directory').options).toEqual(['/notes']);

    const reopened = createBundleModalViewModel({ mode: 'create', directories });
    expect(reopened.sourceDirectoryChoices('/notes')).toEqual({ visible: true, options: ['/notes/films'] });
  });

  it('keeps the original choices in recency order and excludes the current selection', () => {
    const directories = ['/work', '/notes', '/work', '', '/archive'];
    const model = createBundleModalViewModel({ mode: 'create', directories });
    expect(model.form.sourceDirectory).toBe('/work');
    expect(model.sourceDirectoryChoices('/work')).toEqual({ visible: true, options: ['/notes', '/archive'] });
    expect(model.sourceDirectoryChoices('/notes')).toEqual({ visible: true, options: ['/work', '/archive'] });

    directories.splice(0, directories.length, '/new/directory');
    expect(model.sourceDirectoryChoices('/new/directory')).toEqual({ visible: true, options: ['/work', '/notes', '/archive'] });
  });

  it('does not count a preselected page directory as another pre-existing directory', () => {
    const model = createBundleModalViewModel({
      mode: 'create', directories: ['/notes'],
      findInBundlesOptions: { vaultPath: '/other', folderPath: '', pageName: 'Company Brain' },
    });
    expect(model.form.sourceDirectory).toBe('/other');
    expect(model.sourceDirectoryChoices(model.form.sourceDirectory).visible).toBe(false);
  });
});

describe('bundle modal opening defaults', () => {
  it('starts with a custom directory field when there is no recent directory', () => {
    const model = createBundleModalViewModel({ mode: 'create', directories: [] });
    expect(model.form).toMatchObject({ sourceDirectory: '', slug: '', entryBundleNodeName: '' });
    expect(model.isSourceDirectoryManuallyEdited).toBe(true);
    expect(model.selectedInitialPage).toBeNull();
    expect(model.entryStrategy).toBe('page');
    expect(model.defaultOutlinksDepth).toBe('3');
    expect(model.defaultInlinksDepth).toBe('1');
  });

  it('uses the preselected page and generates an available bundle name', () => {
    const model = createBundleModalViewModel({
      mode: 'create', directories: ['/recent'],
      existingSlugs: ['company-brain', 'company-brain-1'],
      findInBundlesOptions: { vaultPath: '/vault', folderPath: 'Teams', pageName: 'Company Brain' },
    });
    expect(model.form).toMatchObject({ sourceDirectory: '/vault', slug: 'company-brain-2', entryBundleNodeName: 'Company Brain', entrySourceGraphSubdirectory: 'Teams' });
    expect(model.selectedInitialPage).toMatchObject({ title: 'Company Brain', directory: 'Teams', file_type: 'md', fullPath: 'Teams/Company Brain.md' });
    expect(model.isSourceDirectoryManuallyEdited).toBe(false);
  });

  it('keeps the recent directory when the preselected page does not supply one', () => {
    const model = createBundleModalViewModel({
      mode: 'create', directories: ['/recent', '/older'],
      findInBundlesOptions: { vaultPath: '', folderPath: '/', pageName: 'Company Brain' },
    });
    expect(model.form.sourceDirectory).toBe('/recent');
    expect(model.selectedInitialPage?.fullPath).toBe('Company Brain.md');
  });

  it('preserves an edited page bundle and its chosen traversal depths', () => {
    const model = createBundleModalViewModel({
      mode: 'edit', directories: ['/recent'],
      editBundle: {
        slug: 'my-bundle', sourceDirectory: '/vault', entryBundleNodeName: 'Drawing',
        entrySourceGraphSubdirectory: '/', entryFileType: 'excalidraw', bundleNotes: 'Keep these notes',
        defaultOutlinksDepth: 4, defaultInlinksDepth: 2,
      },
    });
    expect(model.form).toMatchObject({ slug: 'my-bundle', sourceDirectory: '/vault', bundleNotes: 'Keep these notes', entrySourceGraphSubdirectory: '' });
    expect(model.selectedInitialPage?.fullPath).toBe('Drawing.excalidraw.md');
    expect(model.entryStrategy).toBe('page');
    expect(model.showMoreDetails).toBe(true);
    expect(model.defaultOutlinksDepth).toBe('4');
    expect(model.defaultInlinksDepth).toBe('2');
  });

  it('opens folder bundles with folder defaults and no selected source page', () => {
    const model = createBundleModalViewModel({
      mode: 'edit', directories: ['/recent'],
      editBundle: { slug: 'folders', sourceDirectory: '/vault', entryBundleNodeName: 'Collection', folderDerived: true },
    });
    expect(model.entryStrategy).toBe('folders');
    expect(model.selectedInitialPage).toBeNull();
    expect(model.defaultOutlinksDepth).toBe('1');
    expect(model.defaultInlinksDepth).toBe('0');
  });
});
