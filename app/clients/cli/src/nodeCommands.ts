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

type RequestJson = (
  pathname: string,
  method: 'GET' | 'POST',
  body?: unknown,
) => Promise<unknown>;

interface ParsedNodeCommand {
  operation: string;
  slug: string;
  locator: { nodeId: string } | { path: string };
  depths?: { outlinksDepth?: number | null; inlinksDepth?: number | null };
}

const OPERATIONS = new Set([
  'describe',
  'track',
  'untrack',
  'blacklist',
  'unblacklist',
  'mark-sensitive',
  'mark-not-sensitive',
  'find-in-bundles',
  'set-depths',
]);

export function showBundleNodeHelp(): void {
  console.log(`Usage:
  meadow bundle node describe <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node track <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node untrack <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node blacklist <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node unblacklist <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node mark-sensitive <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node mark-not-sensitive <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node find-in-bundles <bundle-slug> (--id <bundle-node-id> | --path <node-path>)
  meadow bundle node set-depths <bundle-slug> (--id <bundle-node-id> | --path <node-path>) [depths]

Node identity:
  --id <bundle-node-id>    Preferred stable ID returned after a node is tracked.
  --path <node-path>       Source-relative path or exact bundleNodeKey returned
                           by 'meadow bundle nodes <slug> --scope all'.

Depths:
  --outlinks <depth|inherit>   Set an outlink-depth override or remove it.
  --inlinks <depth|inherit>    Set an inlink-depth override or remove it.

Examples:
  meadow bundle node track my-site --path "Charlie Munger.md"
  meadow bundle node blacklist my-site --id <bundle-node-id>
  meadow bundle node set-depths my-site --id <bundle-node-id> --outlinks 1 --inlinks 0

Operations are safe to retry. 'describe' returns the node plus path-to-here,
direct children, all reachable paths, and deeper paths. Every related-node
reference includes its path key and graph depth.`);
}

function parseDepth(option: string, value: string | undefined): number | null {
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a depth or 'inherit'`);
  if (value === 'inherit') return null;
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error(`${option} must be a non-negative integer or 'inherit'`);
  }
  return depth;
}

function parseNodeCommand(args: string[]): ParsedNodeCommand {
  const operation = args[0];
  const slug = args[1];
  if (!operation || !OPERATIONS.has(operation) || !slug || slug.startsWith('--')) {
    throw new Error("Usage: meadow bundle node <operation> <bundle-slug> (--id <id> | --path <path>)");
  }
  let nodeId: string | undefined;
  let path: string | undefined;
  let outlinksDepth: number | null | undefined;
  let inlinksDepth: number | null | undefined;
  for (let index = 2; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === '--id' || option === '--path') {
      if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
      if (option === '--id') {
        if (nodeId !== undefined) throw new Error('--id may only be provided once');
        nodeId = value;
      } else {
        if (path !== undefined) throw new Error('--path may only be provided once');
        path = value;
      }
      index += 1;
      continue;
    }
    if (option === '--outlinks' || option === '--inlinks') {
      if (operation !== 'set-depths') {
        throw new Error(`${option} is only valid for the set-depths operation`);
      }
      if (option === '--outlinks') {
        if (outlinksDepth !== undefined) throw new Error('--outlinks may only be provided once');
        outlinksDepth = parseDepth(option, value);
      } else {
        if (inlinksDepth !== undefined) throw new Error('--inlinks may only be provided once');
        inlinksDepth = parseDepth(option, value);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}. Run 'meadow bundle node --help'.`);
  }
  if ((nodeId === undefined) === (path === undefined)) {
    throw new Error('Provide exactly one of --id or --path');
  }
  if (operation === 'set-depths' && outlinksDepth === undefined && inlinksDepth === undefined) {
    throw new Error("set-depths requires --outlinks and/or --inlinks");
  }
  return {
    operation,
    slug,
    locator: nodeId === undefined ? { path: path! } : { nodeId },
    ...(operation === 'set-depths' && {
      depths: { outlinksDepth, inlinksDepth },
    }),
  };
}

export async function runBundleNodeCommand(
  args: string[],
  requestJson: RequestJson,
): Promise<void> {
  const command = parseNodeCommand(args);
  const response = await requestJson(
    `/bundles/${encodeURIComponent(command.slug)}/curation/node/${command.operation}`,
    'POST',
    { ...command.locator, ...command.depths },
  );
  const expectedOperation = `bundle.node.${command.operation}`;
  if (
    typeof response !== 'object'
    || response === null
    || (response as { operation?: unknown }).operation !== expectedOperation
  ) {
    throw new Error(`Meadow returned an invalid node ${command.operation} response.`);
  }
  console.log(JSON.stringify(response, null, 2));
}
