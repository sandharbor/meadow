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

import React, { useState, useCallback } from 'react';
import Modal from '../../../../shared/components/Modal';
import { IBundleNode, LinkResolvedInfo } from '../../../../../../../contracts/types/IBundleNode';
import { Graph } from '../../../../../../../contracts/types/graph';

interface BundleNodeLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBundleNodeKey: string;
  graph: Graph;
  onSelectNode: (bundleNodeKey: string) => void;
  onDeselectNode: (bundleNodeKey: string) => void;
  selectedNodeKeys: Set<string>;
  isEffectivelySensitive: (page: IBundleNode) => boolean;
}

// Helper to parse a page ID into title (page IDs are in format: "directory/title.fileType" or "/title.fileType")
function parseBundleNodeKeyToTitle(bundleNodeKey: string): string {
  const parts = bundleNodeKey.split('/');
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}

// TODO: this should be centralized somewhere, not defined here
// Convert link_resolved_target_path to page ID format
// link_resolved_target_path: "title.md" for root, "subdir/title.md" for subdirectory
// page ID format: "/title.md" for root, "subdir/title.md" for subdirectory
function pathToBundleNodeKey(path: string): string {
  if (!path.includes('/')) {
    // Root file - add leading slash
    return `/${path}`;
  }
  return path;
}

