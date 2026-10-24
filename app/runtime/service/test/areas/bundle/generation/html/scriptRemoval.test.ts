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

import { describe, it, expect } from 'vitest';
import { removeScripts } from '../../../../../src/areas/bundle/generation/html/scriptRemoval.js';

describe('script removal from note HTML', () => {
  it('leaves HTML without scripts exactly as written', () => {
    const html = `<details><summary>A</summary>It&#39;s "quoted".</details><iframe src="https://example.com" title='x'></iframe>`;
    expect(removeScripts(html)).toBe(html);
  });

  it('removes script elements, including unclosed and stray closing tags', () => {
    expect(removeScripts('a<script type="x">alert(1)</script>b')).toBe('ab');
    expect(removeScripts('a<SCRIPT>alert(1)')).toBe('a');
    expect(removeScripts('a</script>b')).toBe('ab');
  });

  it('removes event handlers in any letter case and quoting, keeping other attributes', () => {
    expect(removeScripts(`<button class="b" onclick="go()" ONMOUSEOVER='x' onfocus=y>B</button>`))
      .toBe('<button class="b">B</button>');
  });

  it('removes script addresses, including encoded or split ones', () => {
    expect(removeScripts('<a href="javascript:go()" title="t">x</a>')).toBe('<a title="t">x</a>');
    expect(removeScripts('<a href="&#106;avascript:go()">x</a>')).toBe('<a>x</a>');
    expect(removeScripts('<a href="java\nscript:go()">x</a>')).toBe('<a>x</a>');
    expect(removeScripts('<iframe srcdoc="<script>go()</script>"></iframe>')).toBe('<iframe></iframe>');
  });

  it('keeps an ordinary address that only mentions javascript', () => {
    const html = '<a href="https://example.com/javascript:guide">x</a>';
    expect(removeScripts(html)).toBe(html);
  });

  it('reads a quoted > as part of an attribute value', () => {
    expect(removeScripts('<a title="a > b" onclick="x">y</a>')).toBe('<a title="a > b">y</a>');
  });
});
