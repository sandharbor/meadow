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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import { isUntrackableFrontierNode } from '../../../../../../../contracts/types/IBundleNode';
import { FindInBundlesOptions } from '../../../../../../../contracts/types/findInBundlesOptions';
import { getSelectionChildrenOrdered, getSelectionDeeperPathsFromHereOrdered, getSelectionPathFromHereOrdered, getSelectionPathToHereOrdered } from '../utils/selectionPaths';
import { openExternal } from '../../../../shared/utils/openExternal';
import { useAppNavigation } from '../../../../shared/utils/appNavigation';
import { DisabledTooltip } from '../../../../shared/components/DisabledTooltip';

interface SourceObsidianInfo {
  hasObsidianVault: boolean;
  sourceDirectory: string | null;
  vaultNameGuess: string | null;
}

export interface ObsidianInfo extends SourceObsidianInfo {
  sources?: Record<string, SourceObsidianInfo>;
}

export const canMarkNodeSensitive = (node: IBundleNode): boolean =>
  node.bundleNodeKind === 'file' && node.fileType === 'md';

export const canFindNodeInBundles = (node: IBundleNode): boolean =>
  node.bundleNodeKind === 'file';

interface BundleNodeContextMenuProps {
  page: IBundleNode;
  graph: Graph;
  position: { x: number; y: number };
  onClose: () => void;
  onTrackPage: (bundleNodeKey: string) => void;
  onBlacklistPage: (bundleNodeKey: string) => void;
  onPreviewPage: (bundleNodeKey: string) => void;
  hasDraftChanges?: boolean;
  onSelectedNodeKeysChange: (pages: Set<string>) => void;
  onMarkSensitive?: (bundleNodeKey: string, isSensitive: boolean) => void;
  obsidianInfo: ObsidianInfo | null;
}

const joinFsPath = (...parts: Array<string | null | undefined>): string => {
  const filtered = parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map(p => p.replace(/^\/+|\/+$/g, ''));
  const hasLeadingSlash = (parts[0] || '').startsWith('/');
  const joined = filtered.join('/');
  return hasLeadingSlash ? `/${joined}` : joined;
};

const getPageRelativePath = (page: IBundleNode): string => {
  const filename = `${page.bundleNodeName}.${page.fileType}`;
  if (page.sourceGraphSubdirectory && page.sourceGraphSubdirectory.trim().length > 0) {
    return joinFsPath(page.sourceGraphSubdirectory, filename);
  }
  return filename;
};

