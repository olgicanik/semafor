import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ServerCard from '../components/domain/server/ServerCard.jsx';
import ServerHeader from '../components/domain/server/ServerHeader.jsx';
import ServerMetricsSummary from '../components/domain/server/ServerMetrics.jsx';
import ServerHealthBadge from '../components/domain/server/ServerHealthBadge.jsx';
import ServerPinToggle from '../components/domain/server/ServerPinToggle.jsx';

const server = {
  id: 'srv-1',
  name: 'QA Payments',
  environment: 'qa',
  auth_type: 'basic_auth',
  is_pinned: false,
  jobs: [
    { id: 'j-1', name: 'Settlement Run', status: 'red', project: 'SAP-Sync',
      errorMessage: 'Error - last run failed', lastRun: '2026-10-22T08:05:00+00:00' },
    { id: 'j-2', name: 'Recon', status: 'green', project: 'SAP-Sync',
      errorMessage: '', lastRun: '2026-10-22T07:55:00+00:00' },
  ],
};

describe('ServerCard (composed presenter)', () => {
  it('renders the server name, both jobs and their colour dots', () => {
    const { container } = render(<ServerCard server={server} onTogglePin={() => {}} />);
    const card = container.firstChild;
    expect(within(card).getByText('QA Payments')).toBeInTheDocument();
    expect(within(card).getByText('Settlement Run')).toBeInTheDocument();
    expect(within(card).getByText('Recon')).toBeInTheDocument();
    expect(card.querySelectorAll('.job-row [data-status]')).toHaveLength(2);
    expect(card.querySelector('.job-row [data-status="red"]')).not.toBeNull();
    expect(card.querySelector('.job-row [data-status="green"]')).not.toBeNull();
  });

  it('renders only matching jobs when a status filter is applied', () => {
    const { container } = render(<ServerCard server={server} statusFilter="red" onTogglePin={() => {}} />);
    expect(screen.getByText('Settlement Run')).toBeInTheDocument();
    expect(screen.queryByText('Recon')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.job-row [data-status]')).toHaveLength(1);
  });

  it('shows an empty-state message instead of jobs for a jobless server', () => {
    render(<ServerCard server={{ ...server, jobs: [] }} onTogglePin={() => {}} />);
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument();
  });

  it('shows a status-specific empty text when none of the server jobs match the filter', () => {
    render(<ServerCard server={{ ...server, jobs: [{ id: 'g', name: 'Recon', status: 'green' }] }}
                       statusFilter="red" onTogglePin={() => {}} />);
    expect(screen.getByText('No red jobs.')).toBeInTheDocument();
    expect(screen.queryByText('Recon')).not.toBeInTheDocument();
  });

  it('shows the pinned badge and Unpin button when pinned', () => {
    render(<ServerCard server={server} pinned onTogglePin={() => {}} />);
    expect(screen.getByText('pinned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('calls onTogglePin with the server id when Pin is clicked', async () => {
    const onTogglePin = vi.fn();
    render(<ServerCard server={server} onTogglePin={onTogglePin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(onTogglePin).toHaveBeenCalledWith('srv-1');
  });

  it('routes a job badge click upward via onShowServerErrors (with the job)', async () => {
    const onShowServerErrors = vi.fn();
    render(<ServerCard server={server} onTogglePin={() => {}} onShowServerErrors={onShowServerErrors} />);
    // The red job row's badge is clickable and routes that job upward.
    const redRow = screen.getByText('Settlement Run').closest('.job-row');
    await userEvent.click(within(redRow).getByText('Critical'));
    expect(onShowServerErrors).toHaveBeenCalledWith(server.jobs[0]);
  });
});

describe('ServerHeader', () => {
  it('renders the name and the monospace address with a copy button', () => {
    render(<ServerHeader server={server} />);
    expect(screen.getByText('QA Payments')).toBeInTheDocument();
    expect(screen.getByText('srv-1')).toBeInTheDocument();
    expect(screen.getByTestId('copy-address')).toBeInTheDocument();
  });
});

describe('ServerMetricsSummary', () => {
  it('renders Total / Healthy / Warning / Critical counters', () => {
    render(<ServerMetricsSummary jobs={server.jobs} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    // 2 total, 1 healthy + 1 critical (two pills with count 1), 0 warning
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('ServerHealthBadge', () => {
  it('aggregates the server to its worst job status', () => {
    const { rerender } = render(<ServerHealthBadge jobs={server.jobs} />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
    rerender(<ServerHealthBadge jobs={[{ status: 'green' }]} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    rerender(<ServerHealthBadge jobs={[]} />);
    expect(screen.getByText('Muted')).toBeInTheDocument();
  });
});

describe('ServerPinToggle', () => {
  it('renders Pin/Unpin with aria-pressed and calls onToggle', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ServerPinToggle pinned={false} onToggle={onToggle} />);
    const pin = screen.getByRole('button', { name: 'Pin' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pin);
    expect(onToggle).toHaveBeenCalled();
    rerender(<ServerPinToggle pinned onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-pressed', 'true');
  });
});
