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

import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { HealthSummary } from '../helpers.ts'

interface HealthGraphProps {
  data: HealthSummary
  width: number
  height: number
  showEndIndicator?: boolean
  mini?: boolean
  onClick?: (pct: number) => void
  currentTimePct?: number
}

const lines = [
  { key: 'errorCount' as const, color: '#ef4444', label: 'logs: errors' },
  { key: 'warnCount' as const, color: '#f59e0b', label: 'logs: warnings' },
  { key: 'uncommittedTrackedFiles' as const, color: '#7c3aed', label: 'meadowHome: uncommitted - tracked files' },
  { key: 'uncommittedTrackedFolders' as const, color: '#a78bfa', label: 'meadowHome: uncommitted - tracked folders' },
  { key: 'uncommittedUntrackedFiles' as const, color: '#c026d3', label: 'meadowHome: uncommitted - untracked files' },
  { key: 'uncommittedUntrackedFolders' as const, color: '#e879f9', label: 'meadowHome: uncommitted - untracked folders' },
]

function totalUncommitted(p: HealthSummary['points'][0]): number {
  return p.uncommittedTrackedFiles + p.uncommittedTrackedFolders + p.uncommittedUntrackedFiles + p.uncommittedUntrackedFolders
}

export default function HealthGraph({ data, width, height, showEndIndicator, mini, onClick, currentTimePct }: HealthGraphProps) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverPct, setHoverPct] = useState<number | null>(null)

  if (!data.hasAnyData && !(showEndIndicator && data.hasUncommittedAtEnd)) return null

  const logicalHeight = 20
  const strokeWidth = mini ? 1 : 1.5
  const maxVal = Math.max(1, ...data.points.map(p => Math.max(
    p.errorCount, p.warnCount,
    p.uncommittedTrackedFiles, p.uncommittedTrackedFolders,
    p.uncommittedUntrackedFiles, p.uncommittedUntrackedFolders
  )))

  function toY(count: number): number {
    return logicalHeight - (count / maxVal) * (logicalHeight - 2) - 1
  }

  function buildPolyline(getValue: (p: typeof data.points[0]) => number): string {
    return data.points.map(p => `${p.pct},${toY(getValue(p))}`).join(' ')
  }

  const lastPoint = data.points.length > 0 ? data.points[data.points.length - 1] : null

  const nearestPoint = hoverPct !== null
    ? data.points.reduce((best, p) => Math.abs(p.pct - hoverPct!) < Math.abs(best.pct - hoverPct!) ? p : best, data.points[0])
    : null

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = (x / rect.width) * 100
    setHoverX(x)
    setHoverPct(pct)
  }

  const handleMouseLeave = () => {
    setHoverX(null)
    setHoverPct(null)
  }

  const handleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!onClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    onClick(pct)
  }

  const currentTimeX = currentTimePct !== undefined ? (currentTimePct / 100) * 100 : null

  return (
    <div style={{ position: 'relative', width, height }}>
      <div
        style={{ position: 'relative', cursor: onClick ? 'pointer' : 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 100 ${logicalHeight}`}
          preserveAspectRatio="none"
          className="block"
        >
          {data.hasAnyData && lines.map(({ key, color }) => (
            <polyline
              key={key}
              points={buildPolyline(p => p[key])}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {showEndIndicator && data.hasUncommittedAtEnd && lastPoint && (
            <circle
              cx={lastPoint.pct}
              cy={toY(totalUncommitted(lastPoint))}
              r={mini ? 2 : 3}
              fill="#ef4444"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {currentTimeX !== null && (
            <line
              x1={currentTimeX}
              y1={0}
              x2={currentTimeX}
              y2={logicalHeight}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hoverPct !== null && (
            <line
              x1={hoverPct}
              y1={0}
              x2={hoverPct}
              y2={logicalHeight}
              stroke="#6b7280"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {hoverX !== null && nearestPoint && (
          <div
            style={{
              position: 'absolute',
              left: hoverX,
              top: -4,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div className="bg-white border border-neutral-200 text-[10px] rounded px-1.5 py-1 whitespace-nowrap shadow-lg">
              {lines.map(({ key, color, label }) => (
                nearestPoint[key] > 0 ? (
                  <div key={key} style={{ color }}>{label}: {nearestPoint[key]}</div>
                ) : null
              ))}
              {lines.every(({ key }) => nearestPoint[key] === 0) && (
                <div className="text-neutral-400">no issues</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
