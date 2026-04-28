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

export interface DevSamplePage {
  siteGuid: string;
  pageId: string;
  title: string;
  bodyHtml: string;
}

export const devSamplePages: DevSamplePage[] = [
  {
    siteGuid: 'dev-inline',
    pageId: 'dev/inline.html',
    title: 'Mixed card kinds',
    bodyHtml: `
      <main>
        <h1>Mixed card kinds</h1>
        <h2>Geography</h2>
        <meadow-srs-card guid="323e4567f9012" kind="basic">
          <meadow-srs-prompt>Capital of Japan</meadow-srs-prompt>
          <meadow-srs-answer>Tokyo</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="323e4567f9013" kind="bidirectional">
          <meadow-srs-prompt>DNS</meadow-srs-prompt>
          <meadow-srs-answer>Domain Name System</meadow-srs-answer>
        </meadow-srs-card>
        <h2>Books</h2>
        <meadow-srs-card guid="323e4567f9014:cloze:1" kind="cloze" cloze-type="simplified" sibling-group="323e4567f9014">
          <meadow-srs-prompt>Nassim Nicholas <span class="meadow-srs-cloze-blank">...</span> coined the term "antifragile".</meadow-srs-prompt>
          <meadow-srs-answer>Nassim Nicholas Taleb coined the term "antifragile".</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="323e4567f9015" kind="multiline-basic">
          <meadow-srs-prompt><p>The first commercial microprocessor was</p><p>Name the chip.</p></meadow-srs-prompt>
          <meadow-srs-answer><p>Intel 4004</p><p>Released in 1971.</p></meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `,
  },
  {
    siteGuid: 'dev-explicit',
    pageId: 'dev/explicit.html',
    title: 'Rendered prompt HTML and cloze groups',
    bodyHtml: `
      <main>
        <h1>Rendered prompt HTML and cloze groups</h1>
        <meadow-srs-card guid="423e4567f9012" kind="basic">
          <meadow-srs-prompt>What color is <a href="/notes/the-sky.html">the sky</a>?</meadow-srs-prompt>
          <meadow-srs-answer><strong>Blue</strong></meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="423e4567f9013:cloze:1" kind="cloze" cloze-type="classic" sibling-group="423e4567f9013">
          <meadow-srs-prompt>The transport protocols are <span class="meadow-srs-cloze-blank">...</span> and <span class="meadow-srs-cloze-blank">...</span>.</meadow-srs-prompt>
          <meadow-srs-answer>The transport protocols are TCP and UDP.</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="423e4567f9013:cloze:2" kind="cloze" cloze-type="classic" sibling-group="423e4567f9013">
          <meadow-srs-prompt>The transport protocols are TCP and <span class="meadow-srs-cloze-blank">...</span>.</meadow-srs-prompt>
          <meadow-srs-answer>The transport protocols are TCP and UDP.</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `,
  },
  {
    siteGuid: 'dev-blank-lines',
    pageId: 'dev/blank-lines.html',
    title: 'Section context',
    bodyHtml: `
      <main>
        <h1>Section context</h1>
        <section>
          <h2>Networking</h2>
          <meadow-srs-card guid="523e4567f9012" kind="multiline-bidirectional">
            <meadow-srs-prompt><p>What is the TCP three-way handshake?</p><p>List the steps.</p></meadow-srs-prompt>
            <meadow-srs-answer>
              <ol>
                <li>SYN</li>
                <li>SYN-ACK</li>
                <li>ACK</li>
              </ol>
            </meadow-srs-answer>
          </meadow-srs-card>
        </section>
      </main>
    `,
  },
  {
    siteGuid: 'dev-basic-only',
    pageId: 'dev/basic-only.html',
    title: 'Basic only (no siblings)',
    bodyHtml: `
      <main>
        <h1>Basic only (no siblings)</h1>
        <h2>Geography</h2>
        <meadow-srs-card guid="623e4567f9012" kind="basic">
          <meadow-srs-prompt>Capital of France</meadow-srs-prompt>
          <meadow-srs-answer>Paris</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="623e4567f9013" kind="basic">
          <meadow-srs-prompt>Capital of Germany</meadow-srs-prompt>
          <meadow-srs-answer>Berlin</meadow-srs-answer>
        </meadow-srs-card>
        <h2>Science</h2>
        <meadow-srs-card guid="623e4567f9014" kind="basic">
          <meadow-srs-prompt>Chemical symbol for water</meadow-srs-prompt>
          <meadow-srs-answer>H₂O</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `,
  },
];
