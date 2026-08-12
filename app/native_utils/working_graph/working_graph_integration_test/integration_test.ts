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

type WorkingGraphNode = {
  siteNodeKey: string;
  siteNodeId?: string;
  siteNodeKind: 'file';
  siteNodeName: string;
  sourceGraphSubdirectory: string;
  fileType: string;
  depth: number;
};

type WorkingGraphEdge = {
  source: string;
  target: string;
  siteEdgeKind: 'semanticLink';
  link_original_text: string;
  link_resolved_target_directory: string;
  link_resolved_target_path: string | null;
};

type WorkingGraphOutput = {
  nodes: WorkingGraphNode[];
  edges: WorkingGraphEdge[];
  allInlinkSources: Record<string, string[]>;
  allOutlinkTargets: Record<string, string[]>;
};

function runWorkingGraph(args: {
  entrySiteNodeId: string;
  defaultTraversalSiteNodeId: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  frontierDepth?: number;
}): WorkingGraphOutput {
  // Path relative to working_graph_code working directory
  const graphRoot = "../../../shared_data/source_graphs/meadow-test-sites-data";
  const siteNodeConfig = "../../../shared_data/home_fixtures/home_fixture_big_and_small/sites/meadow-test-site-big/conf/site_node_config.yaml";

  const cmd = [
    `cargo run --quiet --bin working_graph_bin --`,
    `--graph-root "${graphRoot}"`,
    `--site-node-config "${siteNodeConfig}"`,
    `--entry-site-node-id "${args.entrySiteNodeId}"`,
    `--default-traversal-site-node-id "${args.defaultTraversalSiteNodeId}"`,
    ...(args.defaultOutlinksDepth === undefined ? [] : [`--default-outlinks-depth ${args.defaultOutlinksDepth}`]),
    ...(args.defaultInlinksDepth === undefined ? [] : [`--default-inlinks-depth ${args.defaultInlinksDepth}`]),
    `--frontier-depth ${args.frontierDepth ?? 0}`,
  ].join(' ');

  const stdout = execSync(cmd, { encoding: 'utf8', cwd: '../working_graph_code' });
  return JSON.parse(stdout) as WorkingGraphOutput;
}

const resultMain = runWorkingGraph({
  entrySiteNodeId: 'ef63f962db68',
  defaultTraversalSiteNodeId: 'ef63f962db68',
  defaultOutlinksDepth: 4,
  defaultInlinksDepth: 100,
  frontierDepth: 0
});

const resultDepth0 = runWorkingGraph({
  entrySiteNodeId: '8d86983d7f98',
  defaultTraversalSiteNodeId: '8d86983d7f98',
  defaultOutlinksDepth: 4,
  defaultInlinksDepth: 100,
  frontierDepth: 0
});

function nodeByNameAndDir(nodes: WorkingGraphNode[], name: string, dir: string): WorkingGraphNode | undefined {
  return nodes.find(node => node.siteNodeName === name && (node.sourceGraphSubdirectory || '') === (dir || ''));
}

test('working_graph integration', (t) => {
  t.test('outlinks_depth=0 yields only the initial page', (st) => {
    st.equal(resultDepth0.nodes.length, 1, 'should only contain the entry node');
    st.equal(resultDepth0.nodes[0].siteNodeName, 't009 - page conf graph depth', 'entry node name');
    st.end();
  });

  t.test('blacklist cuts traversal beyond blacklisted page', (st) => {
    const blacklisted = nodeByNameAndDir(resultMain.nodes, 't007 ---- blacklisted page', '');
    const child = nodeByNameAndDir(resultMain.nodes, 't007 ---- child of blacklisted page', '');
    st.ok(blacklisted, 'blacklisted page itself should be present');
    st.notOk(child, 'child of blacklisted page should be excluded');
    st.end();
  });

  t.test('edges contain per-link details', (st) => {
    st.ok(resultMain.edges.length > 0, 'expected some edges');
    const e = resultMain.edges.find(x => x.link_original_text && x.link_resolved_target_directory !== undefined);
    st.ok(e, 'expected at least one edge with link details');
    if (e) {
      st.ok(typeof e.link_original_text === 'string' && e.link_original_text.length > 0, 'edge has link_original_text');
      st.ok(typeof e.link_resolved_target_directory === 'string', 'edge has link_resolved_target_directory');
    }
    st.end();
  });

  t.test('allInlinkSources shows source graph inlinks even when inlinks_depth=0', (st) => {
    // Page IDs use format "directory/title.file_type" or "/title.file_type" for root
    const t008PageId = '/t008 - page conf do not include inlinks.md';
    const t008InlinkSourceId = '/t008 ---- has in link to page conf test.md';

    const inlinkSources = resultMain.allInlinkSources[t008PageId] || [];
    st.ok(
      inlinkSources.includes(t008InlinkSourceId),
      't008 page should have source graph inlink from t008 ---- has in link to page conf test'
    );
    st.end();
  });

  t.end();
});

