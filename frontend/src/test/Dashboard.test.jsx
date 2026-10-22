import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Dashboard, { groupServers } from '../Dashboard.jsx'

const serversFixture = [
  { id: 'srv-dev', name: 'Alpha Dev', environment: 'dev', auth_type: 'api_key',
    is_pinned: false, auth_credentials: { token: 't' }, history: [],
    jobs: [{ id: 'j1', name: 'App Build', status: 'green',
             last_run: '2026-10-22T09:00:00+00:00', message: 'ok' }] },
  { id: 'srv-qa', name: 'Zeta QA', environment: 'qa', auth_type: 'ssh',
    is_pinned: true, auth_credentials: { ssh_private_key: '/k' }, history: [],
    jobs: [{ id: 'j2', name: 'Deploy', status: 'red',
             last_run: '2026-10-22T08:00:00+00:00', message: 'down' }] },
  { id: 'srv-qa2', name: 'Ace QA', environment: 'qa', auth_type: 'api_key',
    is_pinned: false, auth_credentials: { token: 't2' }, history: [],
    jobs: [{ id: 'j3', name: 'Test', status: 'green',
             last_run: '2026-10-22T07:00:00+00:00', message: 'ok' }] },
]

const analyticsFixture = {
  average_uptime_per_environment: [{ environment: 'qa', average_uptime_percent: 99.0 }],
  failure_rate_percent: 2.5,
  total_red_errors_last_24h: 1,
  most_unstable_server: 'srv-qa',
  generated_at: '2026-10-22T09:00:00+00:00',
}

vi.mock('../api/mockApi.js', () => ({
  fetchServers: vi.fn(),
  fetchAnalytics: vi.fn(),
  pinServer: vi.fn(),
  unpinServer: vi.fn(),
  createServer: vi.fn(),
}))

// Deterministic stand-in for the poller: live tab returns servers, analytics
// tab returns the analytics fixture. Timers are skipped entirely.
vi.mock('../hooks/usePolling.js', async () => {
  const { fetchAnalytics } = await import('../api/mockApi.js')
  return {
    default: (fetchFn) => ({
      data: fetchFn === fetchAnalytics ? analyticsFixture : serversFixture,
      error: null,
      lastUpdated: null,
      isFetching: false,
      tick: 0,
      refresh: vi.fn(),
    }),
  }
})

describe('groupServers (pure)', () => {
  const base = { envFilter: 'all', statusFilter: 'all', query: '', sortBy: 'alpha' }

  it('floats pinned servers above unpinned even when name sorts later', () => {
    const groups = groupServers(serversFixture, base)
    const qa = groups.find((g) => g.env === 'qa')
    expect([...qa.pinned, ...qa.rest][0].id).toBe('srv-qa') // "Zeta" pinned → top despite alpha sort
  })

  it('filters by environment', () => {
    const groups = groupServers(serversFixture, { ...base, envFilter: 'dev' })
    expect(groups).toHaveLength(1)
    expect(groups[0].env).toBe('dev')
  })

  it('keeps only servers with a matching job status', () => {
    const groups = groupServers(serversFixture, { ...base, statusFilter: 'red' })
    const qa = groups.find((g) => g.env === 'qa')
    expect([...qa.pinned, ...qa.rest].map((s) => s.id)).toEqual(['srv-qa'])
  })

  it('searches job names', () => {
    const groups = groupServers(serversFixture, { ...base, query: 'deploy' })
    const qa = groups.find((g) => g.env === 'qa')
    expect([...qa.pinned, ...qa.rest].map((s) => s.id)).toEqual(['srv-qa'])
  })
})

describe('Dashboard (render)', () => {
  it('renders polled servers inside their environment columns', async () => {
    render(<Dashboard />)
    expect(await screen.findByText('Alpha Dev')).toBeInTheDocument()
    expect(screen.getByText('Zeta QA')).toBeInTheDocument()
    expect(screen.getByText('Ace QA')).toBeInTheDocument()
  })

  it('switches to Analytics & Health and shows KPI values', async () => {
    render(<Dashboard />)
    await userEvent.click(screen.getByRole('button', { name: 'Analytics & Health' }))
    expect(screen.getByText('Uptime')).toBeInTheDocument()
    expect(screen.getByText('99.0%')).toBeInTheDocument()
    expect(screen.getByText('Failure Rate')).toBeInTheDocument()
  })

  it('filters the columns to red servers ("show only red")', async () => {
    render(<Dashboard />)
    await userEvent.selectOptions(screen.getByTestId('status-filter'), 'red')
    expect(screen.queryByText('Alpha Dev')).not.toBeInTheDocument() // only green job
    expect(screen.getByText('Zeta QA')).toBeInTheDocument()         // has a red job
  })

  it('shows "No servers match your filters." when nothing matches the query (v4 G7)', async () => {
    render(<Dashboard />)
    await userEvent.type(screen.getByTestId('search'), 'zzz-no-match')
    expect(screen.getByText('No servers match your filters.')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Dev')).not.toBeInTheDocument()
  })
})
