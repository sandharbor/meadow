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

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  movable?: boolean;
  allowContentScroll?: boolean;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  ariaLabel?: string;
  closeLabel?: string;
  manageFocus?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = "w-4/5 h-4/5",
  showCloseButton = true,
  movable = false,
  allowContentScroll = true,
  footer,
  headerActions,
  ariaLabel,
  closeLabel = 'Close',
  manageFocus = false,
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) setOffset({ x: 0, y: 0 });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !manageFocus) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previousFocus?.focus(); };
  }, [isOpen, manageFocus, onClose]);

  const handleMoveStart = useCallback((event: React.MouseEvent) => {
    if (!movable || !panelRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = { ...offset };
    const startRect = panelRef.current.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const MIN_VISIBLE = 40;
      const nextX = startOffset.x + moveEvent.clientX - startX;
      const nextY = startOffset.y + moveEvent.clientY - startY;
      const minX = startOffset.x + MIN_VISIBLE - startRect.right;
      const maxX = startOffset.x + window.innerWidth - MIN_VISIBLE - startRect.left;
      const minY = startOffset.y - startRect.top;
      const maxY = startOffset.y + window.innerHeight - MIN_VISIBLE - startRect.top;
      setOffset({
        x: Math.max(minX, Math.min(nextX, maxX)),
        y: Math.max(minY, Math.min(nextY, maxY)),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [movable, offset]);

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center z-50 p-4 ${
        movable ? 'bg-opacity-20' : 'bg-opacity-50'
      }`}
      onClick={onClose}
    >
      <div 
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-label={ariaLabel}
        className={`bg-white rounded-lg p-6 flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(100vh - 2rem)',
          transform: movable ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        }}
        data-testid={movable ? 'movable-modal-panel' : undefined}
      >
        <div
          className={`flex justify-between items-center mb-4 ${
            movable
              ? '-mx-6 -mt-6 rounded-t-lg border-b border-neutral-200 bg-neutral-100 px-4 py-3 cursor-move select-none'
              : ''
          }`}
          onMouseDown={movable ? handleMoveStart : undefined}
          data-testid={movable ? 'movable-modal-title-bar' : undefined}
          title={movable ? 'Drag to move' : undefined}
        >
          <div className="flex items-center gap-3">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {headerActions && <div onMouseDown={event => event.stopPropagation()}>{headerActions}</div>}
          </div>
          {showCloseButton && (
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              onMouseDown={(event) => event.stopPropagation()}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          )}
        </div>
        
        <div className={`flex-1 min-h-0 -mx-1 px-1 ${
          allowContentScroll ? 'overflow-y-auto' : 'overflow-y-hidden'
        }`}>
          {children}
        </div>
        {footer && <div className="mt-4 shrink-0 border-t border-neutral-200 pt-4">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
