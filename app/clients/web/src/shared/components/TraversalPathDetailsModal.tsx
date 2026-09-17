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

import React from 'react';
import Modal from './Modal.js';
import { IBundleNode } from '../../../../../contracts/types/IBundleNode';
import { Graph } from '../../../../../contracts/types/graph';
import { traversalLinkType, type TraversalLinkType } from '../utils/traversalLinkType.js';

interface TraversalPathDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: IBundleNode;
  graph: Graph;
  addedNodeKeys?: ReadonlySet<string>;
  manageFocus?: boolean;
}

type DepthEvent = 'set_first_time' | 'overridden' | 'inherited';

interface StepInfo {
  node: IBundleNode;
  linkType: TraversalLinkType;
  outlinksDepthEvent: DepthEvent;
  outlinksDepthValue: number | undefined;
  outlinksDepthInherited: number | undefined;
  inlinksDepthEvent: DepthEvent;
  inlinksDepthValue: number | undefined;
  inlinksDepthInherited: number | undefined;
  remainingDepth: number;
  remainingInlinksDepth: number;
  effectivePolicyName?: string;
  depth: number;
  isFrontierImageExtension: boolean;
  hasRouteValues: boolean;
}

function getDepthInfo(
  setFirstTime: number | undefined,
  overridden: number | undefined,
  inherited: number | undefined
): { event: DepthEvent; value: number | undefined; inheritedFrom: number | undefined } {
  if (setFirstTime !== undefined) {
    return { event: 'set_first_time', value: setFirstTime, inheritedFrom: undefined };
  }
  if (overridden !== undefined) {
    return { event: 'overridden', value: overridden, inheritedFrom: inherited };
  }
  return { event: 'inherited', value: inherited, inheritedFrom: undefined };
}

const LinkConnector: React.FC<{ linkType: Exclude<StepInfo['linkType'], 'start'> }> = ({ linkType }) => {
  const labels: Record<string, { arrow: string; label: string }> = {
    outlink: { arrow: '↓', label: 'outlink' },
    inlink: { arrow: '↑', label: 'inlink' },
    bidirectional: { arrow: '↕', label: 'bidirectional' },
    directoryContainment: { arrow: '↓', label: 'contained in folder' },
    collectionMembership: { arrow: '↓', label: 'selected folder' },
    unknown: { arrow: '·', label: 'direction unavailable' },
  };
  const { arrow, label } = labels[linkType];

  return (
    <div className="flex items-center gap-2 py-1.5 pl-3">
      <div className="w-5 flex justify-center">
        <div className="w-px h-6 bg-neutral-300" />
      </div>
      <span className="text-xs text-neutral-400 tracking-wide">
        {arrow} {label}
      </span>
    </div>
  );
};

const DepthBadge: React.FC<{
  label: string;
  event: DepthEvent;
  value: number | undefined;
  inheritedFrom: number | undefined;
  remaining: number;
  accentClass: string;
  bgClass: string;
  overrideBgClass: string;
  overrideBorderClass: string;
}> = ({ label, event, value, inheritedFrom, remaining, accentClass, bgClass, overrideBgClass, overrideBorderClass }) => {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md ${bgClass} min-w-0`}>
      <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {event === 'set_first_time' && value !== undefined && (
          <span className={`text-xs font-semibold ${accentClass} px-1.5 py-0.5 rounded bg-white/60`}>
            set to {value}
          </span>
        )}
        {event === 'overridden' && value !== undefined && (
          <span className={`flex items-center gap-1 ${overrideBgClass} px-2 py-0.5 rounded-md border ${overrideBorderClass}`}>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${accentClass}`}>override</span>
            {inheritedFrom !== undefined && (
              <span className="text-xs text-neutral-600">{inheritedFrom}</span>
            )}
            <span className={`${accentClass} text-sm`}>→</span>
            <span className={`text-sm font-bold ${accentClass}`}>
              {value}
            </span>
          </span>
        )}
        {event === 'inherited' && (
          <span className="text-xs text-neutral-400">inherited</span>
        )}
        <span className="text-neutral-300 mx-0.5">·</span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-neutral-400">remaining</span>
          <span className={`text-sm font-bold tabular-nums ${remaining === 0 ? 'text-neutral-300' : accentClass}`}>
            {remaining}
          </span>
        </span>
      </div>
    </div>
  );
};

function AddedTraversalBadge() {
  const helpId = React.useId();
  return <span className="group relative inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
    <span>Added</span>
    <button type="button" aria-label="About added pages" aria-describedby={helpId} className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-emerald-600 text-[9px] leading-none">?</button>
    <span id={helpId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] -ml-2 w-64 max-w-[calc(100vw-3rem)] -translate-x-full rounded border border-neutral-200 bg-white p-3 text-xs font-normal text-neutral-700 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      This page is newly included in the candidate snapshot.
    </span>
  </span>;
}

