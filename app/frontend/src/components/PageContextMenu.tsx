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
import { useNavigate } from 'react-router-dom';
import { Graph, IPage } from '../../../shared_code/types/graph';
import { FindInSitesOptions } from '../../../shared_code/types/findInSitesOptions';
import { getSelectionChildrenOrdered, getSelectionDeeperPathsFromHereOrdered, getSelectionPathFromHereOrdered, getSelectionPathToHereOrdered } from '../utils/selectionPaths';
import { logger } from '../utils/logger';
import { openExternal } from '../utils/openExternal';
import { DisabledTooltip } from './DisabledTooltip';

export interface ObsidianInfo {
  hasObsidianVault: boolean;
  sourceDirectory: string | null;
  vaultNameGuess: string | null;
}

interface PageContextMenuProps {
  page: IPage;
  graph: Graph;
  position: { x: number; y: number };
  onClose: () => void;
  onTrackPage: (pageId: string) => void;
  onBlacklistPage: (pageId: string) => void;
  onPreviewPage: (pageId: string) => void;
  hasDraftChanges?: boolean;
  onSelectedPagesChange: (pages: Set<string>) => void;
  onMarkSensitive?: (pageId: string, isSensitive: boolean) => void;
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

const getPageRelativePath = (page: IPage): string => {
  const filename = `${page.title}.${page.file_type}`;
  if (page.sourceGraphSubdirectory && page.sourceGraphSubdirectory.trim().length > 0) {
    return joinFsPath(page.sourceGraphSubdirectory, filename);
  }
  return filename;
};

const PageContextMenu: React.FC<PageContextMenuProps> = ({
  page,
  graph,
  position,
  onClose,
  onTrackPage,
  onBlacklistPage,
  onPreviewPage,
  hasDraftChanges,
  onSelectedPagesChange,
  onMarkSensitive,
  obsidianInfo,
}) => {
  const navigate = useNavigate();
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

  const handleFindInSites = () => {
    const pathParts = page.id.split('/');
    const pageName = page.data?.title || page.label || pathParts[pathParts.length - 1];

    const findInSitesOptions: FindInSitesOptions = {
      vaultPath: '',
      folderPath: pathParts.slice(0, -1).join('/'),
      pageName: pageName,
    };

    navigate('/', { state: { findInSitesOptions } });
    onClose();
  };

  const openInObsidian = async () => {
    if (!obsidianInfo?.hasObsidianVault || !obsidianInfo.sourceDirectory) return;
    const rel = getPageRelativePath(page);
    const abs = joinFsPath(obsidianInfo.sourceDirectory, rel);
    const url = `obsidian://open?path=${encodeURIComponent(abs)}`;
    try {
      await openExternal(url, 'pageContextMenu:openInObsidian');
    } catch (err) {
      logger.warn('Failed to open in Obsidian:', err);
      window.location.href = url;
    }
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
      {page.tracked && !page.isFrontierPage && page.depth === 0 && (
        <button
          disabled
          className={disabledClass}
          title="Cannot untrack the initial page"
        >
          Untrack
        </button>
      )}
      {page.tracked && !page.isFrontierPage && page.depth !== 0 && (
        <button
          onClick={() => { onTrackPage(page.id); onClose(); }}
          className={buttonClass}
        >
          Untrack
        </button>
      )}
      {/* Add to blacklist option */}
      {page.tracked && !page.blacklisted && !page.isFrontierPage && page.depth !== 0 && (
        <button
          onClick={() => { onBlacklistPage(page.id); onClose(); }}
          className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-100 text-danger-700"
        >
          Blacklist
        </button>
      )}
      {/* Remove from blacklist option */}
      {page.blacklisted && !page.isFrontierPage && (
        <button
          onClick={() => { onBlacklistPage(page.id); onClose(); }}
          className={buttonClass}
        >
          Remove from Blacklist
        </button>
      )}
      {/* Separator if there are top items */}
      {!page.isFrontierPage && (
        <div className="border-t border-neutral-200" />
      )}
      {/* Preview HTML */}
      {(() => {
        const previewDisabled = !page.tracked || page.isFrontierPage || hasDraftChanges;
        const tooltipText = hasDraftChanges ? 'Save your unsaved changes before previewing' : page.isFrontierPage ? 'Cannot preview frontier pages' : !page.tracked ? 'Track this page first to preview it' : undefined;
        return (
          <DisabledTooltip disabled={previewDisabled} tooltip={tooltipText} className="block">
            <button
              onClick={() => { onPreviewPage(page.id); onClose(); }}
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
          onSelectedPagesChange(new Set(ordered));
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
          const ordered = getSelectionChildrenOrdered(graph, page.id);
          onSelectedPagesChange(new Set(ordered));
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
          const ordered = getSelectionPathFromHereOrdered(graph, page.id);
          onSelectedPagesChange(new Set(ordered));
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
          const ordered = getSelectionDeeperPathsFromHereOrdered(graph, page.id);
          onSelectedPagesChange(new Set(ordered));
          onClose();
        }}
        className={buttonClass}
        title="Select this page and all reachable pages at greater depth"
      >
        Select Deeper Paths from Here
      </button>
      {/* Mark sensitive / not sensitive */}
      {onMarkSensitive && (
        <button
          onClick={() => { onMarkSensitive(page.id, !page.sensitive); onClose(); }}
          className={buttonClass}
        >
          {page.sensitive ? 'Mark Not Sensitive' : 'Mark Sensitive'}
        </button>
      )}
      {/* Find in Sites */}
      <button
        onClick={handleFindInSites}
        className={buttonClass}
      >
        Find in Sites
      </button>
      {/* Open in Obsidian */}
      <button
        onClick={() => { void openInObsidian(); }}
        disabled={!obsidianInfo?.hasObsidianVault || !obsidianInfo?.sourceDirectory}
        className={
          !obsidianInfo || !obsidianInfo.hasObsidianVault || !obsidianInfo.sourceDirectory
            ? disabledClass
            : buttonClass
        }
        title={
          !obsidianInfo
            ? 'Checking for Obsidian vault...'
            : (!obsidianInfo.hasObsidianVault || !obsidianInfo.sourceDirectory)
              ? 'This site sourceDirectory is not an Obsidian vault (missing .obsidian folder)'
              : `Open "${getPageRelativePath(page)}" in Obsidian${obsidianInfo.vaultNameGuess ? ` (vault: ${obsidianInfo.vaultNameGuess})` : ''}`
        }
      >
        Open in Obsidian
      </button>
    </div>
  );
};

export default PageContextMenu;
