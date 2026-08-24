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
import { isImageFileType } from '../../../../../../../shared_code/utils/fileTypeUtils';
import { FileType } from '../../../../../../../contracts/types/FileType';
import type { BundleNodeKind } from '../../../../../../../contracts/types/bundleNodeConfig';

export const BUNDLE_NODE_RADIUS = 3;

const BAND_STROKE_WIDTH = 1;
const BAND_GAP = 0.5;
// First band starts just outside the node, each subsequent band hugs the previous one
const BAND_OFFSET = BUNDLE_NODE_RADIUS + BAND_GAP + BAND_STROKE_WIDTH / 2;
const BAND_STEP = BAND_STROKE_WIDTH + BAND_GAP;

// Node stroke colors
const TRACKED_NODE_COLOR = '#94a3b8';    // neutral-400
const UNTRACKED_NODE_COLOR = '#e2e8f0';  // neutral-200
const FRONTIER_NODE_COLOR = '#f1f5f9';   // neutral-100
const FRONTIER_IMAGE_COLOR = '#8b5cf6';  // violet-500
const SELECTED_COLOR = '#f59e0b';        // warning-500

interface BundleNodeGlyphProps {
  isSelected: boolean;
  isFrontierNode: boolean;
  isFrontierImageExtension: boolean;
  tracked: boolean;
  fileType: FileType;
  bundleNodeKind: BundleNodeKind;
  highlights: Highlight[];
  showLabel: boolean;
  label: string;
  showImageIndicator?: boolean;
}

const FOLDER_PATH = 'M -3 -1.5 V -2.4 Q -3 -2.8 -2.6 -2.8 H -0.6 L 0.4 -1.8 H 2.6 Q 3 -1.8 3 -1.4 V 2.4 Q 3 2.8 2.6 2.8 H -2.6 Q -3 2.8 -3 2.4 Z';

function HighlightBand({
  highlight,
  index,
  bundleNodeKind,
}: {
  highlight: Highlight;
  index: number;
  bundleNodeKind: BundleNodeKind;
}) {
  const extent = BAND_OFFSET + index * BAND_STEP;
  const sharedProps = {
    fill: 'none',
    stroke: highlight.color,
    strokeWidth: BAND_STROKE_WIDTH,
    strokeDasharray: highlight.isDashed ? '1.5,1.5' : 'none',
    opacity: 0.8,
  };

  if (bundleNodeKind === 'folder') {
    return (
      <path
        {...sharedProps}
        d={FOLDER_PATH}
        transform={`scale(${extent / BUNDLE_NODE_RADIUS})`}
        vectorEffect="non-scaling-stroke"
        data-highlight-shape="folder"
      />
    );
  }
  if (bundleNodeKind === 'collection') {
    return (
      <rect
        {...sharedProps}
        x={-extent}
        y={-extent}
        width={extent * 2}
        height={extent * 2}
        rx={0.5}
        data-highlight-shape="collection"
      />
    );
  }
  return <circle {...sharedProps} r={extent} data-highlight-shape="file" />;
}

function getStrokeColor(props: Pick<BundleNodeGlyphProps, 'isSelected' | 'isFrontierImageExtension' | 'isFrontierNode' | 'tracked'>): string {
  if (props.isSelected) return SELECTED_COLOR;
  if (props.isFrontierImageExtension) return FRONTIER_IMAGE_COLOR;
  if (props.isFrontierNode) return FRONTIER_NODE_COLOR;
  if (props.tracked) return TRACKED_NODE_COLOR;
  return UNTRACKED_NODE_COLOR;
}

const BundleNodeGlyph: React.FC<BundleNodeGlyphProps> = ({
  isSelected,
  isFrontierNode,
  isFrontierImageExtension,
  tracked,
  fileType,
  bundleNodeKind,
  highlights,
  showLabel,
  label,
  showImageIndicator = true,
}) => {
  const strokeColor = getStrokeColor({ isSelected, isFrontierImageExtension, isFrontierNode, tracked });

  return (
    <>
      {/* Highlight bands — hug the node like tree rings */}
      {highlights.map((highlight, idx) => (
        <HighlightBand
          key={idx}
          highlight={highlight}
          index={idx}
          bundleNodeKind={bundleNodeKind}
        />
      ))}

      <title>{bundleNodeKind === 'collection' ? 'Bundle home' : bundleNodeKind}</title>
      {bundleNodeKind === 'folder' ? (
        <path
          d={FOLDER_PATH}
          fill="#fff"
          stroke={strokeColor}
          strokeWidth={1}
          data-node-shape="folder"
        />
      ) : bundleNodeKind === 'collection' ? (
        <rect
          x={-BUNDLE_NODE_RADIUS}
          y={-BUNDLE_NODE_RADIUS}
          width={BUNDLE_NODE_RADIUS * 2}
          height={BUNDLE_NODE_RADIUS * 2}
          rx={0.5}
          fill="#fff"
          stroke={strokeColor}
          strokeWidth={1}
          data-node-shape="collection"
        />
      ) : (
        <circle
          r={BUNDLE_NODE_RADIUS}
          fill="#fff"
          stroke={strokeColor}
          strokeWidth={1}
          strokeDasharray={isFrontierImageExtension ? '2,1' : 'none'}
          data-node-shape="file"
        />
      )}

      {/* Image indicator icon for image file types */}
      {showImageIndicator && bundleNodeKind === 'file' && isImageFileType(fileType) && (
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

export default BundleNodeGlyph;
