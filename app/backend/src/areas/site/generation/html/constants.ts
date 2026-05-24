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

// `.excalidraw` is treated as an image-like media type for embedding (`![[name.excalidraw]]`).
// On disk the file is `<name>.excalidraw.md` (Obsidian Excalidraw plugin), but the working
// graph reclassifies it to file_type=excalidraw based on frontmatter.
export const IMAGE_EXTENSIONS = ['.excalidraw', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'] as const;
// File types without leading dots, for comparing against file_type fields
export const IMAGE_FILE_TYPES = IMAGE_EXTENSIONS.map(ext => ext.slice(1));
export const LINK_PATTERN = /\[\[(.*?)\]\]/g;
// All file types recognized as internal site files (used to detect relative file links)
export const KNOWN_FILE_TYPES = ['md', 'txt', 'pdf', ...IMAGE_FILE_TYPES] as const;