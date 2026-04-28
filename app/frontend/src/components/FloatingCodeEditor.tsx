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

/* global confirm */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/themes/prism.css';

interface FloatingCodeEditorProps {
  title: string;
  language: string;
  content: string;
  onContentChange: (content: string) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  isSaving: boolean;
  hasChanges: boolean;
  toolbar?: React.ReactNode;
  initialOffset?: number;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;

const FloatingCodeEditor: React.FC<FloatingCodeEditorProps> = ({
  title,
  language,
  content,
  onContentChange,
  onSave,
  onClose,
  onDelete,
  isSaving,
  hasChanges,
  toolbar,
  initialOffset = 0,
}) => {
  const [position, setPosition] = useState(() => ({
    x: Math.max(100, (window.innerWidth - DEFAULT_WIDTH) / 2) + initialOffset,
    y: Math.max(80, (window.innerHeight - DEFAULT_HEIGHT) / 2) + initialOffset,
  }));
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (hasChanges && !confirm('Discard unsaved changes?')) return;
    onClose();
  }, [hasChanges, onClose]);

  // Dragging via title bar
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };
    const startSize = { ...size };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const MIN_VISIBLE = 40;
      const newX = startPos.x + (moveEvent.clientX - startX);
      const newY = startPos.y + (moveEvent.clientY - startY);
      setPosition({
        x: Math.max(MIN_VISIBLE - startSize.width, Math.min(newX, window.innerWidth - MIN_VISIBLE)),
        y: Math.max(0, Math.min(newY, window.innerHeight - MIN_VISIBLE)),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsDragging(false);
    };

    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, size]);

  // Resizing via bottom-right corner
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = { ...size };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setSize({
        width: Math.max(MIN_WIDTH, startSize.width + (moveEvent.clientX - startX)),
        height: Math.max(MIN_HEIGHT, startSize.height + (moveEvent.clientY - startY)),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsResizing(false);
    };

    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [size]);

  // Keyboard shortcut: Cmd/Ctrl+S to save (scoped to this editor)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (!containerRef.current?.contains(document.activeElement)) return;
        e.preventDefault();
        if (hasChanges && !isSaving) onSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasChanges, isSaving, onSave]);

  const prismLang = languages[language] || languages.css;

  return ReactDOM.createPortal(
    <>
    {(isDragging || isResizing) && (
      <div className="fixed inset-0" style={{ zIndex: 59 }} />
    )}
    <div
      ref={containerRef}
      className="fixed bg-white rounded-lg shadow-2xl border border-neutral-300 flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 60,
      }}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-neutral-100 border-b border-neutral-200 cursor-move select-none flex-shrink-0"
        onMouseDown={handleDragStart}
      >
        <span className="text-sm font-medium text-neutral-700 truncate">{title}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-2 py-1 text-xs text-danger-600 hover:text-danger-700 border border-danger-300 rounded hover:bg-danger-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={onSave}
            disabled={!hasChanges || isSaving}
            className="px-2 py-1 text-xs bg-main-600 text-white rounded hover:bg-main-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-600 p-0.5"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Optional toolbar */}
      {toolbar && (
        <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
          {toolbar}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <Editor
          value={content}
          onValueChange={onContentChange}
          highlight={(code) => highlight(code, prismLang, language)}
          padding={12}
          style={{
            fontFamily: '"Fira Code", "Fira Mono", monospace',
            fontSize: 13,
            minHeight: '100%',
          }}
        />
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={handleResizeStart}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-neutral-300">
          <path d="M14 14L8 14M14 14L14 8M14 14L10 10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
    </div>
    </>,
    document.body
  );
};

export default FloatingCodeEditor;
