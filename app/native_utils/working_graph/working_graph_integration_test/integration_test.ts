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
  bundleNodeKey: string;
  bundleNodeId?: string;
  bundleNodeKind: 'file' | 'folder' | 'collection';
  bundleNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: string;
  memberBundleNodeIds?: string[];
  depth: number;
};

type WorkingGraphEdge = {
  source: string;
  target: string;
  bundleEdgeKind: 'semanticLink' | 'directoryContainment' | 'collectionMembership';
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
  entryBundleNodeId: string;
  defaultTraversalBundleNodeId: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
  frontierDepth?: number;
  graphRoot?: string;
  bundleNodeConfig?: string;
}): WorkingGraphOutput {
  // Path relative to working_graph_code working directory
  const graphRoot = args.graphRoot ?? "../../../shared_data/source_graphs/meadow-test-bundles-data";
  const bundleNodeConfig = args.bundleNodeConfig ?? "../../../shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big/config/bundle_node_config.yaml";

  const cmd = [
    `cargo run --quiet --bin working_graph_bin --`,
    `--graph-root "${graphRoot}"`,
    `--bundle-node-config "${bundleNodeConfig}"`,
    `--entry-bundle-node-id "${args.entryBundleNodeId}"`,
    `--default-traversal-bundle-node-id "${args.defaultTraversalBundleNodeId}"`,
    ...(args.defaultOutlinksDepth === undefined ? [] : [`--default-outlinks-depth ${args.defaultOutlinksDepth}`]),
    ...(args.defaultInlinksDepth === undefined ? [] : [`--default-inlinks-depth ${args.defaultInlinksDepth}`]),
    `--frontier-depth ${args.frontierDepth ?? 0}`,
  ].join(' ');

  const stdout = execSync(cmd, { encoding: 'utf8', cwd: '../working_graph_code' });
  return JSON.parse(stdout) as WorkingGraphOutput;
}

const resultMain = runWorkingGraph({
  entryBundleNodeId: 'ef63f962db68',
  defaultTraversalBundleNodeId: 'ef63f962db68',
  defaultOutlinksDepth: 4,
  defaultInlinksDepth: 100,
  frontierDepth: 0
});

const resultDepth0 = runWorkingGraph({
  entryBundleNodeId: '8d86983d7f98',
  defaultTraversalBundleNodeId: '8d86983d7f98',
  defaultOutlinksDepth: 4,
  defaultInlinksDepth: 100,
  frontierDepth: 0
});

const singleFolder = runWorkingGraph({
  entryBundleNodeId: 'p1b2c3d4e5f6',
  defaultTraversalBundleNodeId: 'p1b2c3d4e5f6',
  defaultOutlinksDepth: 1,
  defaultInlinksDepth: 0,
  graphRoot: '../working_graph_integration_test/fixtures/folder-scope/source',
  bundleNodeConfig: '../working_graph_integration_test/fixtures/folder-scope/single-folder.yaml',
});

const multipleFolders = runWorkingGraph({
  entryBundleNodeId: 'c1b2c3d4e5f6',
  defaultTraversalBundleNodeId: 'c1b2c3d4e5f6',
  defaultOutlinksDepth: 1,
  defaultInlinksDepth: 0,
  graphRoot: '../working_graph_integration_test/fixtures/folder-scope/source',
  bundleNodeConfig: '../working_graph_integration_test/fixtures/folder-scope/multiple-folders.yaml',
});

function nodeByNameAndDir(nodes: WorkingGraphNode[], name: string, dir: string): WorkingGraphNode | undefined {
  return nodes.find(node => node.bundleNodeName === name && (node.sourceGraphSubdirectory || '') === (dir || ''));
}

test('working_graph integration', (t) => {
  t.test('outlinks_depth=0 yields only the initial page', (st) => {
    st.equal(resultDepth0.nodes.length, 1, 'should only contain the entry node');
    st.equal(resultDepth0.nodes[0].bundleNodeName, 't009 - page conf graph depth', 'entry node name');
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

  t.test('single-folder scope recursively seeds supported files and retains typed structure', (st) => {
    st.ok(singleFolder.nodes.some(node => node.bundleNodeKey === 'folder:Projects'), 'selected folder is present');
    st.ok(singleFolder.nodes.some(node => node.bundleNodeKey === 'folder:Projects/Sub'), 'required nested folder is present');
    st.ok(singleFolder.nodes.some(node => node.bundleNodeKey === 'Projects/A.md'), 'direct file seed is present');
    st.ok(singleFolder.nodes.some(node => node.bundleNodeKey === 'Projects/Sub/B.md'), 'nested file seed is present');
    st.ok(singleFolder.nodes.some(node => node.bundleNodeKey === 'Elsewhere/Outside.md'), 'semantic expansion outside scope is present');
    st.notOk(singleFolder.nodes.some(node => node.bundleNodeName === 'Hidden'), 'hidden descendant is omitted');
    st.ok(singleFolder.edges.some(edge => edge.bundleEdgeKind === 'directoryContainment'
      && edge.source === 'folder:Projects/Sub' && edge.target === 'Projects/Sub/B.md'), 'typed containment edge is present');
    st.end();
  });

  t.test('multiple-folder scope has one collection entry and preserves empty selected members', (st) => {
    const home = multipleFolders.nodes.find(node => node.bundleNodeKey === 'collection:c1b2c3d4e5f6');
    st.deepEqual(home?.memberBundleNodeIds, ['p1b2c3d4e5f6', 'e1b2c3d4e5f6'], 'member order is preserved');
    st.ok(multipleFolders.nodes.some(node => node.bundleNodeKey === 'folder:Empty'), 'selected empty folder is present');
    const memberships = multipleFolders.edges.filter(edge => edge.bundleEdgeKind === 'collectionMembership');
    st.deepEqual(memberships.map(edge => edge.target), ['folder:Projects', 'folder:Empty'], 'membership edges preserve selection order');
    st.end();
  });

  t.end();
});
