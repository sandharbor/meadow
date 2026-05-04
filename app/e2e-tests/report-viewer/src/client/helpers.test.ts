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

import { describe, it, expect } from 'vitest';
import { formatTime, escapeHtml, isBinary, diffHighlight, videoTimeToReal, realTimeToVideo, computeHealthData, parseStateRepoAsFiles } from './helpers'

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats seconds under a minute', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(30)).toBe('0:30')
    expect(formatTime(59)).toBe('0:59')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(60)).toBe('1:00')
    expect(formatTime(90)).toBe('1:30')
    expect(formatTime(125)).toBe('2:05')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(5.7)).toBe('0:05')
    expect(formatTime(90.9)).toBe('1:30')
  })
})

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar')
  })

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('handles strings with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })

  it('escapes multiple special characters', () => {
    expect(escapeHtml('<a href="x?a=1&b=2">')).toBe('&lt;a href=&quot;x?a=1&amp;b=2&quot;&gt;')
  })
})

describe('isBinary', () => {
  it('returns false for empty string', () => {
    expect(isBinary('')).toBe(false)
  })

  it('returns false for normal text', () => {
    expect(isBinary('Hello, world!\nLine 2\n')).toBe(false)
  })

  it('returns true for content with null bytes', () => {
    expect(isBinary('abc\x00def')).toBe(true)
  })

  it('returns true for high ratio of non-printable characters', () => {
    const binary = String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16)
    expect(isBinary(binary)).toBe(true)
  })

  it('allows tabs, newlines, and carriage returns', () => {
    expect(isBinary('\t\n\r normal text')).toBe(false)
  })
})

