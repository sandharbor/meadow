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

// The link renderer shared by page and transclusion rendering. External links
// open in a new tab; the link text is rendered as Markdown like any other
// inline content, so `[**bold**](…)` and image badges render correctly.

import type { MarkedExtension } from 'marked';
import { escapeHtmlAttribute } from './shared.js';

export const markdownLinks: MarkedExtension = {
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : '';
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      const externalAttrs = isExternal ? ' rel="noreferrer noopener" target="_blank"' : '';
      return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
    }
  }
};
