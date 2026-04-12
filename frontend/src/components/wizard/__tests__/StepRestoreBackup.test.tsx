import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StepRestoreBackup } from '../StepRestoreBackup'

describe('StepRestoreBackup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders two option cards', () => {
    const onSkip = vi.fn()
    render(<StepRestoreBackup onSkip={onSkip} />)
    expect(screen.getByText('Restore from Backup')).toBeDefined()
    expect(screen.getByText('Fresh Install')).toBeDefined()
  })

  it('Fresh Install calls onSkip', () => {
    const onSkip = vi.fn()
    render(<StepRestoreBackup onSkip={onSkip} />)
    fireEvent.click(screen.getByText('Fresh Install'))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('Restore card shows file upload', () => {
    const onSkip = vi.fn()
    render(<StepRestoreBackup onSkip={onSkip} />)
    fireEvent.click(screen.getByText('Restore from Backup'))
    expect(screen.getByText('Upload & Restore')).toBeDefined()
  })

  it('successful restore shows success and polls', async () => {
    const onSkip = vi.fn()
    const mockFetch = vi.fn()

    // First call: restore endpoint → success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          restored: ['qsh.yaml', 'sysid_state.json'],
          message: 'Restore complete',
        }),
    })
    // Subsequent calls: health poll → 200
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    vi.stubGlobal('fetch', mockFetch)

    render(<StepRestoreBackup onSkip={onSkip} />)
    fireEvent.click(screen.getByText('Restore from Backup'))

    // Create a mock file and set it on the input
    const file = new File(['fake-zip'], 'backup.zip', { type: 'application/zip' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })

    // Click upload and flush all microtasks so the async handler completes
    await act(async () => {
      fireEvent.click(screen.getByText('Upload & Restore'))
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getByText(/Restored successfully/)).toBeDefined()

    // Verify the restore call was made with correct URL
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api/backup/restore?mode=replace&restore_config=true'),
      expect.objectContaining({ method: 'POST' })
    )

    // Advance past the 3s polling interval to trigger health check
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })

    const healthCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('api/health')
    )
    expect(healthCalls.length).toBeGreaterThan(0)
  })

  it('failed restore shows error', async () => {
    const onSkip = vi.fn()
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'qsh.yaml in backup is not valid YAML' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<StepRestoreBackup onSkip={onSkip} />)
    fireEvent.click(screen.getByText('Restore from Backup'))

    const file = new File(['fake-zip'], 'backup.zip', { type: 'application/zip' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })

    await act(async () => {
      fireEvent.click(screen.getByText('Upload & Restore'))
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getByText(/not valid YAML/)).toBeDefined()

    // No polling should have started
    const healthCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('api/health')
    )
    expect(healthCalls.length).toBe(0)
  })
})
