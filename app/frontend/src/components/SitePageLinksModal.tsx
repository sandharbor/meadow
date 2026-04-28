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
import Modal from './Modal';
import { ISitePage as IPage, LinkResolvedInfo } from '../../../shared_code/types/ISitePage';
import { Graph } from '../../../shared_code/types/graph';

interface SitePageLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPageId: string;
  graph: Graph;
  onSelectPage: (pageId: string) => void;
  onDeselectPage: (pageId: string) => void;
  selectedPages: Set<string>;
  isEffectivelySensitive: (page: IPage) => boolean;
}

// Helper to parse a page ID into title (page IDs are in format: "directory/title.file_type" or "/title.file_type")
function parsePageIdToTitle(pageId: string): string {
  const parts = pageId.split('/');
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}

// TODO: this should be centralized somewhere, not defined here
// Convert link_resolved_target_path to page ID format
// link_resolved_target_path: "title.md" for root, "subdir/title.md" for subdirectory
// page ID format: "/title.md" for root, "subdir/title.md" for subdirectory
function pathToPageId(path: string): string {
  if (!path.includes('/')) {
    // Root file - add leading slash
    return `/${path}`;
  }
  return path;
}

// Status pill component for consistency
const StatusPills: React.FC<{
  page: IPage;
  isEffectivelySensitive: (page: IPage) => boolean;
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
    {page.isFrontierPage && (
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

const SitePageLinksModal: React.FC<SitePageLinksModalProps> = ({
  isOpen,
  onClose,
  initialPageId,
  graph,
  onSelectPage,
  onDeselectPage,
  selectedPages,
  isEffectivelySensitive,
}) => {
  // Navigation stack: allows navigating between pages and going back
  const [viewStack, setViewStack] = useState<string[]>([initialPageId]);

  // Reset stack when modal opens with a new initial page
  React.useEffect(() => {
    if (isOpen) {
      setViewStack([initialPageId]);
    }
  }, [isOpen, initialPageId]);

  const currentPageId = viewStack[viewStack.length - 1];
  const currentPage = graph.getPage(currentPageId);

  const handleNavigateToPage = useCallback((pageId: string) => {
    setViewStack(prev => [...prev, pageId]);
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
    setViewStack([initialPageId]);
    onClose();
  }, [initialPageId, onClose]);

  if (!currentPage) {
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
  const linkResolutionMap = currentPage.linkResolutionMap || {};
  const outlinkEntries = Object.entries(linkResolutionMap) as [string, LinkResolvedInfo][];

  // Get inlinks from graph's allInlinkSources
  const inlinkSourceIds = graph.getAllInlinkSources(currentPageId);

  // Helper to render the page path with directory in lighter color
  const renderPagePath = (pageId: string) => {
    const lastSlashIndex = pageId.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      // No directory part
      return <span className="font-medium">{pageId}</span>;
    }
    const dirPart = pageId.substring(0, lastSlashIndex + 1);
    const filePart = pageId.substring(lastSlashIndex + 1);
    return (
      <>
        <span className="text-gray-400">{dirPart}</span>
        <span className="font-medium">{filePart}</span>
      </>
    );
  };

  // Helper to render a link item
  const renderLinkItem = (
    pageId: string,
    _displayText: string,
    description: string,
    key: string,
    linkType: 'outlink' | 'inlink'
  ) => {
    const linkedPage = graph.getPage(pageId);
    const isInGraph = !!linkedPage;
    const isSelected = selectedPages.has(pageId);
    const notInGraphTooltip = (() => {
      if (linkType === 'outlink') {
        if (currentPage.blacklisted) {
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
            <div className="text-sm truncate" title={pageId}>
              {renderPagePath(pageId)}
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
                  onClick={() => handleNavigateToPage(pageId)}
                  className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                  title="View links for this page"
                >
                  Links
                </button>
                {isSelected ? (
                  <button
                    onClick={() => onDeselectPage(pageId)}
                    className="px-2 py-1 text-xs rounded bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                  >
                    Deselect
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectPage(pageId)}
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

        {isInGraph && linkedPage && (
          <div className="mt-2">
            <StatusPills page={linkedPage} isEffectivelySensitive={isEffectivelySensitive} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Links: ${currentPage.title}`}
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
                const page = graph.getPage(id);
                const title = page?.title || parsePageIdToTitle(id);
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

        {/* Outlinks Section */}
        <div className="mb-6">
          {(() => {
            const notInGraphCount = outlinkEntries.filter(([, info]) =>
              !info.link_resolved_target_path || !graph.getPage(pathToPageId(info.link_resolved_target_path))
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

                const pageId = pathToPageId(targetPath);
                const title = parsePageIdToTitle(pageId);
                return renderLinkItem(
                  pageId,
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
            const notInGraphCount = inlinkSourceIds.filter(id => !graph.getPage(id)).length;
            return (
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Inlinks ({inlinkSourceIds.length})
                {notInGraphCount > 0 && (
                  <span className="font-normal text-gray-500 ml-1">
                    - {notInGraphCount} not in graph
                  </span>
                )}
              </h3>
            );
          })()}

          {inlinkSourceIds.length === 0 ? (
            <div className="text-sm text-gray-500 italic">No incoming links</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {inlinkSourceIds.map(sourceId => {
                const title = parsePageIdToTitle(sourceId);
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

export default SitePageLinksModal;
