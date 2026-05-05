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

import { execSync } from 'child_process';
import test from 'tape';

type SourcePageFileInfo = {
  title: string;
  directory: string;
  file_type: string;
  fullPath: string;
  modifiedTimeMs: number;
};

function runSourcePageSearch(args: { root: string }): SourcePageFileInfo[] {
  const cmd = [
    `cargo run --quiet --bin source_page_search_by_title_bin --`,
    `--root "${args.root}"`,
  ].join(' ');

  const stdout = execSync(cmd, { encoding: 'utf8', cwd: '../source_page_search_by_title_code' });
  return JSON.parse(stdout) as SourcePageFileInfo[];
}

test('source_page_search_by_title integration', (t) => {
  const graphRoot = "../../../shared_data/source_graphs/meadow-test-sites-data";
  const all = runSourcePageSearch({ root: graphRoot });

  t.ok(Array.isArray(all), 'returns an array');
  t.ok(all.length > 0, 'expected some markdown pages');

  t.test('entries have expected shape', (st) => {
    const e = all[0];
    st.ok(typeof e.title === 'string', 'title is string');
    st.ok(typeof e.directory === 'string', 'directory is string');
    st.ok(typeof e.file_type === 'string', 'file_type is string');
    st.ok(typeof e.fullPath === 'string', 'fullPath is string');
    st.ok(typeof e.modifiedTimeMs === 'number', 'modifiedTimeMs is number');
    st.end();
  });

  t.test('contains known pages by filename title', (st) => {
    const main = all.find(x => x.title.toLowerCase() === 'main page');
    st.ok(main, 'should contain "main page"');
    const t009 = all.find(x => x.title.toLowerCase() === 't009 - page conf graph depth');
    st.ok(t009, 'should contain "t009 - page conf graph depth"');
    st.equal(t009?.file_type, 'md', 'regular markdown page is file_type md');
    st.end();
  });

  t.test('classifies Obsidian Excalidraw markdown as excalidraw', (st) => {
    const flower = all.find(x =>
      x.title === 't006 --- meadow-flower' &&
      x.directory === 't006' &&
      x.file_type === 'excalidraw'
    );
    st.ok(flower, 'should contain the meadow flower drawing as an excalidraw page');
    st.equal(flower?.fullPath, 't006/t006 --- meadow-flower.excalidraw.md');
    const staleMdShape = all.find(x =>
      x.title === 't006 --- meadow-flower.excalidraw' &&
      x.directory === 't006' &&
      x.file_type === 'md'
    );
    st.notOk(staleMdShape, 'should not expose the drawing as a markdown page with .excalidraw in the title');
    st.end();
  });

  t.end();
});

