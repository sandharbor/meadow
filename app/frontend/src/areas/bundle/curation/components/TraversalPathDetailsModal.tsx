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
import Modal from '../../../../shared/components/Modal';
import { IBundleNode } from '../../../../../../shared_code/types/IBundleNode';
import { Graph } from '../../../../../../shared_code/types/graph';

interface TraversalPathDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: IBundleNode;
  graph: Graph;
}

type DepthEvent = 'set_first_time' | 'overridden' | 'inherited';

interface StepInfo {
  node: IBundleNode;
  linkType: 'start' | 'outlink' | 'inlink' | 'bidirectional' | 'directoryContainment' | 'collectionMembership';
  outlinksDepthEvent: DepthEvent;
  outlinksDepthValue: number | undefined;
  outlinksDepthInherited: number | undefined;
  inlinksDepthEvent: DepthEvent;
  inlinksDepthValue: number | undefined;
  inlinksDepthInherited: number | undefined;
  remainingDepth: number;
  remainingInlinksDepth: number;
  isSemanticSeed: boolean;
  effectivePolicyName?: string;
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
              <span className="text-xs text-neutral-400 line-through decoration-2">{inheritedFrom}</span>
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

const TraversalPathDetailsModal: React.FC<TraversalPathDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedNode,
  graph,
}) => {
  if (!selectedNode.path || selectedNode.path.length === 0) {
    return null;
  }

  const steps: StepInfo[] = selectedNode.path
    .map((bundleNodeKey, index): StepInfo | null => {
      const node = graph.getNode(bundleNodeKey);
      if (!node) return null;

      const details = node.traversal_details;
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
      const incomingEdge = previousKey
        ? graph.getOutgoingEdges(previousKey).find(edge => edge.target === bundleNodeKey)
        : undefined;
      const linkType = index === 0
        ? 'start'
        : incomingEdge?.bundleEdgeKind !== 'semanticLink'
          ? incomingEdge?.bundleEdgeKind ?? 'outlink'
          : details?.link_type ?? 'outlink';
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
        remainingDepth: node.remaining_depth,
        remainingInlinksDepth: node.remaining_inlinks_depth ?? 0,
        isSemanticSeed: node.bundleNodeKind === 'file'
          && (linkType === 'directoryContainment' || linkType === 'collectionMembership' || index === 0)
          && details?.link_type === 'start',
        effectivePolicyName,
      };
    })
    .filter((s): s is StepInfo => s !== null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Traversal Path"
      className="w-4/5 max-w-3xl max-h-[85vh]"
    >
      <div className="flex flex-col h-full">
        <div className="mb-4 text-xs text-neutral-500">
          How Meadow reached <span className="font-medium text-neutral-700">{selectedNode.bundleNodeName}</span> through selected-folder structure and seeded semantic traversal.
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {steps.map((step, index) => (
            <React.Fragment key={step.node.bundleNodeKey}>
              {/* Connector between steps */}
              {index > 0 && <LinkConnector linkType={step.linkType as Exclude<StepInfo['linkType'], 'start'>} />}

              {/* Step card */}
              <div className={`rounded-lg border p-3 ${
                step.node.isFrontierImageExtension
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
                    {step.linkType === 'start' && (
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                        start
                      </span>
                    )}
                    {step.isSemanticSeed && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        semantic seed
                      </span>
                    )}
                    {step.node.isFrontierImageExtension && (
                      <span className="text-[10px] text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                        frontier image
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-400 bg-neutral-50 px-1.5 py-0.5 rounded tabular-nums">
                      depth {step.node.depth}
                    </span>
                  </div>
                </div>

                {/* Frontier image explanation */}
                {step.node.isFrontierImageExtension && (
                  <div className="mb-2 px-2.5 py-1.5 bg-violet-100/60 rounded text-[11px] text-violet-600 leading-relaxed">
                    Included because it was linked from a page at the frontier edge (remaining depth = 0).
                  </div>
                )}

                {step.node.bundleNodeKind === 'file' && (
                  <div className="mb-2 rounded bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    Effective folder policy: {step.effectivePolicyName ?? 'bundle defaults'}.
                    {step.isSemanticSeed ? ' Structural steps cost zero; semantic budgets begin here.' : ''}
                  </div>
                )}
                {step.node.bundleNodeKind === 'file' && <div className="flex flex-col gap-1">
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
                {(step.node.traversal_states?.length ?? 0) > 1 && (
                  <div className="mt-2 text-[11px] text-neutral-500">
                    Non-dominated remaining states: {step.node.traversal_states!
                      .map(state => `out ${state.remaining_outlinks_depth} / in ${state.remaining_inlinks_depth}`)
                      .join(', ')}
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>

      </div>
    </Modal>
  );
};

export default TraversalPathDetailsModal;
