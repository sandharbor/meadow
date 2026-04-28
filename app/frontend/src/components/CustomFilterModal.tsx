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
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { CustomFilterConfig, CustomPageSelectorConfig, CustomFilterAction, SelectorField, SelectorMatchType } from '../../../shared_code/types/customFilters';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';

interface CustomFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  siteSlug: string;
  existingFilter?: CustomFilterConfig | null;
}

const CustomFilterModal: React.FC<CustomFilterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  siteSlug,
  existingFilter
}) => {
  const [filterName, setFilterName] = useState('');
  const [filterNote, setFilterNote] = useState('');
  const [filterScope, setFilterScope] = useState<'global' | 'site'>('site');
  const [selectors, setSelectors] = useState<CustomPageSelectorConfig[]>([
    { field: 'title', matchType: 'substring', value: '', caseSensitive: false }
  ]);
  const [selectorCriteria, setSelectorCriteria] = useState<'union' | 'intersection'>('union');
  const [actions, setActions] = useState<CustomFilterAction[]>([
    { type: 'highlight', color: '#FFD700', isDashed: false }
  ]);
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when modal opens/closes or existing filter changes
  useEffect(() => {
    if (isOpen) {
      if (existingFilter) {
        setFilterName(existingFilter.name);
        setFilterNote(existingFilter.note || '');
        setFilterScope(existingFilter.scope);
        setSelectors(existingFilter.selectors);
        setSelectorCriteria(existingFilter.selectorApplicationCriteria);
        setActions(existingFilter.actions);
        setEnabled(existingFilter.enabled);
      } else {
        setFilterName('');
        setFilterNote('');
        setFilterScope('site');
        setSelectors([{ field: 'title', matchType: 'substring', value: '', caseSensitive: false }]);
        setSelectorCriteria('union');
        setActions([{ type: 'highlight', color: '#FFD700', isDashed: false }]);
        setEnabled(true);
      }
    }
  }, [isOpen, existingFilter]);

  const addSelector = () => {
    setSelectors([...selectors, { field: 'title', matchType: 'substring', value: '', caseSensitive: false }]);
  };

  const removeSelector = (index: number) => {
    if (selectors.length > 1) {
      setSelectors(selectors.filter((_, i) => i !== index));
    }
  };

  const updateSelector = (index: number, updates: Partial<CustomPageSelectorConfig>) => {
    const newSelectors = [...selectors];
    newSelectors[index] = { ...newSelectors[index], ...updates };
    setSelectors(newSelectors);
  };

  const addAction = () => {
    setActions([...actions, { type: 'highlight', color: '#FFD700', isDashed: false }]);
  };

  const removeAction = (index: number) => {
    if (actions.length > 1) {
      setActions(actions.filter((_, i) => i !== index));
    }
  };

  const updateAction = (index: number, updates: Partial<CustomFilterAction>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    setActions(newActions);
  };

  const handleSave = async () => {
    if (!filterName.trim()) {
      alert('Filter name is required');
      return;
    }

    if (selectors.some(s => !s.value.trim())) {
      alert('All selectors must have a value');
      return;
    }

    setIsSaving(true);

    try {
      const filterId = existingFilter?.id || `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      const filterConfig: CustomFilterConfig = {
        id: filterId,
        name: filterName.trim(),
        ...(filterNote.trim() ? { note: filterNote.trim() } : {}),
        scope: filterScope,
        selectors,
        selectorApplicationCriteria: selectorCriteria,
        actions,
        enabled,
        createdAt: existingFilter?.createdAt || now,
        updatedAt: now
      };

      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/custom-filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: filterConfig })
      });

      if (!response.ok) {
        throw new Error('Failed to save custom filter');
      }

      onSave();
      onClose();
    } catch (error) {
      logger.error('Error saving custom filter:', error);
      alert('Error saving custom filter. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingFilter) return;

    if (!confirm(`Are you sure you want to delete the filter "${existingFilter.name}"?`)) {
      return;
    }

    setIsDeleting(true);

    try {
      const deleteResponse = await fetch(
        `${API_BASE_URL}/site/${siteSlug}/custom-filters/${existingFilter.id}?scope=${existingFilter.scope}`,
        { method: 'DELETE' }
      );

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete custom filter');
      }

      if (onDelete) {
        onDelete();
      }
      onClose();
    } catch (error) {
      logger.error('Error deleting custom filter:', error);
      alert('Error deleting custom filter. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={existingFilter ? 'Edit Custom Filter' : 'Create Custom Filter'}
      className="w-4/5 max-w-4xl max-h-[85vh]"
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 min-h-0" style={{ maxHeight: '60vh' }}>
        {/* Basic Settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter Name
            </label>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
              placeholder="Enter filter name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="font-normal text-gray-400">(shown on hover)</span>
            </label>
            <input
              type="text"
              value={filterNote}
              onChange={(e) => setFilterNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
              placeholder="Optional description shown when hovering over the filter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scope
            </label>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value as 'global' | 'site')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
            >
              <option value="site">Site-specific</option>
              <option value="global">Global (all sites)</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
              Enable this filter
            </label>
          </div>
        </div>

        {/* Selectors */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium text-gray-900">Page Selectors</h4>
            <button
              onClick={addSelector}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Selector
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selector Application
            </label>
            <select
              value={selectorCriteria}
              onChange={(e) => setSelectorCriteria(e.target.value as 'union' | 'intersection')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
            >
              <option value="union">Union (any selector matches)</option>
              <option value="intersection">Intersection (all selectors must match)</option>
            </select>
          </div>

          {selectors.map((selector, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-medium text-gray-800">Selector {index + 1}</h5>
                {selectors.length > 1 && (
                  <button
                    onClick={() => removeSelector(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Field
                  </label>
                  <select
                    value={selector.field}
                    onChange={(e) => updateSelector(index, { field: e.target.value as SelectorField })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                  >
                    <option value="title">Title</option>
                    <option value="path">Path</option>
                    <option value="content">Content</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Match Type
                  </label>
                  <select
                    value={selector.matchType}
                    onChange={(e) => updateSelector(index, { matchType: e.target.value as SelectorMatchType })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                  >
                    <option value="substring">Substring</option>
                    <option value="regex">Regex</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Value
                </label>
                <input
                  type="text"
                  value={selector.value}
                  onChange={(e) => updateSelector(index, { value: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                  placeholder={selector.matchType === 'regex' ? 'Enter regex pattern' : 'Enter search text'}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id={`case-sensitive-${index}`}
                  checked={selector.caseSensitive || false}
                  onChange={(e) => updateSelector(index, { caseSensitive: e.target.checked })}
                  className="h-3 w-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor={`case-sensitive-${index}`} className="ml-2 text-xs text-gray-600">
                  Case sensitive
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium text-gray-900">Actions</h4>
            <button
              onClick={addAction}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Action
            </button>
          </div>

          {actions.map((action, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-medium text-gray-800">Action {index + 1}</h5>
                {actions.length > 1 && (
                  <button
                    onClick={() => removeAction(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Action Type
                </label>
                <select
                  value={action.type}
                  onChange={(e) => updateAction(index, { type: e.target.value as CustomFilterAction['type'] })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                >
                  <option value="highlight">Highlight</option>
                  <option value="mark_sensitive">Mark Sensitive</option>
                </select>
              </div>

              {action.type === 'highlight' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Color
                    </label>
                    <input
                      type="color"
                      value={action.color || '#FFD700'}
                      onChange={(e) => updateAction(index, { color: e.target.value })}
                      className="w-full h-8 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id={`dashed-${index}`}
                      checked={action.isDashed || false}
                      onChange={(e) => updateAction(index, { isDashed: e.target.checked })}
                      className="h-3 w-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <label htmlFor={`dashed-${index}`} className="ml-2 text-xs text-gray-600">
                      Dashed border
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        </div>

        {/* Actions Footer - Fixed at bottom */}
        <div className="flex justify-between pt-4 border-t border-gray-200 bg-white flex-shrink-0">
          <div>
            {existingFilter && (
              <button
                onClick={handleDelete}
                disabled={isSaving || isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
              >
                {isDeleting ? 'Deleting...' : 'Delete Filter'}
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              disabled={isSaving || isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="px-4 py-2 bg-btn-confirm-normal text-btn-confirm-text rounded hover:bg-btn-confirm-hover disabled:bg-gray-400"
            >
              {isSaving ? 'Saving...' : 'Save Filter'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CustomFilterModal; 