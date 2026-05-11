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
 * Returns the canonical filename Meadow writes for a logical page/file.
 * Most types map straight to `<title>.<file_type>`, but generated/tracked
 * Excalidraw markdown uses the Obsidian plugin's conventional
 * `<title>.excalidraw.md` marker even though the logical file type is
 * `excalidraw`.
 */
export function canonicalPageFilename(title: string, fileType: string | undefined): string {
  const ft = fileType || 'md';
  if (ft === 'excalidraw') {
    return `${title}.excalidraw.md`;
  }
  return `${title}.${ft}`;
}

/**
 * Returns the physical source filenames that may back a logical page/file in a
 * user's source graph. Obsidian Excalidraw commonly creates
 * `<title>.excalidraw.md`, but the marker is optional; the content can also be
 * stored as `<title>.md`.
 */
export function sourceFileCandidateFilenames(title: string, fileType: string | undefined): string[] {
  const ft = fileType || 'md';
  const primary = canonicalPageFilename(title, ft);
  if (ft === 'excalidraw') {
    return [primary, `${title}.md`];
  }
  return [primary];
}

/**
 * Returns source-file request paths to try for a generated/canonical source
 * reference. This lets thumbnail/source fetchers request `foo.excalidraw.md`
 * while still serving source graphs where that Excalidraw drawing is stored as
 * bare `foo.md`.
 */
export function sourceFileRequestPathCandidates(relativePath: string): string[] {
  const excalidrawMarkdownSuffix = '.excalidraw.md';
  if (!relativePath.toLowerCase().endsWith(excalidrawMarkdownSuffix)) {
    return [relativePath];
  }

  return [
    relativePath,
    `${relativePath.slice(0, -excalidrawMarkdownSuffix.length)}.md`,
  ];
}
