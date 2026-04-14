/**
 * INSTRUCTION-90E — StepTariff surfaces import vs export tariffs and renders
 * an actionable error for export-only accounts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StepTariff } from '../StepTariff'

const BASE_CONFIG = {
  energy: {
    octopus: { api_key: 'sk_live_xxx', account_number: 'A-1234' },
  },
}

function mockFetch(json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(json),
    json: async () => json,
  } as Response)
}

async function clickTest() {
  fireEvent.click(screen.getByText(/Test Connection/i))
}

beforeEach(() => {
  // nothing
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StepTariff — Octopus direction handling', () => {
  it('renders import as primary and export as informational row when both present', async () => {
    mockFetch({
      success: true,
      message: 'Connected. Import tariff: E-1R-AGILE-FLEX-22-11-25-A',
      tariff_code: 'E-1R-AGILE-FLEX-22-11-25-A',
      export_tariff: 'E-1R-OUTGOING-FIX-12M-19-05-13-A',
      additional_import_tariffs: [],
      account_number: 'A-1234',
    })

    render(<StepTariff config={BASE_CONFIG} onUpdate={vi.fn()} />)
    await clickTest()

    await waitFor(() =>
      expect(screen.getByText('E-1R-AGILE-FLEX-22-11-25-A')).toBeDefined(),
    )
    expect(screen.getByText('Import tariff')).toBeDefined()
    expect(screen.getByText(/Export tariff \(informational/i)).toBeDefined()
    expect(screen.getByText('E-1R-OUTGOING-FIX-12M-19-05-13-A')).toBeDefined()
  })

  it('hides export row when export_tariff is null', async () => {
    mockFetch({
      success: true,
      message: 'Connected. Import tariff: E-1R-AGILE-FLEX-22-11-25-A',
      tariff_code: 'E-1R-AGILE-FLEX-22-11-25-A',
      export_tariff: null,
      additional_import_tariffs: [],
      account_number: 'A-1234',
    })

    render(<StepTariff config={BASE_CONFIG} onUpdate={vi.fn()} />)
    await clickTest()

    await waitFor(() =>
      expect(screen.getByText('E-1R-AGILE-FLEX-22-11-25-A')).toBeDefined(),
    )
    expect(screen.queryByText(/Export tariff \(informational/i)).toBeNull()
  })

  it('shows actionable error for export-only account', async () => {
    mockFetch({
      success: false,
      message:
        'No import tariff found on this Octopus account. QSH optimises import cost — export-only accounts are not supported. Add your import agreement in the Octopus dashboard and retry.',
      tariff_code: null,
      export_tariff: 'E-1R-OUTGOING-FIX-12M-A',
      additional_import_tariffs: [],
      account_number: 'A-5678',
    })

    render(<StepTariff config={BASE_CONFIG} onUpdate={vi.fn()} />)
    await clickTest()

    await waitFor(() =>
      expect(screen.getByText(/No import tariff found/i)).toBeDefined(),
    )
    expect(screen.getByText(/Only an export \(Outgoing\) tariff/i)).toBeDefined()
    expect(screen.getByText('E-1R-OUTGOING-FIX-12M-A')).toBeDefined()
    // Primary-import panel is NOT rendered for export-only
    expect(screen.queryByText('Import tariff')).toBeNull()
  })

  it('shows multi-MPAN warning when additional_import_tariffs populated', async () => {
    mockFetch({
      success: true,
      message: 'Connected. Import tariff: E-1R-ECO7-DAY-A',
      tariff_code: 'E-1R-ECO7-DAY-A',
      export_tariff: null,
      additional_import_tariffs: ['E-1R-ECO7-NIGHT-A'],
      account_number: 'A-9999',
    })

    render(<StepTariff config={BASE_CONFIG} onUpdate={vi.fn()} />)
    await clickTest()

    await waitFor(() =>
      expect(screen.getByText(/Multiple import tariffs detected/i)).toBeDefined(),
    )
    expect(screen.getByText('E-1R-ECO7-NIGHT-A')).toBeDefined()
  })
})
