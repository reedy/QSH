/**
 * INSTRUCTION-90D — flow_rate sensor binding is present and optional in the
 * wizard's sensor step for both MQTT and HA drivers. StepReview surfaces it
 * so the operator always sees whether the capability fallback is in effect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepSensors } from '../StepSensors'
import { StepReview } from '../StepReview'

beforeEach(() => {
  // useEntityScan auto-fires on mount (INSTRUCTION-90C); stub the fetch.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: {}, total_entities: 0 }),
  } as Response)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StepSensors — flow_rate field visibility', () => {
  it('MQTT driver exposes flow rate sensor in core sensors', () => {
    const config = {
      driver: 'mqtt',
      mqtt: { broker: 'localhost', port: 1883, inputs: {} },
    }
    render(<StepSensors config={config} onUpdate={vi.fn()} />)
    // The label "Flow rate sensor (optional)" appears in core sensors,
    // NOT hidden behind the Additional Sensors toggle.
    expect(screen.getByText(/Flow rate sensor \(optional\)/i)).toBeDefined()
    expect(
      screen.getByText(/Live flow rate \(L\/min\) improves COP calculation/i),
    ).toBeDefined()
  })

  it('MQTT flow_rate is not a required field', () => {
    const config = {
      driver: 'mqtt',
      mqtt: { broker: 'localhost', port: 1883, inputs: {} },
    }
    render(<StepSensors config={config} onUpdate={vi.fn()} />)
    // Required fields are rendered with an asterisk inside the label —
    // the flow_rate label should not contain one.
    const label = screen.getByText(/Flow rate sensor \(optional\)/i)
    expect(label.textContent).not.toContain('*')
  })

  it('HA driver exposes flow rate entity picker with helper text', () => {
    const config = { driver: 'ha' }
    render(<StepSensors config={config} onUpdate={vi.fn()} />)
    // HA path shows Flow rate sensor in "Additional HP Sensors" section.
    // Click the disclosure to reveal it.
    const toggle = screen.getByText(/Additional HP Sensors/i)
    fireEvent.click(toggle)
    expect(screen.getByText(/Flow rate sensor \(optional\)/i)).toBeDefined()
    expect(
      screen.getByText(/Live flow rate \(L\/min\) improves COP calculation/i),
    ).toBeDefined()
  })
})

describe('StepReview — flow_rate summary row', () => {
  it('MQTT: shows fallback notice when flow_rate topic unset', () => {
    const config = {
      driver: 'mqtt' as const,
      rooms: {},
      mqtt: {
        broker: 'localhost',
        port: 1883,
        inputs: { hp_flow_temp: { topic: 'test/flow', format: 'plain' as const } },
      },
    }
    render(
      <StepReview
        config={config}
        validationWarnings={[]}
        isDeploying={false}
        onDeploy={async () => null}
      />,
    )
    expect(screen.getByText(/Flow rate sensor/i)).toBeDefined()
    expect(screen.getByText(/Not configured \(capability fallback\)/i)).toBeDefined()
  })

  it('HA: shows configured flow_rate entity when set', () => {
    const config = {
      driver: 'ha' as const,
      rooms: {},
      heat_source: {
        type: 'heat_pump' as const,
        sensors: { flow_rate: 'sensor.hp_flow_rate' },
      },
    }
    render(
      <StepReview
        config={config}
        validationWarnings={[]}
        isDeploying={false}
        onDeploy={async () => null}
      />,
    )
    expect(screen.getByText(/Flow rate sensor/i)).toBeDefined()
    expect(screen.getByText('sensor.hp_flow_rate')).toBeDefined()
  })

  it('HA: shows fallback notice when flow_rate entity unset', () => {
    const config = {
      driver: 'ha' as const,
      rooms: {},
      heat_source: { type: 'heat_pump' as const, sensors: {} },
    }
    render(
      <StepReview
        config={config}
        validationWarnings={[]}
        isDeploying={false}
        onDeploy={async () => null}
      />,
    )
    expect(screen.getByText(/Flow rate sensor/i)).toBeDefined()
    expect(screen.getByText(/Not configured \(capability fallback\)/i)).toBeDefined()
  })
})
