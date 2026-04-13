import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Check, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { MqttTopicCandidate } from '../../types/config'

/** Recursively extract all numeric leaf paths from a JSON object. */
function extractNumericPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return []
  const paths: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'number' && isFinite(value)) {
      paths.push(path)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      paths.push(...extractNumericPaths(value, path))
    }
  }
  return paths
}

/** Traverse a dot-separated path into an object, returning the leaf value. */
function getByPath(obj: unknown, path: string): unknown {
  let current: unknown = obj
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Try to parse a string as JSON and return the parsed object, or null. */
function tryParseJson(s: string): Record<string, unknown> | null {
  if (!s.startsWith('{')) return null
  try {
    const parsed = JSON.parse(s)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // not JSON
  }
  return null
}

interface TopicPickerProps {
  value: string
  format?: 'plain' | 'json'
  jsonPath?: string
  onChange: (topic: string, format?: 'plain' | 'json', jsonPath?: string) => void
  placeholder?: string
  scanResults?: MqttTopicCandidate[]
  label?: string
  required?: boolean
}

export function TopicPicker({
  value,
  format,
  jsonPath,
  onChange,
  placeholder,
  scanResults = [],
  label,
  required,
}: TopicPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [manualJsonMode, setManualJsonMode] = useState(format === 'json')
  const [manualJsonPath, setManualJsonPath] = useState(jsonPath || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!search) return scanResults
    const q = search.toLowerCase()
    return scanResults.filter((t) => t.topic.toLowerCase().includes(q))
  }, [scanResults, search])

  // Find the candidate matching the current value (for preview)
  const matchedCandidate = useMemo(
    () => (value ? scanResults.find((c) => c.topic === value) : undefined),
    [value, scanResults]
  )

  // Parse JSON payload from the matched candidate
  const parsedPayload = useMemo(
    () => (matchedCandidate ? tryParseJson(matchedCandidate.payload) : null),
    [matchedCandidate]
  )

  // Available numeric paths from the parsed JSON payload
  const numericPaths = useMemo(
    () => (parsedPayload ? extractNumericPaths(parsedPayload) : []),
    [parsedPayload]
  )

  // Determine if topic was selected from scan (has a candidate match)
  const isFromScan = !!matchedCandidate
  const isJsonPayload = !!parsedPayload
  const activeFormat = format || (isJsonPayload ? 'json' : 'plain')
  const activeJsonPath = jsonPath || ''

  // Compute extracted value for preview
  const extractedPreview = useMemo(() => {
    if (!matchedCandidate) return null
    if (activeFormat === 'json' && parsedPayload && activeJsonPath) {
      const val = getByPath(parsedPayload, activeJsonPath)
      if (typeof val === 'number' && isFinite(val)) {
        return { value: String(val), path: activeJsonPath, ok: true }
      }
      return { value: 'not found', path: activeJsonPath, ok: false }
    }
    if (activeFormat !== 'json' && matchedCandidate.is_numeric) {
      return { value: matchedCandidate.payload, path: null, ok: true }
    }
    return null
  }, [matchedCandidate, activeFormat, parsedPayload, activeJsonPath])

  const handleTopicSelect = (candidate: MqttTopicCandidate) => {
    const parsed = tryParseJson(candidate.payload)
    if (parsed) {
      const paths = extractNumericPaths(parsed)
      // Auto-select if there's exactly one numeric path
      if (paths.length === 1) {
        onChange(candidate.topic, 'json', paths[0])
      } else {
        onChange(candidate.topic, 'json', undefined)
      }
    } else {
      onChange(candidate.topic)
    }
    setOpen(false)
    setSearch('')
  }

  const handleJsonPathSelect = (path: string) => {
    onChange(value, 'json', path)
  }

  const handleClear = () => {
    onChange('')
    setManualJsonMode(false)
    setManualJsonPath('')
  }

  const handleManualTopicChange = (topic: string) => {
    if (manualJsonMode && manualJsonPath) {
      onChange(topic, 'json', manualJsonPath)
    } else if (manualJsonMode) {
      onChange(topic, 'json', undefined)
    } else {
      onChange(topic)
    }
  }

  const handleManualFormatToggle = () => {
    const newMode = !manualJsonMode
    setManualJsonMode(newMode)
    if (newMode) {
      onChange(value, 'json', manualJsonPath || undefined)
    } else {
      setManualJsonPath('')
      onChange(value)
    }
  }

  const handleManualJsonPathChange = (jp: string) => {
    setManualJsonPath(jp)
    if (jp) {
      onChange(value, 'json', jp)
    } else {
      onChange(value, 'json', undefined)
    }
  }

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="block text-sm font-medium text-[var(--text)] mb-1">
          {label}
          {required && <span className="text-[var(--red)] ml-1">*</span>}
        </label>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => handleManualTopicChange(e.target.value)}
          placeholder={placeholder || 'Enter MQTT topic...'}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
        />
        {scanResults.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(
              'px-2 py-2 rounded-lg border transition-colors',
              open
                ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                : 'border-[var(--border)] hover:border-[var(--accent)]/50'
            )}
            title="Browse discovered topics"
          >
            <Search size={14} className="text-[var(--text-muted)]" />
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg)] transition-colors"
            title="Clear"
          >
            <X size={14} className="text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* JSON key selector — from scan results */}
      {value && isFromScan && isJsonPayload && numericPaths.length > 0 && (
        <div className="mt-2">
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
            JSON key
          </label>
          <div className="relative">
            <select
              value={activeJsonPath}
              onChange={(e) => handleJsonPathSelect(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)] appearance-none pr-8"
            >
              <option value="">Select a JSON key...</option>
              {numericPaths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>
        </div>
      )}

      {/* Manual format toggle + json_path — when topic typed manually (not from scan) */}
      {value && !isFromScan && (
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={manualJsonMode}
              onChange={handleManualFormatToggle}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)]">JSON payload</span>
          </label>
          {manualJsonMode && (
            <input
              type="text"
              value={manualJsonPath}
              onChange={(e) => handleManualJsonPathChange(e.target.value)}
              placeholder="json_path (e.g. temperature)"
              className="flex-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          )}
        </div>
      )}

      {/* Value preview */}
      {value && matchedCandidate && (
        <div className="mt-1.5">
          {extractedPreview?.ok && (
            <span className="text-xs text-[var(--green)]">
              Current value: {extractedPreview.value}
              {extractedPreview.path && ` (from .${extractedPreview.path})`}
            </span>
          )}
          {isJsonPayload && !activeJsonPath && (
            <span className="text-xs text-[var(--amber)]">
              Raw payload: {matchedCandidate.payload.length > 80
                ? matchedCandidate.payload.slice(0, 80) + '...'
                : matchedCandidate.payload}
              {numericPaths.length > 0 && ' — Select a JSON key above to extract the numeric value.'}
            </span>
          )}
          {!isJsonPayload && !extractedPreview && matchedCandidate.is_numeric && (
            <span className="text-xs text-[var(--green)]">
              Current value: {matchedCandidate.payload}
            </span>
          )}
        </div>
      )}

      {open && scanResults.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
            <Search size={14} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Filter topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.map((candidate) => (
              <button
                key={candidate.topic}
                onClick={() => handleTopicSelect(candidate)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg)] transition-colors text-left"
              >
                <span className="w-4 shrink-0">
                  {value === candidate.topic && (
                    <Check size={14} className="text-[var(--accent)]" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text)] truncate">
                      {candidate.topic}
                    </span>
                    {candidate.is_numeric && (
                      <span className="w-2 h-2 rounded-full bg-[var(--green)] shrink-0" title="Numeric" />
                    )}
                    {!candidate.is_numeric && tryParseJson(candidate.payload) && (
                      <span className="text-xs px-1 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
                        JSON
                      </span>
                    )}
                    {candidate.suggested_field && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--green)]/15 text-[var(--green)] shrink-0">
                        {candidate.suggested_field}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)] truncate block">
                    {candidate.payload.length > 60
                      ? candidate.payload.slice(0, 60) + '...'
                      : candidate.payload}
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-[var(--text-muted)] text-center">
                No matching topics
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
