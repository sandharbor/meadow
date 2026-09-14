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

import type { SourcePageFileInfo } from '../../../../../../contracts/types/sourcePageFileInfo';
import type { CreateBundleForm, CreateOrEditBundleModalProps, EntryStrategy } from './BundleCreationBasics';

export interface SourceDirectoryChoices {
  visible: boolean;
  options: string[];
}

export const sourcePageFallbackPath = (page: { title: string; directory: string; file_type: string }): string => {
  const filename = page.file_type === 'excalidraw'
    ? `${page.title}.excalidraw.md`
    : `${page.title}.${page.file_type || 'md'}`;
  return page.directory ? `${page.directory}/${filename}` : filename;
};

export const findUniqueSlug = (baseSlug: string, existingSlugs: string[]): string => {
  const slugSet = new Set(existingSlugs);
  if (!slugSet.has(baseSlug)) return baseSlug;
  let counter = 1;
  while (slugSet.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
};

export const normalizeDirectory = (directory: string): string => directory === '/' ? '' : directory;

export const slugFromTitle = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

type BundleModalDefaults = Pick<CreateOrEditBundleModalProps,
  'mode' | 'directories' | 'existingSlugs' | 'findInBundlesOptions' | 'editBundle'>;

// Create once per opening. Selecting a new directory must not change which
// directories were already available when the user started this bundle.
export const createBundleModalViewModel = ({
  mode,
  directories,
  existingSlugs = [],
  findInBundlesOptions = null,
  editBundle = null,
}: BundleModalDefaults) => {
  const directoriesAtOpen = [...new Set(directories.filter(Boolean))];
  const recentSourceDirectory = directoriesAtOpen[0] ?? '';
  const form: CreateBundleForm = mode === 'edit' && editBundle
    ? {
        slug: editBundle.slug,
        sourceDirectory: editBundle.sourceDirectory || '',
        entryBundleNodeName: editBundle.entryBundleNodeName || '',
        entrySourceGraphSubdirectory: normalizeDirectory(editBundle.entrySourceGraphSubdirectory || ''),
        entryFileType: editBundle.entryFileType || 'md',
        bundleNotes: editBundle.bundleNotes || '',
      }
    : {
        slug: '',
        sourceDirectory: recentSourceDirectory,
        entryBundleNodeName: '',
        entrySourceGraphSubdirectory: '',
        entryFileType: '',
        bundleNotes: '',
      };

  let selectedInitialPage: SourcePageFileInfo | null = null;
  if (mode === 'edit' && editBundle && !editBundle.folderDerived) {
    selectedInitialPage = {
      title: form.entryBundleNodeName,
      directory: form.entrySourceGraphSubdirectory,
      file_type: form.entryFileType as SourcePageFileInfo['file_type'],
      fullPath: sourcePageFallbackPath({
        title: form.entryBundleNodeName,
        directory: form.entrySourceGraphSubdirectory,
        file_type: form.entryFileType,
      }),
      modifiedTimeMs: 0,
    };
  }

  if (mode === 'create' && findInBundlesOptions) {
    const pageName = findInBundlesOptions.pageName || '';
    form.sourceDirectory = findInBundlesOptions.vaultPath || recentSourceDirectory;
    form.entryBundleNodeName = pageName;
    form.entrySourceGraphSubdirectory = normalizeDirectory(findInBundlesOptions.folderPath || '');
    form.slug = findUniqueSlug(slugFromTitle(pageName), existingSlugs);
    selectedInitialPage = {
      title: pageName,
      directory: form.entrySourceGraphSubdirectory,
      file_type: 'md',
      fullPath: sourcePageFallbackPath({ title: pageName, directory: form.entrySourceGraphSubdirectory, file_type: 'md' }),
      modifiedTimeMs: 0,
    };
  }

  const folderDerived = mode === 'edit' && editBundle?.folderDerived === true;
  const entryStrategy: EntryStrategy = folderDerived ? 'folders' : 'page';
  return {
    form,
    selectedInitialPage,
    isSourceDirectoryManuallyEdited: mode === 'create' && !form.sourceDirectory,
    entryStrategy,
    showMoreDetails: mode === 'edit',
    defaultOutlinksDepth: String(editBundle?.defaultOutlinksDepth ?? (folderDerived ? 1 : 3)),
    defaultInlinksDepth: String(editBundle?.defaultInlinksDepth ?? (folderDerived ? 0 : 1)),
    sourceDirectoryChoices: (selectedDirectory: string): SourceDirectoryChoices => ({
      visible: directoriesAtOpen.length > 1,
      options: directoriesAtOpen.filter(directory => directory !== selectedDirectory),
    }),
  };
};