describe('diffHighlight', () => {
  it('shows no diff for identical text', () => {
    const text = 'line1\nline2\nline3'
    const result = diffHighlight(text, text)
    expect(result).toBe('line1\nline2\nline3')
  })

  it('shows additions for new lines', () => {
    const result = diffHighlight('', 'new line')
    expect(result).toContain('+ new line')
    expect(result).toContain('text-green-700')
  })

  it('shows deletions for removed lines', () => {
    const result = diffHighlight('old line', '')
    expect(result).toContain('- old line')
    expect(result).toContain('text-red-700')
  })

  it('shows both additions and deletions for changed lines', () => {
    const result = diffHighlight('before', 'after')
    expect(result).toContain('- before')
    expect(result).toContain('+ after')
  })

  it('escapes HTML in diff output', () => {
    const result = diffHighlight('', '<script>alert("xss")</script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })
})

describe('videoTimeToReal / realTimeToVideo', () => {
  const startTime = 1000000 // 1,000,000 ms (arbitrary epoch)

  it('converts video seconds to real milliseconds', () => {
    expect(videoTimeToReal(startTime, 0)).toBe(1000000)
    expect(videoTimeToReal(startTime, 1)).toBe(1001000)
    expect(videoTimeToReal(startTime, 10)).toBe(1010000)
  })

  it('converts real milliseconds to video seconds', () => {
    expect(realTimeToVideo(startTime, 1000000)).toBe(0)
    expect(realTimeToVideo(startTime, 1001000)).toBe(1)
    expect(realTimeToVideo(startTime, 1010000)).toBe(10)
  })

  it('round-trips correctly', () => {
    const videoSec = 42.5
    const real = videoTimeToReal(startTime, videoSec)
    expect(realTimeToVideo(startTime, real)).toBe(videoSec)
  })
})

describe('computeHealthData', () => {
  const base = new Date('2025-01-01T00:00:00.000Z').getTime()

  function ts(offsetMs: number): string {
    return new Date(base + offsetMs).toISOString()
  }

  it('returns empty summary for no snapshots', () => {
    const result = computeHealthData([], [], [], base, 10000)
    expect(result.points).toEqual([])
    expect(result.hasAnyData).toBe(false)
    expect(result.hasUncommittedAtEnd).toBe(false)
  })

  it('returns empty summary for zero duration', () => {
    const result = computeHealthData([ts(5000)], [], [], base, 0)
    expect(result.points).toEqual([])
    expect(result.hasAnyData).toBe(false)
  })

  it('counts errors and warnings between snapshots', () => {
    const snaps = [ts(3000), ts(7000)]
    const logs = [
      { timestamp: ts(1000), level: 'ERROR' },
      { timestamp: ts(2000), level: 'WARN' },
      { timestamp: ts(4000), level: 'ERROR' },
      { timestamp: ts(5000), level: 'ERROR' },
      { timestamp: ts(6000), level: 'WARN' },
    ]
    const result = computeHealthData(snaps, logs, [], base, 10000)
    expect(result.points).toHaveLength(2)
    // First interval: start(0) to 3000 — logs at 1000(E), 2000(W)
    expect(result.points[0].errorCount).toBe(1)
    expect(result.points[0].warnCount).toBe(1)
    expect(result.points[0].pct).toBe(30)
    // Second interval: 3000 to 7000 — logs at 4000(E), 5000(E), 6000(W)
    expect(result.points[1].errorCount).toBe(2)
    expect(result.points[1].warnCount).toBe(1)
    expect(result.points[1].pct).toBe(70)
    expect(result.hasAnyData).toBe(true)
  })

  it('skips logs without timestamps', () => {
    const snaps = [ts(5000)]
    const logs = [
      { level: 'ERROR' },
      { timestamp: ts(3000), level: 'WARN' },
    ]
    const result = computeHealthData(snaps, logs, [], base, 10000)
    expect(result.points[0].errorCount).toBe(0)
    expect(result.points[0].warnCount).toBe(1)
  })

  it('tracks uncommitted files at each snapshot', () => {
    const snaps = [ts(3000), ts(7000)]
    const uncommitted = [
      { timestamp: ts(2000), uncommittedFiles: [{ status: 'M', path: 'a.txt' }] },
      { timestamp: ts(5000), uncommittedFiles: [{ status: 'M', path: 'a.txt' }, { status: 'A', path: 'b.txt' }] },
    ]
    const result = computeHealthData(snaps, [], uncommitted, base, 10000)
    expect(result.points[0].uncommittedTrackedFiles).toBe(1)
    expect(result.points[1].uncommittedTrackedFiles).toBe(2)
    expect(result.hasAnyData).toBe(true)
  })

  it('splits uncommitted by tracked/untracked and file/folder', () => {
    const snaps = [ts(5000)]
    const uncommitted = [
      { timestamp: ts(2000), uncommittedFiles: [
        { status: 'M', path: 'a.txt' },
        { status: 'M', path: 'dir/' },
        { status: '?', path: 'new.txt' },
        { status: '?', path: 'newdir/' },
      ] },
    ]
    const result = computeHealthData(snaps, [], uncommitted, base, 10000)
    expect(result.points[0].uncommittedTrackedFiles).toBe(1)
    expect(result.points[0].uncommittedTrackedFolders).toBe(1)
    expect(result.points[0].uncommittedUntrackedFiles).toBe(1)
    expect(result.points[0].uncommittedUntrackedFolders).toBe(1)
  })

  it('detects uncommitted files at end', () => {
    const uncommitted = [
      { timestamp: ts(2000), uncommittedFiles: [{ status: 'M', path: 'a.txt' }] },
    ]
    const result = computeHealthData([ts(5000)], [], uncommitted, base, 10000)
    expect(result.hasUncommittedAtEnd).toBe(true)
  })

  it('detects no uncommitted at end when last entry is empty', () => {
    const uncommitted = [
      { timestamp: ts(2000), uncommittedFiles: [{ status: 'M', path: 'a.txt' }] },
      { timestamp: ts(4000), uncommittedFiles: [] },
    ]
    const result = computeHealthData([ts(5000)], [], uncommitted, base, 10000)
    expect(result.hasUncommittedAtEnd).toBe(false)
  })

  it('clamps pct to 0-100', () => {
    // Snapshot before start
    const snaps = [ts(-1000), ts(15000)]
    const result = computeHealthData(snaps, [], [], base, 10000)
    expect(result.points[0].pct).toBe(0)
    expect(result.points[1].pct).toBe(100)
  })

  it('single snapshot with no issues has hasAnyData false', () => {
    const result = computeHealthData([ts(5000)], [], [], base, 10000)
    expect(result.hasAnyData).toBe(false)
    expect(result.points).toHaveLength(1)
    expect(result.points[0].errorCount).toBe(0)
    expect(result.points[0].warnCount).toBe(0)
    expect(result.points[0].uncommittedTrackedFiles).toBe(0)
    expect(result.points[0].uncommittedTrackedFolders).toBe(0)
    expect(result.points[0].uncommittedUntrackedFiles).toBe(0)
    expect(result.points[0].uncommittedUntrackedFolders).toBe(0)
  })
})

describe('parseStateRepoAsFiles', () => {
  it('keeps file-per-record YAML objects as file-like records', () => {
    const result = parseStateRepoAsFiles({
      'users/T5-alice': 'id: alice\nrole: editor\n',
    })

    expect(result.paths).toEqual(['users/T5-alice'])
    expect(result.contents['users/T5-alice']).toContain('id: alice')
  })
})
