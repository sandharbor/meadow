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
import { LabelPlacement } from '../utils/graphSearchLabels';

interface GraphSearchLabelsProps {
  placements: LabelPlacement[];
  fontSize: number;
  pageRadius: number;
  connectorMarkerId: string;
}

const GraphSearchLabels: React.FC<GraphSearchLabelsProps> = ({
  placements,
  fontSize,
  pageRadius,
  connectorMarkerId,
}) => {
  if (placements.length === 0) return null;

  const charWidth = fontSize * 0.55;
  const padding = fontSize * 0.4;
  const labelHeight = fontSize * 1.6;
  const borderRadius = fontSize * 0.2;

  return (
    <g className="search-labels">
      {placements.map(placement => {
        const { pageId, nodeX, nodeY, labelX, labelY, segments, needsConnector, titleFilterColors } = placement;
        const totalTextWidth = segments.reduce((sum, s) => sum + s.text.length * charWidth, 0);
        const rectWidth = totalTextWidth + padding * 2;
        const rectX = labelX - rectWidth / 2;
        const rectY = labelY - labelHeight / 2;

        // Compute highlight rect positions
        const highlightRects: Array<{ x: number; width: number }> = [];
        let xOffset = labelX - totalTextWidth / 2;
        for (const segment of segments) {
          const segWidth = segment.text.length * charWidth;
          if (segment.isHighlighted) {
            highlightRects.push({ x: xOffset, width: segWidth });
          }
          xOffset += segWidth;
        }

        // Connector line: from node edge toward label
        let connectorLine = null;
        if (needsConnector) {
          const dx = labelX - nodeX;
          const dy = labelY - nodeY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Start from node edge
          const startX = nodeX + (dx / dist) * pageRadius;
          const startY = nodeY + (dy / dist) * pageRadius;
          // End at label edge
          const endX = labelX - (dx / dist) * (rectWidth / 2);
          const endY = labelY - (dy / dist) * (labelHeight / 2);

          connectorLine = (
            <line
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="#d1d5db"
              strokeWidth={fontSize * 0.08}
              markerEnd={`url(#${connectorMarkerId})`}
            />
          );
        }

        return (
          <g key={`search-label-${pageId}`}>
            {connectorLine}

            {/* Background rect */}
            <rect
              x={rectX}
              y={rectY}
              width={rectWidth}
              height={labelHeight}
              fill="#f9fafb"
              stroke={titleFilterColors.length === 1 ? titleFilterColors[0] : '#e5e7eb'}
              strokeWidth={fontSize * 0.05}
              rx={borderRadius}
              ry={borderRadius}
            />

            {/* Concentric color strokes when multiple filters contribute */}
            {titleFilterColors.length > 1 && titleFilterColors.map((color, i) => {
              const strokeW = fontSize * 0.19;
              const offset = strokeW / 2 + i * strokeW;
              return (
                <rect
                  key={`border-${i}`}
                  x={rectX - offset}
                  y={rectY - offset}
                  width={rectWidth + offset * 2}
                  height={labelHeight + offset * 2}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeW}
                  rx={borderRadius + offset}
                  ry={borderRadius + offset}
                />
              );
            })}

            {/* Highlight background rects for matched segments */}
            {highlightRects.map((hr, idx) => (
              <rect
                key={idx}
                x={hr.x - fontSize * 0.05}
                y={rectY + labelHeight * 0.1}
                width={hr.width + fontSize * 0.1}
                height={labelHeight * 0.8}
                fill="#dbeafe"
                rx={borderRadius * 0.5}
                ry={borderRadius * 0.5}
              />
            ))}

            {/* Text with highlighted segments */}
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              className="select-none"
            >
              {segments.map((segment, idx) => (
                <tspan
                  key={idx}
                  fill={segment.isHighlighted ? '#1d4ed8' : '#1f2937'}
                  fontWeight={segment.isHighlighted ? 600 : 400}
                >
                  {segment.text}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default GraphSearchLabels;
