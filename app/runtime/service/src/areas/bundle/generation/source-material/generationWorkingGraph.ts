/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BundleConfig } from '../../../../../../../contracts/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { sourceGraphPath, sourceOutputDirectory } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import type { WorkingGraphRustOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { runWorkingGraphRaw, type WorkingGraphRunArgs } from '../../../../shared/utils/workingGraphUtils.js';
import { sourceForOutputPath, sourceOutputGraphPath } from './sourceOutputProjection.js';

/** Resolve processed generation material with its registry, then project all graph identities. */
export async function runGenerationWorkingGraph(args: WorkingGraphRunArgs, config: BundleConfig): Promise<string> {
  if (!config.sources) return await runWorkingGraphRaw(args);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-generation-graph-'));
  try {
    const sources = config.sources.map(source => ({ ...source, directory: path.join(scratch, source.id) }));
    for (const source of sources) {
      const input = path.join(args.graphRoot, sourceOutputDirectory(config, source.id, ''));
      if (fs.existsSync(input)) fs.cpSync(input, source.directory, { recursive: true });
      else fs.mkdirSync(source.directory, { recursive: true });
    }
    const tagRoot = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
    if (config.sourceOutputLayout && fs.existsSync(path.join(args.graphRoot, tagRoot))) {
      fs.cpSync(path.join(args.graphRoot, tagRoot), path.join(sources[0].directory, tagRoot), { recursive: true });
    }
    const nodes = parseBundleNodeConfig(fs.readFileSync(args.bundleNodeConfigPath, 'utf8')).map(node => {
      if (node.bundleNodeKind === 'collection') return node;
      const { sourceId, relativePath } = sourceForOutputPath(config, node.sourceGraphSubdirectory ?? '');
      return { ...node, sourceId, sourceGraphSubdirectory: relativePath };
    });
    const filename = path.join(scratch, 'nodes.yaml');
    fs.writeFileSync(filename, stringifyBundleNodeConfig(nodes));
    const output = JSON.parse(await runWorkingGraphRaw({ ...args, graphRoot: scratch, sources,
      immutableSource: true, bundleNodeConfigPath: filename })) as WorkingGraphRustOutput;
    const project = (value: string) => sourceOutputGraphPath(config, value);
    const projectKey = (value: string) => {
      const mapped = project(value);
      return mapped.includes('/') || mapped.startsWith('folder:') || mapped.startsWith('collection:') ? mapped : `/${mapped}`;
    };
    const adjacency = (map: Record<string, string[]>) => Object.fromEntries(Object.entries(map).map(([key, values]) => [projectKey(key), values.map(projectKey)]));
    const steps = (route: NonNullable<WorkingGraphRustOutput['nodes'][number]['traversal_path_steps']>) => route.map(step => ({ ...step, bundleNodeKey: projectKey(step.bundleNodeKey) }));
    return JSON.stringify({ ...output,
      nodes: output.nodes.map(node => {
        const { sourceId, ...projected } = node;
        return { ...projected, bundleNodeKey: projectKey(node.bundleNodeKey),
          ...(sourceId && { sourceGraphSubdirectory: project(sourceGraphPath(sourceId, node.sourceGraphSubdirectory ?? '')) }),
          ...(node.sourceFile && { sourceFile: { ...node.sourceFile, path: project(node.sourceFile.path) } }),
          path: node.path.map(projectKey),
          ...(node.traversal_path_steps && { traversal_path_steps: steps(node.traversal_path_steps) }),
          ...(node.traversal_alternative_routes && { traversal_alternative_routes: node.traversal_alternative_routes.map(steps) }),
        };
      }),
      edges: output.edges.map(edge => ({ ...edge, source: projectKey(edge.source), target: projectKey(edge.target) })),
      allInlinkSources: adjacency(output.allInlinkSources), allOutlinkTargets: adjacency(output.allOutlinkTargets),
      allLinkResolutionMaps: Object.fromEntries(Object.entries(output.allLinkResolutionMaps).map(([key, links]) => [projectKey(key),
        Object.fromEntries(Object.entries(links).map(([text, target]) => [text, { ...target,
          link_resolved_target_directory: target.link_resolved_target_path ? project(target.link_resolved_target_directory) : '',
          link_resolved_target_path: target.link_resolved_target_path ? project(target.link_resolved_target_path) : null,
        }]))])),
      sourceDiagnostics: output.sourceDiagnostics?.map(diagnostic => ({ ...diagnostic, path: project(diagnostic.path) })),
      folderScope: undefined,
    });
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