// Status pill component for consistency
const StatusPills: React.FC<{
  page: IBundleNode;
  isEffectivelySensitive: (page: IBundleNode) => boolean;
}> = ({ page, isEffectivelySensitive }) => (
  <div className="flex flex-wrap gap-1">
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
      page.tracked
        ? 'bg-success-100 text-success-800'
        : 'bg-neutral-100 text-neutral-800'
    }`}>
      {page.tracked ? 'Tracked' : 'Not Tracked'}
    </span>
    {page.blacklisted && (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-danger-100 text-danger-800">
        Blacklisted
      </span>
    )}
    {isEffectivelySensitive(page) && (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-danger-100 text-danger-800">
        Sensitive
      </span>
    )}
    {page.isFrontierNode && (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-pink-100 text-pink-800">
        Frontier
      </span>
    )}
    {page.isFrontierImageExtension && (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-800" title="Frontier Image">
        Frontier Image
      </span>
    )}
  </div>
);

const BundleNodeLinksModal: React.FC<BundleNodeLinksModalProps> = ({
  isOpen,
  onClose,
  initialBundleNodeKey,
  graph,
  onSelectNode,
  onDeselectNode,
  selectedNodeKeys,
  isEffectivelySensitive,
}) => {
  // Navigation stack: allows navigating between pages and going back
  const [viewStack, setViewStack] = useState<string[]>([initialBundleNodeKey]);

  // Reset stack when modal opens with a new initial page
  React.useEffect(() => {
    if (isOpen) {
      setViewStack([initialBundleNodeKey]);
    }
  }, [isOpen, initialBundleNodeKey]);

  const currentBundleNodeKey = viewStack[viewStack.length - 1];
  const currentNode = graph.getNode(currentBundleNodeKey);

  const handleNavigateToNode = useCallback((bundleNodeKey: string) => {
    setViewStack(prev => [...prev, bundleNodeKey]);
  }, []);

  const handleGoBack = useCallback(() => {
    if (viewStack.length > 1) {
      setViewStack(prev => prev.slice(0, -1));
    }
  }, [viewStack.length]);

  const handleNavigateToIndex = useCallback((index: number) => {
    setViewStack(prev => prev.slice(0, index + 1));
  }, []);

  const handleClose = useCallback(() => {
    setViewStack([initialBundleNodeKey]);
    onClose();
  }, [initialBundleNodeKey, onClose]);

  if (!currentNode) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Page Links"
        className="w-4/5 max-w-4xl max-h-[85vh]"
      >
        <div className="text-sm text-gray-600">
          Page not found in the working graph.
        </div>
      </Modal>
    );
  }

  // Get outlinks from linkResolutionMap
  const linkResolutionMap = currentNode.linkResolutionMap || {};
  const outlinkEntries = Object.entries(linkResolutionMap) as [string, LinkResolvedInfo][];

  // Get inlinks from graph's allInlinkSources
  const inlinkSourceNodeKeys = graph.getAllInlinkSources(currentBundleNodeKey);
  const structuralChildren = graph.getOutgoingEdges(currentBundleNodeKey)
    .filter(edge => edge.bundleEdgeKind !== 'semanticLink')
    .map(edge => ({ edge, node: graph.getNode(edge.target) }))
    .filter((item): item is typeof item & { node: IBundleNode } => item.node !== undefined);
  const structuralParents = graph.getIncomingEdges(currentBundleNodeKey)
    .filter(edge => edge.bundleEdgeKind !== 'semanticLink')
    .map(edge => ({ edge, node: graph.getNode(edge.source) }))
    .filter((item): item is typeof item & { node: IBundleNode } => item.node !== undefined);

  // Helper to render the page path with directory in lighter color
  const renderNodePath = (bundleNodeKey: string) => {
    const lastSlashIndex = bundleNodeKey.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      // No directory part
      return <span className="font-medium">{bundleNodeKey}</span>;
    }
    const dirPart = bundleNodeKey.substring(0, lastSlashIndex + 1);
    const filePart = bundleNodeKey.substring(lastSlashIndex + 1);
    return (
      <>
        <span className="text-gray-400">{dirPart}</span>
        <span className="font-medium">{filePart}</span>
      </>
    );
  };

  // Helper to render a link item
  const renderLinkItem = (
    bundleNodeKey: string,
    _displayText: string,
    description: string,
    key: string,
    linkType: 'outlink' | 'inlink'
  ) => {
    const linkedNode = graph.getNode(bundleNodeKey);
    const isInGraph = !!linkedNode;
    const isSelected = selectedNodeKeys.has(bundleNodeKey);
    const notInGraphTooltip = (() => {
      if (linkType === 'outlink') {
        if (currentNode.blacklisted) {
          return 'This page is blacklisted, so its outlinks are not traversed';
        }
        return 'The target page is beyond the outlinks depth';
      }
      return 'The source page is beyond the inlinks depth';
    })();

    return (
      <div key={key} className={`border rounded-lg p-3 bg-gray-50 ${!isInGraph ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate" title={bundleNodeKey}>
              {renderNodePath(bundleNodeKey)}
            </div>
            {description && (
              <div className="text-xs text-gray-400 mt-0.5">
                {description}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isInGraph ? (
              <>
                <button
                  onClick={() => handleNavigateToNode(bundleNodeKey)}
                  className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                  title="View links for this page"
                >
                  Links
                </button>
                {isSelected ? (
                  <button
                    onClick={() => onDeselectNode(bundleNodeKey)}
                    className="px-2 py-1 text-xs rounded bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                  >
                    Deselect
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectNode(bundleNodeKey)}
                    className="px-2 py-1 text-xs rounded bg-success-100 text-success-700 hover:bg-success-200"
                  >
                    Select
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400 italic flex items-center gap-1">
                Not in graph
                <span className="relative group/info">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="absolute right-full top-1/2 -translate-y-1/2 mr-1 px-2 py-1 text-xs text-gray-700 bg-gray-100 border border-gray-300 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/info:opacity-100 pointer-events-none z-[100]">
                    {notInGraphTooltip}
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>

        {isInGraph && linkedNode && (
          <div className="mt-2">
            <StatusPills page={linkedNode} isEffectivelySensitive={isEffectivelySensitive} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Links: ${currentNode.bundleNodeName}`}
      className="w-4/5 max-w-4xl max-h-[85vh]"
    >
      <div className="flex flex-col h-full">
        {/* Navigation breadcrumb */}
        {viewStack.length > 1 && (
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={handleGoBack}
              className="px-3 py-1 text-sm rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 flex items-center gap-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back
            </button>
            <div className="text-sm text-gray-500 truncate">
              {viewStack.map((id, idx) => {
                const page = graph.getNode(id);
                const title = page?.bundleNodeName || parseBundleNodeKeyToTitle(id);
                const isLast = idx === viewStack.length - 1;
                return (
                  <span key={id}>
                    {isLast ? (
                      <span className="font-medium text-gray-700">{title}</span>
                    ) : (
                      <button
                        onClick={() => handleNavigateToIndex(idx)}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {title}
                      </button>
                    )}
                    {!isLast && <span className="mx-1">&rarr;</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {(structuralChildren.length > 0 || structuralParents.length > 0 || currentNode.bundleNodeKind !== 'file') && (
          <section className="mb-6 p-3 border border-blue-200 bg-blue-50 rounded-md" aria-label="Structural relationships">
            <h3 className="text-sm font-semibold text-blue-900">Structure</h3>
            <p className="text-xs text-blue-700 mt-1">
              {currentNode.bundleNodeKind === 'collection'
                ? 'This is the generated bundle home.'
                : currentNode.bundleNodeKind === 'folder'
                  ? 'This node represents source-folder containment.'
                  : 'This file is included beneath a selected folder.'}
            </p>
            {structuralParents.length > 0 && (
              <div className="mt-2 text-sm">
                <span className="font-medium">Contained by: </span>
                {structuralParents.map(({ edge, node }, index) => (
                  <React.Fragment key={`${edge.source}-${edge.target}`}>
                    {index > 0 && ', '}
                    <button className="text-blue-700 hover:underline" onClick={() => handleNavigateToNode(node.bundleNodeKey)}>
                      {node.bundleNodeName}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
            {structuralChildren.length > 0 && (
              <div className="mt-1 text-sm">
                <span className="font-medium">Contains: </span>
                {structuralChildren.map(({ edge, node }, index) => (
                  <React.Fragment key={`${edge.source}-${edge.target}`}>
                    {index > 0 && ', '}
                    <button className="text-blue-700 hover:underline" onClick={() => handleNavigateToNode(node.bundleNodeKey)}>
                      {node.bundleNodeName}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
            {currentNode.effectiveBlacklistingBundleNodeId && (
              <p className="mt-2 text-xs text-red-700">
                Excluded by folder blacklist {currentNode.effectiveBlacklistingBundleNodeId}.
              </p>
            )}
          </section>
        )}

        {/* Outlinks Section (semantic links only) */}
        <div className="mb-6">
          {(() => {
            const notInGraphCount = outlinkEntries.filter(([, info]) =>
              !info.link_resolved_target_path || !graph.getNode(pathToBundleNodeKey(info.link_resolved_target_path))
            ).length;
            return (
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Outlinks ({outlinkEntries.length})
                {notInGraphCount > 0 && (
                  <span className="font-normal text-gray-500 ml-1">
                    - {notInGraphCount} not in graph
                  </span>
                )}
              </h3>
            );
          })()}

          {outlinkEntries.length === 0 ? (
            <div className="text-sm text-gray-500 italic">No outgoing links</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {outlinkEntries.map(([linkText, resolvedInfo]) => {
                const targetPath = resolvedInfo.link_resolved_target_path;
                if (!targetPath) {
                  return (
                    <div key={linkText} className="border rounded-lg p-3 bg-gray-50">
                      <div className="font-medium text-sm">{linkText}</div>
                      <div className="text-xs text-gray-400 italic mt-1">
                        Link could not be resolved
                      </div>
                    </div>
                  );
                }

                const bundleNodeKey = pathToBundleNodeKey(targetPath);
                const title = parseBundleNodeKeyToTitle(bundleNodeKey);
                return renderLinkItem(
                  bundleNodeKey,
                  title,
                  linkText !== title ? `Link text: ${linkText}` : '',
                  `outlink-${linkText}`,
                  'outlink'
                );
              })}
            </div>
          )}
        </div>

        {/* Inlinks Section */}
        <div className="flex-1 min-h-0">
          {(() => {
            const notInGraphCount = inlinkSourceNodeKeys.filter(id => !graph.getNode(id)).length;
            return (
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Inlinks ({inlinkSourceNodeKeys.length})
                {notInGraphCount > 0 && (
                  <span className="font-normal text-gray-500 ml-1">
                    - {notInGraphCount} not in graph
                  </span>
                )}
              </h3>
            );
          })()}

          {inlinkSourceNodeKeys.length === 0 ? (
            <div className="text-sm text-gray-500 italic">No incoming links</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {inlinkSourceNodeKeys.map(sourceId => {
                const title = parseBundleNodeKeyToTitle(sourceId);
                return renderLinkItem(
                  sourceId,
                  title,
                  '',
                  `inlink-${sourceId}`,
                  'inlink'
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-btn-cancel-normal text-btn-cancel-text rounded hover:bg-btn-cancel-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default BundleNodeLinksModal;
