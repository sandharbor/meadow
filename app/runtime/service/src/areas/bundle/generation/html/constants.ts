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

import { AUDIO_FILE_TYPES, VIDEO_FILE_TYPES } from '../../../../../../../shared_code/utils/fileTypeUtils.js';

// `.excalidraw` is treated as an image-like media type for embedding (`![[name.excalidraw]]`).
// On disk the file is `<name>.excalidraw.md` (Obsidian Excalidraw plugin), but the working
// graph reclassifies it to file_type=excalidraw based on frontmatter.
export const IMAGE_EXTENSIONS = ['.excalidraw', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp', '.bmp', '.avif'] as const;
// File types without leading dots, for comparing against file_type fields
export const IMAGE_FILE_TYPES = IMAGE_EXTENSIONS.map(ext => ext.slice(1));
// Audio, video, and PDF files, which a note embeds with a player or a viewer, as in Obsidian.
export const MEDIA_FILE_TYPES: readonly string[] = [...AUDIO_FILE_TYPES, ...VIDEO_FILE_TYPES, 'pdf'];
// Every file a note embeds as itself rather than transcluding: images and media.
export const EMBEDDED_FILE_EXTENSIONS: readonly string[] = [...IMAGE_EXTENSIONS, ...MEDIA_FILE_TYPES.map(type => `.${type}`)];
export const LINK_PATTERN = /\[\[(.*?)\]\]/g;
// All file types recognized as internal bundle files (used to detect relative file links)
export const KNOWN_FILE_TYPES = ['md', 'txt', ...IMAGE_FILE_TYPES, ...MEDIA_FILE_TYPES] as const;
