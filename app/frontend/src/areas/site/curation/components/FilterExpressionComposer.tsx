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

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../../../shared/components/Modal';
import {
  ActiveFilterExpressionTerm,
  FilterExpression,
  FilterExpressionGroup,
  FilterExpressionOperator,
  appendFilterExpressionGroup,
  createDefaultFilterExpression,
  createFilterExpressionGroupId,
  filterExpressionNodeId,
  filterExpressionTermId,
  isDefaultFilterExpression,
  moveFilterExpressionNode,
  moveFilterExpressionNodeOnto,
  setFilterExpressionOperator,
  ungroupFilterExpression
} from '../types/filterExpression';

interface FilterExpressionComposerProps {
  expression: FilterExpression;
  activeTerms: ActiveFilterExpressionTerm[];
  filterNames: ReadonlyMap<string, string>;
  onChange: (expression: FilterExpression) => void;
}

interface ExpressionNodeProps extends FilterExpressionComposerProps {
  node: FilterExpression;
  rootId: string;
  activeTermIds: ReadonlySet<string>;
  draggedNodeId: string | null;
  setDraggedNodeId: (nodeId: string | null) => void;
  onMove: (nodeId: string, targetGroupId: string, targetIndex: number) => void;
  onMoveOnto: (nodeId: string, targetNodeId: string) => void;
  onAddGroup: (parentGroupId: string) => void;
  onOperatorChange: (groupId: string, operator: FilterExpressionOperator) => void;
  onUngroup: (groupId: string) => void;
}

const OPERATOR_OPTIONS: Array<{ value: FilterExpressionOperator; label: string; connector: string }> = [
  { value: 'union', label: 'Any', connector: 'OR' },
  { value: 'intersection', label: 'All', connector: 'AND' },
  { value: 'difference', label: 'Without', connector: 'WITHOUT' }
];

function hasVisibleContent(node: FilterExpression, activeTermIds: ReadonlySet<string>): boolean {
  if (node.type === 'all') return true;
  if (node.type === 'filter') return activeTermIds.has(filterExpressionTermId(node));
  return node.children.length === 0 || node.children.some(child => hasVisibleContent(child, activeTermIds));
}

function DragHandle({
  nodeId,
  label,
  setDraggedNodeId,
  isDragSource = true
}: {
  nodeId: string;
  label: string;
  setDraggedNodeId: (nodeId: string | null) => void;
  isDragSource?: boolean;
}) {
  return (
    <span
      draggable={isDragSource}
      onDragStart={isDragSource ? event => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', nodeId);
        setDraggedNodeId(nodeId);
      } : undefined}
      onDragEnd={isDragSource ? event => {
        event.stopPropagation();
        setDraggedNodeId(null);
      } : undefined}
      className="cursor-grab select-none px-1 text-gray-400 active:cursor-grabbing"
      title={`Drag ${label}`}
      aria-label={`Drag ${label}`}
    >
      ⠿
    </span>
  );
}

function DropLine({
  groupId,
  index,
  draggedNodeId,
  onMove
}: {
  groupId: string;
  index: number;
  draggedNodeId: string | null;
  onMove: (nodeId: string, targetGroupId: string, targetIndex: number) => void;
}) {
  return (
    <div
      className={`h-2 rounded transition-colors ${draggedNodeId ? 'hover:bg-main-200' : ''}`}
      onDragOver={event => event.preventDefault()}
      onPointerUp={event => {
        if (!draggedNodeId) return;
        event.preventDefault();
        event.stopPropagation();
        onMove(draggedNodeId, groupId, index);
      }}
      onDrop={event => {
        event.preventDefault();
        event.stopPropagation();
        const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
        if (nodeId) onMove(nodeId, groupId, index);
      }}
      data-testid={`filter-expression-drop-${groupId}-${index}`}
    />
  );
}