const BundleNodeContextMenu: React.FC<BundleNodeContextMenuProps> = ({
  page,
  graph,
  position,
  onClose,
  onTrackPage,
  onBlacklistPage,
  onPreviewPage,
  hasDraftChanges,
  onSelectedNodeKeysChange,
  onMarkSensitive,
  obsidianInfo,
}) => {
  const isUntrackableFrontier = isUntrackableFrontierNode(page);
  const navigateInApp = useAppNavigation('pageContextMenu');
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedTop, setAdjustedTop] = useState(position.y);

  // After render, check if the menu overflows the viewport and shift up if needed
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuHeight = menuRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;
      if (position.y + menuHeight > viewportHeight) {
        setAdjustedTop(Math.max(0, viewportHeight - menuHeight));
      } else {
        setAdjustedTop(position.y);
      }
    }
  }, [position.y]);

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleFindInBundles = () => {
    if (!canFindNodeInBundles(page)) return;

    const sourceDirectory = graph.sources.find(source => source.id === page.sourceId)?.directory
      ?? obsidianInfo?.sourceDirectory ?? '';
    const findInBundlesOptions: FindInBundlesOptions = {
      vaultPath: sourceDirectory,
      folderPath: page.sourceGraphSubdirectory ?? '',
      pageName: page.bundleNodeName,
    };

    navigateInApp({ page: 'bundle-list', findInBundlesOptions });
    onClose();
  };

  const pageObsidianInfo = page.sourceId ? obsidianInfo?.sources?.[page.sourceId] : obsidianInfo;
  const openInObsidian = async () => {
    if (!pageObsidianInfo?.hasObsidianVault || !pageObsidianInfo.sourceDirectory) return;
    const rel = getPageRelativePath(page);
    const abs = joinFsPath(pageObsidianInfo.sourceDirectory, rel);
    const url = `obsidian://open?path=${encodeURIComponent(abs)}`;
    await openExternal(url, 'pageContextMenu:openInObsidian');
    onClose();
  };

  const buttonClass = "w-full text-left px-3 py-2 text-xs hover:bg-neutral-100";
  const disabledClass = "w-full text-left px-3 py-2 text-xs text-neutral-400 cursor-not-allowed";

  return (
    <div
      ref={menuRef}
      className="fixed w-48 bg-white border border-neutral-200 rounded-md shadow-lg z-50"
      style={{ left: position.x, top: adjustedTop }}
    >
      {/* Untrack option if already tracked */}
      {page.tracked && !isUntrackableFrontier && page.depth === 0 && (
        <button
          disabled
          className={disabledClass}
          title="Cannot untrack the initial page"
        >
          Untrack
        </button>
      )}
      {page.tracked && !isUntrackableFrontier && page.depth !== 0 && (
        <button
          onClick={() => { onTrackPage(page.bundleNodeKey); onClose(); }}
          className={buttonClass}
        >
          Untrack
        </button>
      )}
      {/* Add to blacklist option */}
      {page.tracked && !page.blacklisted && !isUntrackableFrontier && page.depth !== 0 && (
        <button
          onClick={() => { onBlacklistPage(page.bundleNodeKey); onClose(); }}
          className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-100 text-danger-700"
        >
          Blacklist
        </button>
      )}
      {/* Remove from blacklist option */}
      {page.blacklisted && !isUntrackableFrontier && (
        <button
          onClick={() => { onBlacklistPage(page.bundleNodeKey); onClose(); }}
          className={buttonClass}
        >
          Remove from Blacklist
        </button>
      )}
      {/* Separator if there are top items */}
      {!isUntrackableFrontier && (
        <div className="border-t border-neutral-200" />
      )}
      {/* Preview HTML */}
      {(() => {
        const previewDisabled = !page.tracked || isUntrackableFrontier || hasDraftChanges;
        const tooltipText = hasDraftChanges ? 'Save your unsaved changes before previewing' : isUntrackableFrontier ? 'Cannot preview frontier pages' : !page.tracked ? 'Track this page first to preview it' : undefined;
        return (
          <DisabledTooltip disabled={previewDisabled} tooltip={tooltipText} className="block">
            <button
              onClick={() => { onPreviewPage(page.bundleNodeKey); onClose(); }}
              disabled={previewDisabled}
              className={previewDisabled ? disabledClass : buttonClass}
            >
              Preview HTML
            </button>
          </DisabledTooltip>
        );
      })()}
      {/* Select path to here */}
      <button
        onClick={() => {
          const ordered = getSelectionPathToHereOrdered(page);
          onSelectedNodeKeysChange(new Set(ordered));
          onClose();
        }}
        className={buttonClass}
        title="Select all pages in the traversal path to this page"
      >
        Select Path to Here
      </button>
      {/* Select children */}
      <button
        onClick={() => {
          const ordered = getSelectionChildrenOrdered(graph, page.bundleNodeKey);
          onSelectedNodeKeysChange(new Set(ordered));
          onClose();
        }}
        className={buttonClass}
        title="Select this page and its direct children (one level deeper)"
      >
        Select Children
      </button>
      {/* Select all paths from here */}
      <button
        onClick={() => {
          const ordered = getSelectionPathFromHereOrdered(graph, page.bundleNodeKey);
          onSelectedNodeKeysChange(new Set(ordered));
          onClose();
        }}
        className={buttonClass}
        title="Select this page and all reachable descendants from it"
      >
        Select All Paths from Here
      </button>
      {/* Select deeper paths from here */}
      <button
        onClick={() => {
          const ordered = getSelectionDeeperPathsFromHereOrdered(graph, page.bundleNodeKey);
          onSelectedNodeKeysChange(new Set(ordered));
          onClose();
        }}
        className={buttonClass}
        title="Select this page and all reachable pages at greater depth"
      >
        Select Deeper Paths from Here
      </button>
      {/* Mark sensitive / not sensitive */}
      {onMarkSensitive && canMarkNodeSensitive(page) && (
        <button
          onClick={() => { onMarkSensitive(page.bundleNodeKey, !page.sensitive); onClose(); }}
          className={buttonClass}
        >
          {page.sensitive ? 'Mark Not Sensitive' : 'Mark Sensitive'}
        </button>
      )}
      {/* Find in Bundles */}
      {canFindNodeInBundles(page) && (
        <button
          onClick={handleFindInBundles}
          className={buttonClass}
        >
          Find in Bundles
        </button>
      )}
      {/* Open in Obsidian */}
      <button
        onClick={() => { void openInObsidian(); }}
        disabled={!pageObsidianInfo?.hasObsidianVault || !pageObsidianInfo?.sourceDirectory}
        className={
          !pageObsidianInfo || !pageObsidianInfo.hasObsidianVault || !pageObsidianInfo.sourceDirectory
            ? disabledClass
            : buttonClass
        }
        title={
          !pageObsidianInfo
            ? 'Checking for Obsidian vault...'
            : (!pageObsidianInfo.hasObsidianVault || !pageObsidianInfo.sourceDirectory)
              ? 'This page’s source is not an Obsidian vault (missing .obsidian folder)'
              : `Open "${getPageRelativePath(page)}" in Obsidian${pageObsidianInfo.vaultNameGuess ? ` (vault: ${pageObsidianInfo.vaultNameGuess})` : ''}`
        }
      >
        Open in Obsidian
      </button>
    </div>
  );
};

export default BundleNodeContextMenu;
