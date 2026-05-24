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
import { createPortal } from 'react-dom';

const SitePagesToggle: React.FC<{
  isActive: boolean;
  onToggle: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}> = ({ isActive, onToggle, onHoverStart, onHoverEnd }) => {
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (hovered && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top,
        right: window.innerWidth - rect.right,
      });
    }
  }, [hovered]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 select-none cursor-default">Site Pages</span>
      <button
        ref={buttonRef}
        role="switch"
        aria-checked={isActive}
        onClick={onToggle}
        onMouseEnter={() => { setHovered(true); onHoverStart?.(); }}
        onMouseLeave={() => { setHovered(false); onHoverEnd?.(); }}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          isActive ? 'bg-blue-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            isActive ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {hovered && tooltipPos && createPortal(
        <div
          style={{ top: tooltipPos.top, right: tooltipPos.right }}
          className="fixed -translate-y-full -mt-1 w-64 p-2 bg-white text-gray-700 text-xs rounded border border-gray-200 shadow-lg z-[9999] pointer-events-none"
        >
          Show the exact pages that will be published to the site.<br /><br />They are the ones that are tracked and not blacklisted.
        </div>,
        document.body
      )}
    </div>
  );
};

export default SitePagesToggle;
