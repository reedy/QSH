// Performance: not in 30s WS render path — React.memo not required.
// OccupancyTimeline is only rendered from Away.tsx which fetches its own history
// data and does not subscribe to useLive().
import { useState } from 'react'
import type { HistoryPoint } from '../hooks/useHistory'
import { formatTimeRange } from '../lib/utils'

interface OccupancyTimelineProps {
  roomHistory: Record<string, HistoryPoint[]>
  hours: number
}

interface TooltipState {
  room: string
  state: string
  range: string
  xPct: number // horizontal position (0-100) within the strip row
}

const OCC_COLORS: Record<string, string> = {
  occupied: '#22c55e',
  unoccupied: '#6b7280',
  away: '#3b82f6',
  unknown: '#d1d5db',
}

const MIN_SEGMENT_SECONDS = 60

/**
 * Compute the horizontal position of the mouse within the strip row as a
 * percentage (0-100). Defensive against e.currentTarget being null — React
 * may clear synthetic-event fields after the handler returns, and even if
 * this helper is always called synchronously, a cheap guard costs nothing.
 */
function computeXPct(e: React.MouseEvent<HTMLDivElement>): number {
  const target = e.currentTarget
  if (!target) return 50  // Fallback — centre the tooltip over the strip.
  const row = target.parentElement
  if (!row) return 50
  const rect = row.getBoundingClientRect()
  if (rect.width === 0) return 50
  return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
}

export function OccupancyTimeline({ roomHistory, hours }: OccupancyTimelineProps) {
  const rooms = Object.keys(roomHistory)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  if (rooms.length === 0) return null

  // Find global time range
  let minT = Infinity
  let maxT = -Infinity
  for (const points of Object.values(roomHistory)) {
    for (const p of points) {
      const t = p.t as number
      if (t < minT) minT = t
      if (t > maxT) maxT = t
    }
  }
  const range = maxT - minT || 1

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h3 className="text-sm font-semibold mb-3">Occupancy Timeline ({hours}h)</h3>
      <div className="space-y-2">
        {rooms.map(room => {
          const points = roomHistory[room]
          const segments = mergeTinySegments(buildSegments(points, maxT))
          const displayName = room.replace(/_/g, ' ')

          return (
            <div key={room} className="flex items-center gap-3 relative">
              <span className="text-xs text-[var(--text-muted)] w-24 truncate capitalize">
                {displayName}
              </span>
              {/* Strip wrapper: positions the tooltip; overflow stays VISIBLE here so the
                  tooltip can render above the strip. */}
              <div className="flex-1 relative">
                {/* Segments container: overflow-hidden so the rounded corners clip the
                    coloured fills. Tooltip is NOT a child — would be clipped. */}
                <div className="h-6 rounded overflow-hidden flex">
                  {segments.map((seg, i) => {
                    const width = ((seg.end - seg.start) / range) * 100
                    const range_str = formatTimeRange(seg.start, seg.end)
                    return (
                      <div
                        key={i}
                        style={{
                          width: `${width}%`,
                          backgroundColor: OCC_COLORS[seg.state] ?? '#6b7280',
                        }}
                        // Single-space separator (no \n) — Safari collapses \n in
                        // title attributes, and this value is now consumed only by
                        // screen readers. The visible tooltip is driven by React state.
                        title={`${displayName} — ${seg.state} ${range_str}`}
                        className="h-full min-w-[1px] cursor-default"
                        onMouseEnter={(e) => {
                          // Capture xPct synchronously — e.currentTarget is valid here because
                          // we are inside the event handler. Passing a plain object (not an
                          // updater) means React never re-reads the event after this function
                          // returns. This is the crash fix from INSTRUCTION-103.
                          const xPct = computeXPct(e)
                          setTooltip({
                            room: displayName,
                            state: seg.state,
                            range: range_str,
                            xPct,
                          })
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  })}
                </div>
                {/* Tooltip is a sibling, not a child, of the clipping container. */}
                {tooltip && tooltip.room === displayName && (
                  <div
                    className="absolute -top-10 z-10 pointer-events-none px-2 py-1 rounded shadow-lg text-xs whitespace-nowrap
                               bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)]"
                    style={{
                      left: `${tooltip.xPct}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="font-medium capitalize">{tooltip.room}</div>
                    <div className="text-[var(--text-muted)]">
                      {tooltip.state} · {tooltip.range}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-3">
        {Object.entries(OCC_COLORS).map(([state, color]) => (
          <div key={state} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {state}
          </div>
        ))}
      </div>
    </div>
  )
}

function buildSegments(
  points: HistoryPoint[],
  maxT: number,
): { start: number; end: number; state: string }[] {
  const segments: { start: number; end: number; state: string }[] = []
  for (let i = 0; i < points.length; i++) {
    const state = String(points[i].occupancy ?? 'unknown')
    const t = points[i].t as number
    const nextT = i < points.length - 1 ? (points[i + 1].t as number) : maxT

    if (segments.length > 0 && segments[segments.length - 1].state === state) {
      segments[segments.length - 1].end = nextT
    } else {
      segments.push({ start: t, end: nextT, state })
    }
  }
  return segments
}

function mergeTinySegments(
  segments: { start: number; end: number; state: string }[],
): { start: number; end: number; state: string }[] {
  if (segments.length <= 1) return segments

  // Pass 1: forward-absorb a tiny leading segment into the next segment.
  // Without this, a < MIN_SEGMENT_SECONDS first segment would pass the
  // `out.length > 0` guard in pass 2 and be preserved as-is, producing
  // a 1 px segment at the left edge of the strip.
  const pre = segments.map(s => ({ ...s }))
  while (pre.length > 1 && pre[0].end - pre[0].start < MIN_SEGMENT_SECONDS) {
    // absorb pre[0] into pre[1]: take pre[1]'s state, extend start back
    pre[1].start = pre[0].start
    pre.shift()
  }

  // Pass 2: backward-absorb any remaining tiny interior segments.
  const out: { start: number; end: number; state: string }[] = []
  for (const seg of pre) {
    const dur = seg.end - seg.start
    if (dur < MIN_SEGMENT_SECONDS && out.length > 0) {
      out[out.length - 1].end = seg.end
    } else {
      out.push({ ...seg })
    }
  }

  // Pass 3: merge consecutive same-state runs that may have resulted.
  const merged: { start: number; end: number; state: string }[] = []
  for (const seg of out) {
    if (merged.length > 0 && merged[merged.length - 1].state === seg.state) {
      merged[merged.length - 1].end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}
