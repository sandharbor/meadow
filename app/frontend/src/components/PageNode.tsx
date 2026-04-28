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
import { Highlight } from '../types/displayGraph';
import { isImageFileType } from '../../../shared_code/utils/fileTypeUtils';
import { FileType } from '../../../shared_code/types/FileType';

export const PAGE_NODE_RADIUS = 3;

const BAND_STROKE_WIDTH = 1;
const BAND_GAP = 0.5;
// First band starts just outside the node, each subsequent band hugs the previous one
const BAND_OFFSET = PAGE_NODE_RADIUS + BAND_GAP + BAND_STROKE_WIDTH / 2;
const BAND_STEP = BAND_STROKE_WIDTH + BAND_GAP;

// Node stroke colors
const TRACKED_NODE_COLOR = '#94a3b8';    // neutral-400
const UNTRACKED_NODE_COLOR = '#e2e8f0';  // neutral-200
const FRONTIER_NODE_COLOR = '#f1f5f9';   // neutral-100
const FRONTIER_IMAGE_COLOR = '#8b5cf6';  // violet-500
const SELECTED_COLOR = '#f59e0b';        // warning-500

interface PageNodeProps {
  isSelected: boolean;
  isFrontierPage: boolean;
  isFrontierImageExtension: boolean;
  tracked: boolean;
  fileType: FileType;
  highlights: Highlight[];
  showLabel: boolean;
  label: string;
}

function getStrokeColor(props: Pick<PageNodeProps, 'isSelected' | 'isFrontierImageExtension' | 'isFrontierPage' | 'tracked'>): string {
  if (props.isSelected) return SELECTED_COLOR;
  if (props.isFrontierImageExtension) return FRONTIER_IMAGE_COLOR;
  if (props.isFrontierPage) return FRONTIER_NODE_COLOR;
  if (props.tracked) return TRACKED_NODE_COLOR;
  return UNTRACKED_NODE_COLOR;
}

const PageNode: React.FC<PageNodeProps> = ({
  isSelected,
  isFrontierPage,
  isFrontierImageExtension,
  tracked,
  fileType,
  highlights,
  showLabel,
  label,
}) => {
  const strokeColor = getStrokeColor({ isSelected, isFrontierImageExtension, isFrontierPage, tracked });

  return (
    <>
      {/* Highlight bands — hug the node like tree rings */}
      {highlights.map((highlight, idx) => (
        <circle
          key={idx}
          r={BAND_OFFSET + idx * BAND_STEP}
          fill="none"
          stroke={highlight.color}
          strokeWidth={BAND_STROKE_WIDTH}
          strokeDasharray={highlight.isDashed ? '1.5,1.5' : 'none'}
          opacity="0.8"
        />
      ))}

      {/* Page circle */}
      <circle
        r={PAGE_NODE_RADIUS}
        fill="#fff"
        stroke={strokeColor}
        strokeWidth={1}
        strokeDasharray={isFrontierImageExtension ? '2,1' : 'none'}
      />

      {/* Image indicator icon for image file types */}
      {isImageFileType(fileType) && (
        <g transform="translate(-1.5, -1.5) scale(0.75)">
          <rect x="0" y="0" width="4" height="3" fill="none" stroke="#6366f1" strokeWidth="0.5" rx="0.3" />
          <circle cx="1" cy="1" r="0.4" fill="#6366f1" />
          <path d="M0.5 2.5 L1.5 1.5 L2.5 2 L3.5 1 L3.5 2.5 Z" fill="#6366f1" opacity="0.7" />
        </g>
      )}

      {/* Label text */}
      {showLabel && (
        <text
          dy=".3em"
          textAnchor="middle"
          className="select-none text-base"
        >
          {label}
        </text>
      )}
    </>
  );
};

export default PageNode;