const TraversalPathDetailsModal: React.FC<TraversalPathDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedNode,
  graph,
  addedNodeKeys,
  manageFocus = false,
}) => {
  if (!selectedNode.path || selectedNode.path.length === 0) {
    return null;
  }

  const steps: StepInfo[] = selectedNode.path
    .map((bundleNodeKey, index): StepInfo | null => {
      const node = graph.getNode(bundleNodeKey);
      if (!node) return null;

      const recordedStep = selectedNode.traversal_path_steps?.[index];
      const routeStep = recordedStep?.bundleNodeKey === bundleNodeKey ? recordedStep : undefined;
      const arrival = routeStep ?? node;
      const details = arrival.traversal_details;
      const outlinksInfo = getDepthInfo(
        details?.outlinks_depth_set_first_time,
        details?.outlinks_depth_overridden,
        details?.outlinks_depth_inherited
      );
      const inlinksInfo = getDepthInfo(
        details?.inlinks_depth_set_first_time,
        details?.inlinks_depth_overridden,
        details?.inlinks_depth_inherited
      );

      const previousKey = selectedNode.path?.[index - 1];
      const linkType = routeStep?.traversal_details?.link_type && routeStep.traversal_details.link_type !== 'start'
        ? routeStep.traversal_details.link_type
        : traversalLinkType(graph, previousKey, bundleNodeKey);
      const effectivePolicyName = node.effectiveFolderPolicyBundleNodeId
        ? graph.getAllNodes().find(candidate => candidate.bundleNodeId === node.effectiveFolderPolicyBundleNodeId)?.bundleNodeName
        : undefined;
      return {
        node,
        linkType,
        outlinksDepthEvent: outlinksInfo.event,
        outlinksDepthValue: outlinksInfo.value,
        outlinksDepthInherited: outlinksInfo.inheritedFrom,
        inlinksDepthEvent: inlinksInfo.event,
        inlinksDepthValue: inlinksInfo.value,
        inlinksDepthInherited: inlinksInfo.inheritedFrom,
        remainingDepth: arrival.remaining_depth,
        remainingInlinksDepth: arrival.remaining_inlinks_depth ?? 0,
        effectivePolicyName,
        depth: arrival.depth,
        isFrontierImageExtension: Boolean(arrival.isFrontierImageExtension),
        // Older captures may lack route arrivals. Never substitute a different route's budgets.
        hasRouteValues: Boolean(routeStep) || Boolean(node.path && node.path.length === index + 1
          && node.path.every((key, step) => key === selectedNode.path?.[step])),
      };
    })
    .filter((s): s is StepInfo => s !== null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Traversal Path"
      manageFocus={manageFocus}
      className="w-4/5 max-w-3xl max-h-[85vh]"
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pr-2">
          {steps.map((step, index) => (
            <React.Fragment key={`${index}:${step.node.bundleNodeKey}`}>
              {/* Connector between steps */}
              {index > 0 && <LinkConnector linkType={step.linkType as Exclude<StepInfo['linkType'], 'start'>} />}

              {/* Step card */}
              <div className={`rounded-lg border p-3 ${
                step.hasRouteValues && step.isFrontierImageExtension
                  ? 'bg-violet-50/50 border-violet-200'
                  : index === steps.length - 1
                    ? 'bg-blue-50/40 border-blue-200'
                    : 'bg-white border-neutral-200'
              }`}>
                {/* Header row */}
                <div className="flex items-center gap-2 mb-2">
                  {/* Step number */}
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 text-[10px] font-bold flex items-center justify-center">
                    {index + 1}
                  </span>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-neutral-800 truncate min-w-0">
                    {step.node.bundleNodeName}
                  </h3>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                    {addedNodeKeys?.has(step.node.bundleNodeKey) && <AddedTraversalBadge />}
                    {step.linkType === 'start' && (
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                        start
                      </span>
                    )}
                    {step.hasRouteValues && step.isFrontierImageExtension && (
                      <span className="text-[10px] text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                        frontier image
                      </span>
                    )}
                    {step.hasRouteValues && <span className="text-[10px] text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded tabular-nums">
                      depth {step.depth}
                    </span>}
                  </div>
                </div>

                {/* Frontier image explanation */}
                {step.hasRouteValues && step.isFrontierImageExtension && (
                  <div className="mb-2 px-2.5 py-1.5 bg-violet-100/60 rounded text-[11px] text-violet-600 leading-relaxed">
                    Included because it was linked from a page at the frontier edge (remaining depth = 0).
                  </div>
                )}

                {step.node.bundleNodeKind === 'file' && step.effectivePolicyName && (
                  <div className="mb-2 rounded bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    Folder policy: {step.effectivePolicyName}.
                  </div>
                )}
                {!step.hasRouteValues && <p className="mb-2 text-[11px] text-neutral-600">
                  Depth details weren’t recorded for this step of the path.
                </p>}
                {step.hasRouteValues && step.node.bundleNodeKind === 'file' && <div className="flex flex-col gap-1">
                  <DepthBadge
                    label="outlinks"
                    event={step.outlinksDepthEvent}
                    value={step.outlinksDepthValue}
                    inheritedFrom={step.outlinksDepthInherited}
                    remaining={step.remainingDepth}
                    accentClass="text-sky-600"
                    bgClass="bg-sky-50/60"
                    overrideBgClass="bg-sky-100/80"
                    overrideBorderClass="border-sky-300"
                  />
                  <DepthBadge
                    label="inlinks"
                    event={step.inlinksDepthEvent}
                    value={step.inlinksDepthValue}
                    inheritedFrom={step.inlinksDepthInherited}
                    remaining={step.remainingInlinksDepth}
                    accentClass="text-amber-600"
                    bgClass="bg-amber-50/40"
                    overrideBgClass="bg-amber-100/80"
                    overrideBorderClass="border-amber-300"
                  />
                </div>}
              </div>
            </React.Fragment>
          ))}
        </div>

      </div>
    </Modal>
  );
};

export default TraversalPathDetailsModal;