function FilterTermCard({ node, filterNames, draggedNodeId, setDraggedNodeId }: ExpressionNodeProps & {
  node: Extract<FilterExpression, { type: 'filter' }>;
}) {
  const nodeId = filterExpressionNodeId(node);
  const isDragging = draggedNodeId === nodeId;
  const name = filterNames.get(node.filterId) || node.filterId;
  return (
    <div
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        setDraggedNodeId(nodeId);
      }}
      className={`flex cursor-grab items-center gap-2 rounded-md border bg-white px-2 py-2 shadow-sm active:cursor-grabbing ${
        isDragging ? 'border-main-400 opacity-50' : 'border-gray-200'
      }`}
      data-testid={nodeId}
    >
      <DragHandle
        nodeId={nodeId}
        label={name}
        setDraggedNodeId={setDraggedNodeId}
        isDragSource={false}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{name}</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        node.mode === 'solo' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
      }`}>
        {node.mode}
      </span>
    </div>
  );
}

function GroupControls({
  group,
  isRoot,
  onOperatorChange,
  onUngroup
}: {
  group: FilterExpressionGroup;
  isRoot: boolean;
  onOperatorChange: (groupId: string, operator: FilterExpressionOperator) => void;
  onUngroup: (groupId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5" aria-label="How this group combines filters">
        {OPERATOR_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onOperatorChange(group.id, option.value)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              group.operator === option.value
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            aria-pressed={group.operator === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!isRoot && (
        <button
          type="button"
          onClick={() => onUngroup(group.id)}
          className="text-xs text-gray-400 hover:text-gray-700"
          title="Remove these parentheses"
        >
          Ungroup
        </button>
      )}
    </div>
  );
}

function ExpressionNode(props: ExpressionNodeProps) {
  const { node, activeTermIds, draggedNodeId, setDraggedNodeId } = props;
  if (node.type === 'filter') {
    return <FilterTermCard {...props} node={node} />;
  }
  if (node.type === 'all') {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
        All pages
      </div>
    );
  }

  const isRoot = node.id === props.rootId;
  const visibleChildren = node.children
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => hasVisibleContent(child, activeTermIds));
  const connector = OPERATOR_OPTIONS.find(option => option.value === node.operator)?.connector;
  const groupNodeId = filterExpressionNodeId(node);

  return (
    <div className={`rounded-lg border-2 border-gray-200 bg-gray-50/70 p-3 ${isRoot ? '' : 'shadow-sm'}`} data-testid={groupNodeId}>
      <div className="mb-2 flex items-center gap-2">
        {!isRoot && (
          <DragHandle nodeId={groupNodeId} label="group" setDraggedNodeId={setDraggedNodeId} />
        )}
        <GroupControls
          group={node}
          isRoot={isRoot}
          onOperatorChange={props.onOperatorChange}
          onUngroup={props.onUngroup}
        />
      </div>

      <DropLine
        groupId={node.id}
        index={visibleChildren[0]?.index ?? node.children.length}
        draggedNodeId={draggedNodeId}
        onMove={props.onMove}
      />
      {visibleChildren.map(({ child, index }, visibleIndex) => (
        <React.Fragment key={filterExpressionNodeId(child)}>
          {visibleIndex > 0 && (
            <div className="my-1 flex items-center gap-2 text-[10px] font-bold tracking-widest text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              {connector}
              <span className="h-px flex-1 bg-gray-200" />
            </div>
          )}
          <div
            className={draggedNodeId && draggedNodeId !== filterExpressionNodeId(child)
              ? 'rounded-md hover:ring-2 hover:ring-main-200'
              : ''}
            onDragOver={event => event.preventDefault()}
            onPointerUp={event => {
              if (!draggedNodeId) return;
              event.preventDefault();
              event.stopPropagation();
              props.onMoveOnto(draggedNodeId, filterExpressionNodeId(child));
            }}
            onDrop={event => {
              event.preventDefault();
              event.stopPropagation();
              const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
              if (nodeId) props.onMoveOnto(nodeId, filterExpressionNodeId(child));
            }}
          >
            <ExpressionNode {...props} node={child} />
          </div>
          <DropLine groupId={node.id} index={index + 1} draggedNodeId={draggedNodeId} onMove={props.onMove} />
        </React.Fragment>
      ))}

      {visibleChildren.length === 0 && (
        <div
          className="rounded-md border border-dashed border-gray-300 px-3 py-5 text-center text-xs text-gray-400"
          onDragOver={event => event.preventDefault()}
          onPointerUp={event => {
            if (!draggedNodeId) return;
            event.preventDefault();
            event.stopPropagation();
            props.onMove(draggedNodeId, node.id, 0);
          }}
          onDrop={event => {
            event.preventDefault();
            event.stopPropagation();
            const nodeId = draggedNodeId || event.dataTransfer.getData('text/plain');
            if (nodeId) props.onMove(nodeId, node.id, 0);
          }}
        >
          Drop filters here
        </div>
      )}

      <button
        type="button"
        onClick={() => props.onAddGroup(node.id)}
        className="mt-2 text-xs font-medium text-gray-500 hover:text-main-700"
      >
        + Add parentheses
      </button>
    </div>
  );
}

const FilterExpressionComposer: React.FC<FilterExpressionComposerProps> = ({
  expression,
  activeTerms,
  filterNames,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const activeTermIds = useMemo(
    () => new Set(activeTerms.map(filterExpressionTermId)),
    [activeTerms]
  );
  const usesCustomizedMix = useMemo(
    () => !isDefaultFilterExpression(expression, activeTerms),
    [expression, activeTerms]
  );

  useEffect(() => {
    if (activeTerms.length < 2) setIsOpen(false);
  }, [activeTerms.length]);

  useEffect(() => {
    const stopPointerDrag = () => setDraggedNodeId(null);
    window.addEventListener('pointerup', stopPointerDrag);
    window.addEventListener('pointercancel', stopPointerDrag);
    window.addEventListener('blur', stopPointerDrag);
    return () => {
      window.removeEventListener('pointerup', stopPointerDrag);
      window.removeEventListener('pointercancel', stopPointerDrag);
      window.removeEventListener('blur', stopPointerDrag);
    };
  }, []);

  if (activeTerms.length < 2) return null;

  const handleMove = (nodeId: string, targetGroupId: string, targetIndex: number) => {
    onChange(moveFilterExpressionNode(expression, nodeId, targetGroupId, targetIndex));
    setDraggedNodeId(null);
  };
  const handleMoveOnto = (nodeId: string, targetNodeId: string) => {
    onChange(moveFilterExpressionNodeOnto(expression, nodeId, targetNodeId));
    setDraggedNodeId(null);
  };
  const handleAddGroup = (parentGroupId: string) => {
    const groupId = createFilterExpressionGroupId(expression);
    onChange(appendFilterExpressionGroup(expression, parentGroupId, groupId));
  };
  const handleReset = () => {
    const defaultExpression = createDefaultFilterExpression(activeTerms);
    if (defaultExpression) onChange(defaultExpression);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`sticky top-0 z-10 mb-4 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium ${
          usesCustomizedMix
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100'
            : 'border-main-200 bg-main-50 text-main-700 hover:border-main-300 hover:bg-main-100'
        }`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">⑂</span>
          Mix view
        </span>
        <span className="flex items-center gap-2">
          {usesCustomizedMix && (
            <span
              className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
              data-testid="mix-view-customized-indicator"
            >
              Customized
            </span>
          )}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-main-600">{activeTerms.length}</span>
        </span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Mix the view"
        className="w-full max-w-2xl"
        movable
      >
        <div className="flex min-h-[26rem] flex-col">
          <p className="mb-4 text-sm text-gray-600">
            Drag filters to reorder them or drop them inside an outline. Each outline works like parentheses.
          </p>
          <div className="flex-1 rounded-xl bg-gray-100 p-3">
            <ExpressionNode
              expression={expression}
              node={expression}
              rootId={expression.type === 'group' ? expression.id : ''}
              activeTerms={activeTerms}
              activeTermIds={activeTermIds}
              filterNames={filterNames}
              draggedNodeId={draggedNodeId}
              setDraggedNodeId={setDraggedNodeId}
              onChange={onChange}
              onMove={handleMove}
              onMoveOnto={handleMoveOnto}
              onAddGroup={handleAddGroup}
              onOperatorChange={(groupId, operator) => onChange(setFilterExpressionOperator(expression, groupId, operator))}
              onUngroup={groupId => onChange(ungroupFilterExpression(expression, groupId))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              Reset mix
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md bg-main-600 px-4 py-2 text-sm font-medium text-white hover:bg-main-700"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default FilterExpressionComposer;
