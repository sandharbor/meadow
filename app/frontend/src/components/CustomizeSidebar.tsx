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

import React, { useState, useCallback, useRef } from 'react';
import GenerationOptionsPanel from './GenerationOptionsPanel';
import StylePresetsPanel from './StylePresetsPanel';
import CustomAssetsPanel from './CustomAssetsPanel';
import HooksPanel from './HooksPanel';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';

type OverrideSetting = 'inherit' | 'enabled' | 'disabled';

interface CustomizeSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  siteSlug: string;
  hooksHaveErrors: boolean;

  // Publish options
  globalGenerationOptions: {
    breadcrumbsEnabled: boolean;
    backlinksEnabled: boolean;
    tagsEnabled: boolean;
    hoverPreviewEnabled: boolean;
    markdownZipEnabled: boolean;
    spacedRepetitionEnabled: boolean;
  };
  siteGenerationOptions: {
    breadcrumbsSetting: OverrideSetting;
    backlinksSetting: OverrideSetting;
    tagsSetting: OverrideSetting;
    hoverPreviewSetting: OverrideSetting;
    markdownZipSetting: OverrideSetting;
    spacedRepetitionSetting: OverrideSetting;
  };
  globalSrsTags: string[];
  siteSrsTagsOverride: string[] | null;
  onGlobalOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', enabled: boolean) => Promise<void>;
  onSiteOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', setting: OverrideSetting) => Promise<void>;
  onGlobalSrsTagsChange: (tags: string[]) => Promise<void>;
  onSiteSrsTagsChange: (tags: string[] | null) => Promise<void>;
  onGlobalSrsEnable: (tags: string[]) => Promise<void>;
  onSiteSrsEnable: (setting: OverrideSetting, tags: string[]) => Promise<void>;
  disabled: boolean;

  // Style presets
  onPresetChanged: () => void | Promise<void>;

  // Custom assets & hooks
  onCustomAssetsChanged: () => void | Promise<void>;
  onHooksChanged: () => void | Promise<void>;

  // Impacted pages
  impactedPages: string[];
  impactedPagesTotal: number;
  onNavigateToPage: (filePath: string) => void;

  // Refresh from external changes
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;

  // Resize
  onResizeStart: (e: React.MouseEvent) => void;
}

