import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ServerCard from '../components/ServerCard.jsx'

const server = {
  id: 'srv-1',
  name: 'QA Payments',
  environment: 'qa',
  auth_type: 'basic_auth',
  is_pinned: false,
  jobs: [
    { id: 'j-1', name: 'Settlement Run', status: 'red',
      last_run: '2026-10-22T08:05:00+00:00', message: 'Error - last run failed' },
    { id: 'j-2', name: 'Recon', status: 'green',
      last_run: '2026-10-22T07:55:00+00:00', message: 'Running - all checks passing' },
  ],
}

describe('ServerCard', () => {
  it('renders the server name, both jobs and their colour dots', () => {
    const { container } = render(<ServerCard server={server} onTogglePin={() => {}} />)
    const card = container.firstChild
    expect(within(card).getByText('QA Payments')).toBeInTheDocument()
    expect(within(card).getByText('Settlement Run')).toBeInTheDocument()
    expect(within(card).getByText('Recon')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-status]')).toHaveLength(2)
    expect(container.querySelector('[data-status="red"]')).not.toBeNull()
    expect(container.querySelector('[data-status="green"]')).not.toBeNull()
  })

  it('renders only matching jobs when a status filter is applied', () => {
    const { container } = render(<ServerCard server={server} statusFilter="red" onTogglePin={() => {}} />)
    expect(screen.getByText('Settlement Run')).toBeInTheDocument()
    expect(screen.queryByText('Recon')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-status]')).toHaveLength(1)
  })

  it('shows an empty-state message instead of jobs for a jobless server', () => {
    render(<ServerCard server={{ ...server, jobs: [] }} onTogglePin={() => {}} />)
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument()
  })

  it('shows the pinned badge and Unpin button when pinned', () => {
    render(<ServerCard server={{ ...server, is_pinned: true }} onTogglePin={() => {}} />)
    expect(screen.getByText('pinned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument()
  })

  it('calls onTogglePin with the server when Pin is clicked', async () => {
    const onTogglePin = vi.fn()
    render(<ServerCard server={server} onTogglePin={onTogglePin} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(onTogglePin).toHaveBeenCalledWith(server)
  })
})
