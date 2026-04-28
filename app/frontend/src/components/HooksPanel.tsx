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

/* global alert, confirm */
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { HookType, HookMetadata } from '../../../shared_code/types/hooks';
import { logger } from '../utils/logger';
import FloatingCodeEditor from './FloatingCodeEditor';

interface HooksPanelProps {
  siteSlug: string;
  onHooksChanged?: () => void | Promise<void>;
}

interface HookRowData {
  hookType: HookType;
  label: string;
  globalExists: boolean;
  globalHasError: boolean;
  siteExists: boolean;
  siteHasError: boolean;
  globalEnabled: boolean;
  appendMode: boolean;
}

interface OpenEditor {
  key: string; // "global:pageTitleNormalization"
  hookType: HookType;
  scope: 'global' | 'site';
  content: string;
  originalContent: string;
  isSaving: boolean;
  hasChanges: boolean;
}

const HOOK_TYPES: Array<{ type: HookType; label: string }> = [
  { type: 'pageTitleNormalization', label: 'Page Title' },
  { type: 'markdownProcessing', label: 'Markdown' },
  { type: 'htmlPostProcessing', label: 'HTML' },
];

const HOOK_LABEL: Record<HookType, string> = {
  pageTitleNormalization: 'Page Title Normalization',
  markdownProcessing: 'Markdown Processing',
  htmlPostProcessing: 'HTML Post-Processing',
};

