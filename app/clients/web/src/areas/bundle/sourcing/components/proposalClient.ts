/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { apiRequest } from '../../../../shared/utils/apiClient.js';
import type { SourceProposalReview, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { CustomFilterConfig } from '../../../../../../../contracts/types/customFilters.js';
import { Graph } from '../../../../../../../contracts/types/graph.js';
import type { SourcingTypeEditorOperations } from '../../shared-sourcing-curation/exported.js';

export class ProposalRequestError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

export async function proposalRequest<T>(slug: string, operation = '', body?: unknown): Promise<T> {
  const response = await apiRequest(`bundles/${encodeURIComponent(slug)}/sourcing/proposal${operation ? `/${operation}` : ''}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw new ProposalRequestError(result.error ?? 'The proposal could not be updated.', result.code);
  return result;
}

type Context = {
  bundleSlug: string;
  current: () => SourceProposalReview;
  graph: () => Graph | null;
  mutate: (operation: string, body: Record<string, unknown>) => Promise<SourceProposalReview>;
  configure: (configuration: ProposalConfiguration) => Promise<void>;
  report: (message: string) => void;
};

/** Translate shared editor actions into isolated proposal decisions. */
export function proposalEditorOperations(context: Context): SourcingTypeEditorOperations {
  return { mode: 'sourcing', request: async (operation, options) => {
    if (operation.startsWith('source-comparison?') || operation.startsWith('source-image?')) {
      return apiRequest(`bundles/${encodeURIComponent(context.bundleSlug)}/sourcing/${operation.replace(/^source-/, '')}`);
    }
    const review = context.current();
    const draft = globalThis.structuredClone(review.proposal.proposed);
    const body = (typeof options?.body === 'string' ? JSON.parse(options.body) : {}) as {
      configs?: BundleNodeConfig[]; filter?: CustomFilterConfig; disabled?: boolean; path?: string; nodeKeys?: string[]; includeSensitive?: boolean;
    };
    const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (operation === 'custom-filters' && (!options?.method || options.method === 'GET')) return response({
      filters: [...review.configuration.globalFilters.map(filter => ({ ...filter, enabled: filter.enabled && !review.configuration.bundle.disabledGlobalFilters?.includes(filter.id) })), ...review.configuration.bundleFilters],
    });
    if (operation === 'bundle-config' && body.configs) {
      // A comparison includes departing nodes. Preserve their configuration until acceptance.
      const controls = new Set(review.proposal.proposed.nodes.filter(node => node.listType === 'blacklist').map(node => node.bundleNodeId));
      const represented = new Set(context.graph()?.getAllNodes().filter(node => node.sourceReview?.kind !== 'departing' || (node.bundleNodeId && controls.has(node.bundleNodeId))).flatMap(node => node.bundleNodeId ? [node.bundleNodeId] : []));
      const departing = new Set(context.graph()?.getAllNodes().filter(node => node.sourceReview?.kind === 'departing' && !(node.bundleNodeId && controls.has(node.bundleNodeId))).flatMap(node => node.bundleNodeId ? [node.bundleNodeId] : []));
      draft.nodes = [...draft.nodes.filter(node => !represented.has(node.bundleNodeId)), ...body.configs.filter(node => !departing.has(node.bundleNodeId))];
      await context.configure(draft);
      return response({ success: true });
    }
    if (operation === 'node/track' || operation === 'node/untrack' || operation === 'track-nodes') {
      const keys = body.nodeKeys ?? (body.path ? [body.path] : []);
      const safeKeys = operation === 'track-nodes' ? keys.filter(key => !review.trackingTargets[key]?.sensitivity) : keys;
      const result = await context.mutate('tracking', { nodeKeys: safeKeys, track: operation !== 'node/untrack', confirmSensitive: body.includeSensitive === true });
      const outcomes = keys.map(key => {
        const decision = result.proposal.tracking[key];
        const config = result.configuration.nodes.find(node => node.bundleNodeId === decision?.bundleNodeId);
        return { bundleNodeKey: key, bundleNodeId: config?.bundleNodeId, bundleNodeName: config?.bundleNodeName ?? key, config, tracked: Boolean(config && decision?.track), blacklisted: config?.listType === 'blacklist' };
      });
      const skipped = keys.filter(key => !result.trackingTargets[key] || !safeKeys.includes(key));
      if (skipped.length) context.report(`Skipped ${skipped.length} selected page${skipped.length === 1 ? '' : 's'}: ${skipped.map(key => context.graph()?.getAllNodes().find(node => node.bundleNodeKey === key)?.bundleNodeName ?? key).join(', ')}. Departing, sensitive, or unavailable pages were not tracked.`);
      return response(operation === 'track-nodes' ? { newlyTracked: outcomes.filter(node => node.tracked), alreadyTracked: [], sensitiveSkipped: [], untrackableSkipped: skipped, rejected: [] } : { node: outcomes[0] });
    }
    if (operation === 'custom-filters' && body.filter) {
      const filter = body.filter;
      draft.bundleFilters = draft.bundleFilters.filter(item => item.id !== filter.id);
      draft.globalFilters = draft.globalFilters.filter(item => item.id !== filter.id);
      draft[filter.scope === 'global' ? 'globalFilters' : 'bundleFilters'].push(filter);
    } else if (operation.startsWith('custom-filters/') && options?.method === 'DELETE') {
      const id = operation.split('/')[1].split('?')[0];
      draft.bundleFilters = draft.bundleFilters.filter(item => item.id !== id);
      draft.globalFilters = draft.globalFilters.filter(item => item.id !== id);
      draft.deletedDefaultFilterIds = [...new Set([...draft.deletedDefaultFilterIds, id])];
    } else if (operation.startsWith('disabled-global-filters/')) {
      const id = operation.split('/')[1];
      draft.bundle.disabledGlobalFilters = [...new Set([...(draft.bundle.disabledGlobalFilters ?? []).filter(item => item !== id), ...(body.disabled ? [id] : [])])];
    } else return response({ error: 'This action changes external source material. Return to curation to edit the source, then explicitly refresh this proposal.' }, 409);
    await context.configure(draft);
    return response({ success: true });
  } };
}
