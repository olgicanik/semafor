import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import DashboardLayout from '../components/layout/DashboardLayout.jsx'
import { pinServer } from '../api/mockApi.js'

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

// Deterministic stand-in for the poller, mirroring the old Dashboard test's mock:
// App ALWAYS calls the servers hook first and the analytics hook second, so call
// parity cleanly separates the two data channels.
const state = vi.hoisted(() => ({ call: 0, servers: undefined, analytics: undefined }))

vi.mock('../api/mockApi.js', () => ({
  fetchServers: vi.fn(),
  fetchAnalytics: vi.fn(),
  pinServer: vi.fn(),
  unpinServer: vi.fn(),
  createServer: vi.fn(),
  default: {},
}))

vi.mock('../hooks/useSafePolling.js', () => ({
  default: (fetcherFn) => {
    state.call += 1
    const isServer = state.call % 2 === 1
    return {
      data: isServer ? state.servers : state.analytics,
      error: null,
      lastUpdated: null,
      isRefreshing: false,
      secondsUntilNextPoll: 8,
      triggerRefresh: vi.fn().mockResolvedValue(undefined),
    }
  },
}))

describe('DashboardLayout (integrated through App)', () => {
  beforeEach(() => {
    localStorage.clear()
    state.call = 0
    state.servers = serversFixture
    state.analytics = analyticsFixture
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders polled servers inside their environment groups', async () => {
    render(<App />)
    expect(await screen.findByText('Alpha Dev')).toBeInTheDocument()
    expect(screen.getByText('Zeta QA')).toBeInTheDocument()
    expect(screen.getByText('Ace QA')).toBeInTheDocument()
  })

  it('switches to Analytics & Health and shows KPI values', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'Analytics & Health' }))
    expect(await screen.findByText('Uptime')).toBeInTheDocument()
    expect(screen.getByText('99.0%')).toBeInTheDocument()
    expect(screen.getByText('Failure Rate')).toBeInTheDocument()
  })

  it('filters the groups to red servers ("show only red")', async () => {
    render(<App />)
    await userEvent.selectOptions(screen.getByTestId('status-filter'), 'red')
    expect(screen.queryByText('Alpha Dev')).not.toBeInTheDocument() // only green job
    expect(screen.getByText('Zeta QA')).toBeInTheDocument()         // has a red job
  })

  it('shows "No servers match your filters." when nothing matches the query (v4 G7)', async () => {
    render(<App />)
    await userEvent.type(screen.getByTestId('search'), 'zzz-no-match')
    expect(screen.getByText('No servers match your filters.')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Dev')).not.toBeInTheDocument()
  })

  it('filters by the DEV environment tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByTestId('env-tab-dev'))
    expect(screen.getByText('Alpha Dev')).toBeInTheDocument()
    expect(screen.queryByText('Zeta QA')).not.toBeInTheDocument()
    expect(screen.queryByText('Ace QA')).not.toBeInTheDocument()
  })

  it('shows only pinned servers on the Pinned tab', async () => {
    render(<App />)
    // Zeta QA is the pinned server (seed reconciled from the backend is_pinned flag).
    await userEvent.click(screen.getByTestId('env-tab-pinned'))
    expect(screen.getByText('Pinned servers')).toBeInTheDocument()
    expect(screen.getByText('Zeta QA')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Dev')).not.toBeInTheDocument()
    expect(screen.queryByText('Ace QA')).not.toBeInTheDocument()
  })

  it('pins a server optimistically and calls the backend endpoint', async () => {
    render(<App />)
    const aceCard = (await screen.findByText('Ace QA')).closest('article')
    await userEvent.click(within(aceCard).getByRole('button', { name: 'Pin' }))
    expect(await within(aceCard).findByRole('button', { name: 'Unpin' })).toBeInTheDocument()
    expect(pinServer).toHaveBeenCalledWith('srv-qa2')
  })

  it('renders the environment health summary strip with per-env counts and status dots', async () => {
    render(<App />)
    // EnvironmentHealthSummary must render in the running app (task §1C / plan §5.3),
    // not just in its standalone unit test.
    const strip = (await screen.findByText('2 servers · 1 red')).closest('.env-health')
    const summary = within(strip)
    expect(summary.getByText('DEV')).toBeInTheDocument()
    expect(summary.getByText('QA')).toBeInTheDocument()
    expect(summary.getByText('PROD')).toBeInTheDocument()
    expect(summary.getByText('1 servers')).toBeInTheDocument()   // dev: Alpha Dev (green)
    expect(summary.getByText('0 servers')).toBeInTheDocument()   // prod: none
    // qa: Zeta QA (red) + Ace QA (green) -> worst dot red, "2 servers · 1 red"
    expect(strip.querySelectorAll('.sema-dot[data-status="red"]').length).toBeGreaterThan(0)
  })

  it('renders only the matching status jobs inside a filtered server card', async () => {
    // M2: the job-level status filter must be threaded into the cards, so a
    // red-filtered view hides a red server's green jobs (old monolith parity).
    state.servers = [
      { id: 'srv-mixed', name: 'Mixed QA', environment: 'qa', auth_type: 'api_key',
        is_pinned: false, auth_credentials: {}, history: [],
        jobs: [
          { id: 'm1', name: 'Red Run', status: 'red',
            last_run: '2026-10-22T08:00:00+00:00', message: 'down' },
          { id: 'm2', name: 'Green Run', status: 'green',
            last_run: '2026-10-22T07:00:00+00:00', message: 'ok' },
        ] },
    ]
    render(<App />)
    await userEvent.selectOptions(screen.getByTestId('status-filter'), 'red')
    expect(await screen.findByText('Red Run')).toBeInTheDocument()
    expect(screen.getByText('Mixed QA')).toBeInTheDocument()
    expect(screen.queryByText('Green Run')).not.toBeInTheDocument()
  })

  it('shows the job-level empty text when a status filter matches no jobs on a card', () => {
    render(
      <DashboardLayout
        environments={['all']} counts={{ all: 1 }} activeEnv="all" onEnvChange={() => {}}
        pinnedServers={[]}
        servers={[{
          id: 'srv-green', name: 'Green Only', environment: 'qa', health: 'green',
          jobs: [{ id: 'g1', name: 'Green Job', status: 'green' }],
        }]}
        onTogglePin={() => {}} onShowServerErrors={() => {}}
        statusFilter="red" empty={false}
      />,
    )
    expect(screen.getByText('Green Only')).toBeInTheDocument()
    expect(screen.getByText('No red jobs.')).toBeInTheDocument()
    expect(screen.queryByText('Green Job')).not.toBeInTheDocument()
  })

  it('shows the total server count on the All tab', async () => {
    render(<App />)
    await screen.findByText('Alpha Dev')
    expect(within(screen.getByTestId('env-tab-all')).getByText('3')).toBeInTheDocument()
  })

  it('renders each category group as a section holding its server cards as direct children (2-col CSS grid support)', async () => {
    render(<App />)
    await screen.findByText('Alpha Dev');          // wait for the polled fixture (default All tab)
    const group = screen.getByTestId('group-all'); // single category group on the All tab
    const card = screen.getByTestId('server-srv-dev'); // <article> (fixture srv-dev)
    expect(card.parentElement).toBe(group);        // cards are siblings inside the group section
  })
})
