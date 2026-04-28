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

import React, { useState, useRef, useEffect } from 'react';
import { Graph, IPage } from '../../../shared_code/types/graph';
import CopySelectedPagesModal from './CopySelectedPagesModal';

interface SitePageTabsDropdownProps {
  selectedPages: Set<string>;
  graph: Graph;
  onRefresh: () => void;
}

const SitePageTabsDropdown: React.FC<SitePageTabsDropdownProps> = ({
  selectedPages,
  graph,
  onRefresh,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected pages as raw IPage objects
  const getSelectedPages = (): IPage[] => {
    return Array.from(selectedPages)
      .map(id => graph.getPage(id))
      .filter(Boolean) as IPage[];
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleCopyAsClick = () => {
    setIsCopyModalOpen(true);
    closeMenu();
  };

  const hasSelection = selectedPages.size > 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="px-2 py-1 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded"
            title="More options"
          >
            ...
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
              <div className="py-1">
                {/* Copy as... button */}
                <button
                  onClick={handleCopyAsClick}
                  disabled={!hasSelection}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    !hasSelection
                      ? 'text-neutral-400 cursor-not-allowed'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  Copy as...
                </button>

                {/* Refresh */}
                <button
                  onClick={() => {
                    onRefresh();
                    closeMenu();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CopySelectedPagesModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        selectedPages={getSelectedPages()}
      />
    </>
  );
};

export default SitePageTabsDropdown;