const HooksPanel: React.FC<HooksPanelProps> = ({ siteSlug, onHooksChanged }) => {
  const [hooks, setHooks] = useState<(HookMetadata & { enabled?: boolean })[]>([]);
  const [hookAppendMode, setHookAppendMode] = useState<Record<string, boolean>>({});
  const [openEditors, setOpenEditors] = useState<Map<string, OpenEditor>>(new Map());

  const loadHooks = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/hooks/site/${siteSlug}/hooks`);
      if (response.ok) {
        const data = await response.json();
        setHooks(data.hooks || []);
        setHookAppendMode(data.hookAppendMode || {});
      }
    } catch (error) {
      logger.error('Error loading hooks:', error);
    }
  }, [siteSlug]);

  useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  const globalHooks = hooks.filter(h => h.scope === 'global');
  const siteHooks = hooks.filter(h => h.scope === 'site');

  const getRowData = (hookType: HookType, label: string): HookRowData => {
    const globalHook = globalHooks.find(h => h.hookType === hookType);
    const siteHook = siteHooks.find(h => h.hookType === hookType);
    return {
      hookType,
      label,
      globalExists: !!globalHook,
      globalHasError: !!globalHook?.error,
      siteExists: !!siteHook,
      siteHasError: !!siteHook?.error,
      globalEnabled: globalHook?.enabled !== false,
      appendMode: !!hookAppendMode[hookType],
    };
  };

  const editorKey = (scope: 'global' | 'site', hookType: HookType) => `${scope}:${hookType}`;

  const openEditor = async (hookType: HookType, scope: 'global' | 'site') => {
    const key = editorKey(scope, hookType);

    // If already open, just focus (no duplicate)
    if (openEditors.has(key)) return;

    try {
      const endpoint = scope === 'global'
        ? `${API_BASE_URL}/hooks/global/${hookType}`
        : `${API_BASE_URL}/hooks/site/${siteSlug}/hooks/${hookType}`;

      const response = await fetch(endpoint);
      let content = '';
      let originalContent = '';

      if (response.ok) {
        const metadata: HookMetadata = await response.json();
        if (metadata.exists && metadata.content) {
          content = metadata.content;
          originalContent = metadata.content;
        } else {
          // Load template for new hook
          const templateResp = await fetch(`${API_BASE_URL}/hooks/templates/${hookType}`);
          if (templateResp.ok) {
            const data = await templateResp.json();
            content = data.template || '';
          }
        }
      }

      setOpenEditors(prev => {
        const next = new Map(prev);
        next.set(key, { key, hookType, scope, content, originalContent, isSaving: false, hasChanges: content !== originalContent });
        return next;
      });
    } catch (error) {
      logger.error('Error opening hook editor:', error);
    }
  };

  const updateEditor = (key: string, updates: Partial<OpenEditor>) => {
    setOpenEditors(prev => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, ...updates });
      }
      return next;
    });
  };

  const closeEditor = (key: string) => {
    setOpenEditors(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    loadHooks();
  };

  const handleSave = async (key: string) => {
    const editor = openEditors.get(key);
    if (!editor) return;

    updateEditor(key, { isSaving: true });

    try {
      const endpoint = editor.scope === 'global'
        ? `${API_BASE_URL}/hooks/global/${editor.hookType}`
        : `${API_BASE_URL}/hooks/site/${siteSlug}/hooks/${editor.hookType}`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editor.content }),
      });

      if (response.ok) {
        updateEditor(key, { originalContent: editor.content, hasChanges: false, isSaving: false });
        loadHooks();
        void onHooksChanged?.();
      } else {
        const errorData = await response.json();
        alert(`Failed to save hook: ${errorData.error || 'Unknown error'}`);
        updateEditor(key, { isSaving: false });
      }
    } catch (error) {
      logger.error('Error saving hook:', error);
      alert('Error saving hook. Please try again.');
      updateEditor(key, { isSaving: false });
    }
  };

  const handleDelete = async (key: string) => {
    const editor = openEditors.get(key);
    if (!editor) return;
    if (!confirm(`Delete this ${editor.scope} hook?`)) return;

    try {
      const endpoint = editor.scope === 'global'
        ? `${API_BASE_URL}/hooks/global/${editor.hookType}`
        : `${API_BASE_URL}/hooks/site/${siteSlug}/hooks/${editor.hookType}`;

      const response = await fetch(endpoint, { method: 'DELETE' });
      if (response.ok) {
        closeEditor(key);
        void onHooksChanged?.();
      } else {
        alert('Failed to delete hook');
      }
    } catch (error) {
      logger.error('Error deleting hook:', error);
      alert('Error deleting hook. Please try again.');
    }
  };

  const handleToggleMode = async (hookType: HookType, mode: 'append' | 'override') => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/hooks/site/${siteSlug}/hook-mode/${hookType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }
      );
      if (response.ok) {
        loadHooks();
        void onHooksChanged?.();
      } else {
        alert('Failed to change hook mode');
      }
    } catch (error) {
      logger.error('Error changing hook mode:', error);
    }
  };

  const renderEditorToolbar = (editor: OpenEditor) => {
    if (editor.scope !== 'site') return undefined;
    const row = getRowData(editor.hookType, '');
    if (!row.globalExists) return undefined;

    const isAppend = row.appendMode;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-neutral-500">Mode:</span>
        <div className="inline-flex rounded border border-neutral-300 overflow-hidden">
          <button
            type="button"
            className={`px-2 py-0.5 ${isAppend ? 'bg-main-100 text-main-700 font-medium' : 'text-neutral-500 hover:bg-neutral-100'}`}
            onClick={() => handleToggleMode(editor.hookType, 'append')}
          >
            Append
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 border-l border-neutral-300 ${!isAppend ? 'bg-main-100 text-main-700 font-medium' : 'text-neutral-500 hover:bg-neutral-100'}`}
            onClick={() => handleToggleMode(editor.hookType, 'override')}
          >
            Override
          </button>
        </div>
        <span className="text-neutral-400">
          {isAppend ? 'Runs after global' : 'Replaces global'}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="text-sm">
        <div className="font-medium text-neutral-700 mb-3">Hooks</div>
        <div className="rounded border border-neutral-200">
          {/* Header row */}
          <div className="grid grid-cols-[1fr,60px,60px] items-center gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500">
            <span>Hook</span>
            <span className="text-center">Global</span>
            <span className="text-center">Site</span>
          </div>
          {HOOK_TYPES.map(({ type, label }) => {
            const row = getRowData(type, label);

            // Global cell display
            const globalFaded = row.siteExists && !row.appendMode;

            return (
              <div
                key={type}
                className="grid grid-cols-[1fr,60px,60px] items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-b-0"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-neutral-700 truncate">{label}</span>
                  {(row.globalHasError || row.siteHasError) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Hook has errors" />
                  )}
                </div>

                {/* Global column */}
                <button
                  type="button"
                  onClick={() => openEditor(type, 'global')}
                  className="text-xs text-center cursor-pointer hover:bg-main-50 rounded py-0.5 transition-colors group/cell"
                >
                  {row.globalExists ? (
                    globalFaded ? (
                      <span className="text-neutral-300">Off</span>
                    ) : (
                      <span className="text-success-600">On</span>
                    )
                  ) : (
                    <span className="text-neutral-300 group-hover/cell:text-main-500">{'\u2014'}</span>
                  )}
                  {row.globalHasError && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block ml-0.5" />
                  )}
                </button>

                {/* Site column */}
                <button
                  type="button"
                  onClick={() => openEditor(type, 'site')}
                  className="text-xs text-center cursor-pointer hover:bg-main-50 rounded py-0.5 transition-colors group/cell"
                >
                  {row.siteExists ? (
                    row.appendMode ? (
                      <span className="text-success-600">+</span>
                    ) : (
                      <span className="text-success-600">On</span>
                    )
                  ) : (
                    <span className="text-neutral-300 group-hover/cell:text-main-500">{'\u2014'}</span>
                  )}
                  {row.siteHasError && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block ml-0.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating editors */}
      {Array.from(openEditors.values()).map((editor, idx) => (
        <FloatingCodeEditor
          key={editor.key}
          initialOffset={idx * 30}
          title={`${HOOK_LABEL[editor.hookType]} (${editor.scope === 'global' ? 'Global' : 'Site'})`}
          language="typescript"
          content={editor.content}
          onContentChange={(code) => {
            updateEditor(editor.key, { content: code, hasChanges: code !== editor.originalContent });
          }}
          onSave={() => handleSave(editor.key)}
          onClose={() => closeEditor(editor.key)}
          onDelete={editor.originalContent ? () => handleDelete(editor.key) : undefined}
          isSaving={editor.isSaving}
          hasChanges={editor.hasChanges}
          toolbar={renderEditorToolbar(editor)}
        />
      ))}
    </>
  );
};

export default HooksPanel;
