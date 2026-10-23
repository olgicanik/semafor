import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AddServerModal from '../components/AddServerModal.jsx'
import AnalyticsView from '../components/AnalyticsView.jsx'

const analyticsFixture = {
  average_uptime_per_environment: [
    { environment: 'dev', average_uptime_percent: 98.5 },
    { environment: 'qa', average_uptime_percent: 99.0 },
  ],
  failure_rate_percent: 2.5,
  total_red_errors_last_24h: 1,
  most_unstable_server: 'srv-qa',
  generated_at: '2026-10-22T09:00:00+00:00',
}

describe('AddServerModal', () => {
  it('renders a labelled dialog with the auth-type selector', () => {
    render(<AddServerModal onClose={() => {}} onCreate={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Add new server')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Add new server')).toBeInTheDocument()
    expect(screen.getByTestId('auth-type')).toBeInTheDocument()
  })

  it('swaps dynamic credential fields when the auth type changes', async () => {
    render(<AddServerModal onClose={() => {}} onCreate={() => {}} />)
    await userEvent.selectOptions(screen.getByTestId('auth-type'), 'ssh')
    expect(screen.getByLabelText(/ssh private key/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('/keys/prod_box')).toBeInTheDocument()
  })

  it('submits the payload built from the form (with a minted id)', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<AddServerModal onClose={onClose} onCreate={onCreate} />)
    await userEvent.type(screen.getByLabelText(/server name/i), 'New Box')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Box',
      environment: 'dev',
      auth_type: 'api_key',
      auth_credentials: { token: '' },
    }))
    const payload = onCreate.mock.calls[0][0]
    expect(payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a role=alert error when creation rejects and does not close', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Server creation failed'))
    const onClose = vi.fn()
    render(<AddServerModal onClose={onClose} onCreate={onCreate} />)
    await userEvent.type(screen.getByLabelText(/server name/i), 'Bad Box')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server creation failed')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes the modal', async () => {
    const onClose = vi.fn()
    render(<AddServerModal onClose={onClose} onCreate={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('AnalyticsView (restyled, KPI texts preserved)', () => {
  it('renders the KPI labels and values for a populated analytics payload', () => {
    render(<AnalyticsView analytics={analyticsFixture} servers={[]} />)
    expect(screen.getByText('Uptime')).toBeInTheDocument()
    expect(screen.getByText('98.8%')).toBeInTheDocument()
    expect(screen.getByText('Failure Rate')).toBeInTheDocument()
    expect(screen.getByText('2.5%')).toBeInTheDocument()
    expect(screen.getByText('System Alerts')).toBeInTheDocument()
    expect(screen.getByText('Uptime by environment')).toBeInTheDocument()
    expect(screen.getByText('Most unstable server')).toBeInTheDocument()
  })

  it('resolves the most-unstable server id to its display name', () => {
    const servers = [{ id: 'srv-qa', name: 'Zeta QA' }]
    render(<AnalyticsView analytics={analyticsFixture} servers={servers} />)
    expect(screen.getByText(/Zeta QA/)).toBeInTheDocument()
  })

  it('renders the empty state when there is no analytics data yet', () => {
    render(<AnalyticsView analytics={null} servers={[]} />)
    expect(screen.getByText('No analytics data yet.')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
