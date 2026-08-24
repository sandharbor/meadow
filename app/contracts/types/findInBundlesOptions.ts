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

/**
 * Options for the "Find in Bundles" feature.
 * This type is used when navigating to the bundles list to show which bundles track a specific page.
 * Can be provided via CLI arguments or by clicking "Find in Bundles" button in the graph view.
 */
export interface FindInBundlesOptions {
  vaultPath: string;
  folderPath: string;
  pageName: string;
}

const MEADOW_PROTOCOL = 'meadow:';
const FIND_IN_BUNDLES_HOST = 'find-in-bundles';

const isAbsoluteFileSystemPath = (value: string): boolean =>
  value.startsWith('/') ||
  /^[A-Za-z]:[\\/]/.test(value) ||
  value.startsWith('\\\\');

const isValidFolderPath = (value: string): boolean => {
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/')) {
    return false;
  }
  if (!value) return true;
  return value
    .split('/')
    .every(component => component.length > 0 && component !== '.' && component !== '..');
};

/**
 * Parses the public deep-link contract used to open Meadow's Find in Bundles view.
 * Invalid or incomplete links are ignored rather than partially applied.
 */
export const parseFindInBundlesDeepLink = (value: string): FindInBundlesOptions | null => {
  const url = (() => {
    try {
      return new globalThis.URL(value);
    } catch {
      return null;
    }
  })();

  if (
    !url ||
    url.protocol !== MEADOW_PROTOCOL ||
    url.hostname !== FIND_IN_BUNDLES_HOST ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== ''
  ) {
    return null;
  }

  const vaultPath = url.searchParams.get('vaultPath');
  const folderPath = url.searchParams.get('folderPath');
  const pageName = url.searchParams.get('pageName');

  if (
    vaultPath === null ||
    folderPath === null ||
    pageName === null ||
    vaultPath.length === 0 ||
    vaultPath.length > 4_096 ||
    vaultPath.includes('\0') ||
    !isAbsoluteFileSystemPath(vaultPath) ||
    folderPath.length > 4_096 ||
    !isValidFolderPath(folderPath) ||
    pageName.length === 0 ||
    pageName.length > 512 ||
    pageName.includes('\0') ||
    pageName.includes('/') ||
    pageName.includes('\\') ||
    pageName.toLocaleLowerCase().endsWith('.md')
  ) {
    return null;
  }

  return { vaultPath, folderPath, pageName };
};