const CustomizeSidebar: React.FC<CustomizeSidebarProps> = ({
  isOpen,
  onToggle,
  width,
  siteSlug,
  hooksHaveErrors,
  globalGenerationOptions,
  siteGenerationOptions,
  globalSrsTags,
  siteSrsTagsOverride,
  onGlobalOptionChange,
  onSiteOptionChange,
  onGlobalSrsTagsChange,
  onSiteSrsTagsChange,
  onGlobalSrsEnable,
  onSiteSrsEnable,
  disabled,
  onPresetChanged,
  onCustomAssetsChanged,
  onHooksChanged,
  impactedPages,
  impactedPagesTotal,
  onNavigateToPage,
  onRefresh,
  isRefreshing,
  onResizeStart,
}) => {
  // Key to force remount of child panels on refresh
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Agent prompt modal state
  const [agentPromptOpen, setAgentPromptOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentPromptConfigDir, setAgentPromptConfigDir] = useState('');
  const [agentPromptLoading, setAgentPromptLoading] = useState(false);
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);
  const [checkpointCommitting, setCheckpointCommitting] = useState(false);
  const [checkpointResult, setCheckpointResult] = useState<'success' | 'error' | null>(null);

  const handleOpenAgentPrompt = useCallback(async () => {
    setAgentPromptLoading(true);
    setAgentPromptOpen(true);
    setAgentPromptCopied(false);
    setCheckpointResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/hooks/agent-prompt/${siteSlug}`);
      const data = await res.json() as { prompt: string; configDir: string };
      setAgentPrompt(data.prompt);
      setAgentPromptConfigDir(data.configDir);
    } catch (err) {
      logger.error('Failed to load agent prompt:', err);
      setAgentPrompt('Failed to load agent prompt.');
    } finally {
      setAgentPromptLoading(false);
    }
  }, [siteSlug]);

  const handleCheckpointCommit = useCallback(async () => {
    setCheckpointCommitting(true);
    setCheckpointResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/hooks/agent-prompt/${siteSlug}/commit`, { method: 'POST' });
      if (res.ok) {
        setCheckpointResult('success');
      } else {
        setCheckpointResult('error');
      }
    } catch (err) {
      logger.error('Failed to create checkpoint commit:', err);
      setCheckpointResult('error');
    } finally {
      setCheckpointCommitting(false);
    }
  }, [siteSlug]);

  const handleCopyAgentPrompt = useCallback(async () => {
    try {
      await window.navigator.clipboard.writeText(agentPrompt);
      setAgentPromptCopied(true);
      setTimeout(() => setAgentPromptCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err);
    }
  }, [agentPrompt]);
  if (!isOpen) {
    return (
      <div className="border-l bg-white flex w-[40px] flex-shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full hover:bg-gray-100 focus:outline-none relative"
        >
          <div className="transform -rotate-90 whitespace-nowrap text-gray-500 text-sm">
            Customize
          </div>
          {hooksHaveErrors && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full" title="Hooks have errors" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="border-l bg-white flex flex-shrink-0 relative"
      style={{ width }}
    >
      {/* Drag handle for resizing */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-main-300 active:bg-main-400 z-10"
        onMouseDown={onResizeStart}
      />

      <div className="flex flex-col w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 flex-shrink-0">
          <span className="text-sm font-medium text-neutral-700">Customize</span>
          <button
              onClick={onToggle}
              className="text-neutral-400 hover:text-neutral-600 p-1"
              title="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          {/* Impacted pages */}
          {impactedPages.length > 0 && (
            <div className="px-3 py-2 border-b border-neutral-200 bg-blue-50">
              <div className="text-xs font-medium text-blue-700 mb-1">Pages affected:</div>
              {impactedPages.map((filePath) => {
                const fileName = filePath.split('/').pop()?.replace(/\.html$/, '') || filePath;
                return (
                  <button
                    key={filePath}
                    onClick={() => onNavigateToPage(filePath)}
                    className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:underline truncate py-0.5"
                    title={fileName}
                  >
                    {fileName}
                  </button>
                );
              })}
              {impactedPagesTotal > impactedPages.length && (
                <div className="text-xs text-blue-500 mt-0.5">
                  and {impactedPagesTotal - impactedPages.length} more
                </div>
              )}
            </div>
          )}

          <div className="mb-4 px-1 pt-2">
            <GenerationOptionsPanel
              globalOptions={globalGenerationOptions}
              siteOptions={siteGenerationOptions}
              globalSrsTags={globalSrsTags}
              siteSrsTagsOverride={siteSrsTagsOverride}
              onGlobalOptionChange={onGlobalOptionChange}
              onSiteOptionChange={onSiteOptionChange}
              onGlobalSrsTagsChange={onGlobalSrsTagsChange}
              onSiteSrsTagsChange={onSiteSrsTagsChange}
              onGlobalSrsEnable={onGlobalSrsEnable}
              onSiteSrsEnable={onSiteSrsEnable}
              disabled={disabled}
            />
          </div>
          <div className="mb-4 px-1 border-t pt-4">
            <StylePresetsPanel
              key={`presets-${refreshKey}`}
              siteSlug={siteSlug}
              onPresetChanged={onPresetChanged}
            />
          </div>
          <div className="mb-4 px-1 border-t pt-4">
            <CustomAssetsPanel key={`assets-${refreshKey}`} siteSlug={siteSlug} onCustomAssetsChanged={onCustomAssetsChanged} />
          </div>
          <div className="px-1 border-t pt-4 pb-4">
            <HooksPanel key={`hooks-${refreshKey}`} siteSlug={siteSlug} onHooksChanged={onHooksChanged} />
          </div>
          <div className="px-1 border-t pt-4 pb-4">
            <div className="px-2">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Advanced</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleOpenAgentPrompt()}
                  className="text-xs text-main-600 hover:text-main-800 hover:underline"
                >
                  Custom Assets & Hooks Agent Prompt
                </button>
                <button
                  onClick={async () => {
                    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
                    setRefreshKey(k => k + 1);
                    await onRefresh();
                    requestAnimationFrame(() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = scrollTop;
                      }
                    });
                  }}
                  disabled={isRefreshing}
                  className="text-neutral-400 hover:text-neutral-600 p-0.5 disabled:opacity-50"
                  title="Refresh from disk (use after editing files externally)"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isRefreshing ? 'animate-spin' : ''}
                  >
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Prompt Modal */}
      {agentPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-neutral-800">Custom Assets & Hooks Agent Prompt</h2>
              <button
                  onClick={() => setAgentPromptOpen(false)}
                  className="text-neutral-400 hover:text-neutral-600 p-1"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                  </svg>
                </button>
            </div>
            {!agentPromptLoading && (
              <div className="px-4 pt-3 pb-0 flex-shrink-0">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Before you start</h3>
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs text-neutral-700">
                  <div className="mb-2">
                    Meadow tracks config and data in git in <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">{agentPromptConfigDir}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleCheckpointCommit()}
                      disabled={checkpointCommitting}
                      className="px-2.5 py-1 bg-neutral-700 text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {checkpointCommitting ? 'Committing...' : 'Create checkpoint commit'}
                    </button>
                    {checkpointResult === 'success' && (
                      <span className="text-green-600">Checkpoint created</span>
                    )}
                    {checkpointResult === 'error' && (
                      <span className="text-red-600">Failed to create checkpoint</span>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => void handleCopyAgentPrompt()}
                    disabled={agentPromptLoading}
                    className="text-xs px-3 py-1.5 bg-main-600 text-white rounded hover:bg-main-700 disabled:opacity-50"
                  >
                    {agentPromptCopied ? 'Copied!' : 'Copy Prompt to Clipboard'}
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {agentPromptLoading ? (
                <div className="text-sm text-neutral-500">Loading...</div>
              ) : (
                <>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Prompt</h3>
                  <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono leading-relaxed">{agentPrompt}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomizeSidebar;
