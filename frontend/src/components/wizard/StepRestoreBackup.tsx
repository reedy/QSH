import { useState, useRef, useEffect, useCallback } from 'react'
import { Archive, Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { apiUrl } from '../../lib/api'
import { cn } from '../../lib/utils'

interface StepRestoreBackupProps {
  onSkip: () => void
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export function StepRestoreBackup({ onSkip }: StepRestoreBackupProps) {
  const [choice, setChoice] = useState<'restore' | 'fresh' | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearPolling()
  }, [clearPolling])

  const startPolling = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(apiUrl('api/health'))
        if (resp.ok) {
          clearPolling()
          window.location.reload()
        }
      } catch {
        // Expected while addon is restarting
      }
    }, 3000)

    timeoutRef.current = setTimeout(() => {
      clearPolling()
      setPollTimedOut(true)
    }, 60000)
  }, [clearPolling])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setUploadState('uploading')
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch(
        apiUrl('api/backup/restore?mode=replace&restore_config=true'),
        { method: 'POST', body: formData }
      )
      const data = await resp.json()
      if (resp.ok) {
        setUploadState('success')
        startPolling()
      } else {
        setUploadState('error')
        setErrorMessage(data.detail || 'Restore failed')
      }
    } catch {
      setUploadState('error')
      setErrorMessage('Network error')
    }
  }

  const handleRetry = () => {
    setUploadState('idle')
    setErrorMessage('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent)]/10">
          <Archive size={32} className="text-[var(--accent)]" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text)]">
          Migrating from another install?
        </h2>
        <p className="text-[var(--text-muted)] max-w-lg mx-auto">
          If you have a QSH backup from a previous installation, you can restore
          it now. This will restore your configuration, room setup, and learned
          thermal parameters.
        </p>
      </div>

      <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
        <button
          onClick={() => setChoice('restore')}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border text-sm transition-colors',
            choice === 'restore'
              ? 'border-[var(--accent)] bg-[var(--accent)]/5'
              : 'border-[var(--border)] hover:border-[var(--accent)]/50'
          )}
        >
          <Archive size={20} className="text-[var(--accent)]" />
          <span className="font-medium">Restore from Backup</span>
          <span className="text-xs text-[var(--text-muted)]">
            Upload a .zip backup file
          </span>
        </button>
        <button
          onClick={onSkip}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border text-sm transition-colors',
            choice === 'fresh'
              ? 'border-[var(--accent)] bg-[var(--accent)]/5'
              : 'border-[var(--border)] hover:border-[var(--accent)]/50'
          )}
        >
          <Sparkles size={20} className="text-[var(--accent)]" />
          <span className="font-medium">Fresh Install</span>
          <span className="text-xs text-[var(--text-muted)]">
            Start the setup wizard
          </span>
        </button>
      </div>

      {choice === 'restore' && (
        <div className="max-w-md mx-auto p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] space-y-4">
          {uploadState === 'idle' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="block w-full text-sm text-[var(--text)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--bg)] file:text-sm file:font-medium file:text-[var(--text)]"
              />
              <button
                onClick={handleUpload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
              >
                Upload & Restore
              </button>
            </>
          )}

          {uploadState === 'uploading' && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              Restoring…
            </div>
          )}

          {uploadState === 'success' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-[var(--green)]">
                <CheckCircle2 size={16} />
                Restored successfully. QSH is restarting with your configuration…
              </div>
              {!pollTimedOut ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Loader2 size={14} className="animate-spin" />
                  Waiting for QSH to restart…
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  QSH is taking longer than expected to restart. You may need to
                  refresh the page manually.
                </p>
              )}
            </div>
          )}

          {uploadState === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-[var(--red)]">
                <AlertTriangle size={16} />
                {errorMessage}
              </div>
              <button
                onClick={handleRetry}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--bg)]"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
