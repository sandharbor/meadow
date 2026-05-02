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

export const IMAGE_FILE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'excalidraw'] as const;
export type ImageFileType = (typeof IMAGE_FILE_TYPES)[number];

/** Image extensions with leading dots, for path matching */
export const IMAGE_EXTENSIONS = IMAGE_FILE_TYPES.map((ext) => `.${ext}` as const);

export const isImageFileType = (fileType: string): fileType is ImageFileType => {
  return IMAGE_FILE_TYPES.includes(fileType as ImageFileType);
};

/**
 * Given a page's title and logical file_type, returns the actual on-disk
 * filename. Most types map straight to `<title>.<file_type>`, but Obsidian
 * Excalidraw drawings live as `<title>.excalidraw.md` even though their
 * logical type is `excalidraw`. Use this anywhere the backend or tooling
 * needs to find / read / write the source file from a SitePageConfig.
 */
export function onDiskFilename(title: string, fileType: string | undefined): string {
  const ft = fileType || 'md';
  if (ft === 'excalidraw') {
    return `${title}.excalidraw.md`;
  }
  return `${title}.${ft}`;
}
