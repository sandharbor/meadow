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

// HTML written in a Markdown note is kept, except what would run a script:
// <script> elements, event-handler attributes (`onclick`, …), an iframe's
// inline page (`srcdoc`), and `javascript:` or `vbscript:` addresses.
// Obsidian's reading view removes the same things, so a note's author never
// saw them run. Native HTML pages are not rendered through marked, so their
// scripts are kept: interactive content belongs there.
//
// Only the offending tags are edited; all other HTML is returned exactly as
// written, so a page's output changes only where something is removed.

import he from 'he';
import type { MarkedExtension } from 'marked';

const SCRIPT_ELEMENT = /<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/script\s*>|$)|<\/script\s*>/gi;
const START_TAG = /<([A-Za-z][^\s/>]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)(\s*\/?)>/g;
const ATTRIBUTE = /\s+([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
const ADDRESS_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'data', 'xlink:href', 'poster', 'background']);
const SCRIPT_ADDRESS = /^(?:java|vb)script:/i;

function runsScript(name: string, rawValue: string | undefined): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on') || lower === 'srcdoc') return true;
  if (!ADDRESS_ATTRIBUTES.has(lower) || rawValue === undefined) return false;
  // Browsers decode entities and ignore whitespace and control characters in a scheme.
  const value = he.decode(rawValue.replace(/^["']|["']$/g, '')).replace(/[\u0000- ]/g, '');
  return SCRIPT_ADDRESS.test(value);
}

export function removeScripts(html: string): string {
  return html
    .replace(SCRIPT_ELEMENT, '')
    .replace(START_TAG, (tag: string, name: string, attributes: string, end: string) => {
      let removed = false;
      const kept = attributes.replace(ATTRIBUTE, (attribute: string, attributeName: string, value?: string) => {
        if (!runsScript(attributeName, value)) return attribute;
        removed = true;
        return '';
      });
      return removed ? `<${name}${kept}${end}>` : tag;
    });
}

/** Applies removeScripts to the raw HTML in Markdown that marked renders. */
export const scriptFreeHtml: MarkedExtension = {
  renderer: {
    html({ text }) {
      return removeScripts(text);
    }
  }
};
