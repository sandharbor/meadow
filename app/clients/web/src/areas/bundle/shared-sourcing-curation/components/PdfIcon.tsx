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

import React from 'react';

// A PDF document: a page with a folded corner and a red label, so a PDF reads
// as a document rather than an image.
export function PdfIcon({ className, onMouseEnter, onMouseLeave }: {
  className?: string;
  onMouseEnter?: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<SVGSVGElement>) => void;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="PDF"
      data-testid="pdf-icon"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <path d="M8 3 H20 L26 9 V29 H8 Z" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 3 V9 H26" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="4" y="15" width="20" height="9" rx="1.5" fill="#dc2626" />
      <text x="14" y="22" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="sans-serif" fill="#ffffff">PDF</text>
    </svg>
  );
}
