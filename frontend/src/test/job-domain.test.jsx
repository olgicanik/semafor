import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import JobRow from '../components/domain/job/JobRow.jsx';
import JobStatusBadge from '../components/domain/job/JobStatusBadge.jsx';
import JobList from '../components/domain/job/JobList.jsx';
import JobErrorDrawer, { hintForError } from '../components/domain/job/JobErrorDrawer.jsx';

const job = {
  id: 'j-1',
  name: 'ETL_Sync_SAP',
  project: 'SAP-Sync',
  status: 'red',
  rawStatus: 'Ended with errors',
  errorMessage: 'Connection refused to 10.0.0.5',
  lastRun: '2026-10-22T08:05:00+00:00',
};

describe('hintForError', () => {
  it.each([
    ['Connection refused to 10.0.0.5', /Network/],
    ['Timeout after 60s', /timeout budget/i],
    ['Schema mismatch on column invoice_no', /Schema drift/],
    ['Job killed by user at 22:14', /Manually terminated/],
    ['Something else entirely', /No automated hint/],
  ])('%s -> %s', (message, re) => {
    expect(hintForError(message)).toMatch(re);
  });
});

describe('JobRow', () => {
  it('renders name, project, id, badge and timestamp', () => {
    render(<JobRow job={job} />);
    expect(screen.getByText('ETL_Sync_SAP')).toBeInTheDocument();
    expect(screen.getByText('SAP-Sync')).toBeInTheDocument();
    expect(screen.getByText(job.id, { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(document.querySelector('time')).toBeInTheDocument();
  });

  it('calls onShowError when the status badge is clicked', async () => {
    const onShowError = vi.fn();
    render(<JobRow job={job} onShowError={onShowError} />);
    await userEvent.click(screen.getByText('Critical'));
    expect(onShowError).toHaveBeenCalled();
  });
});

describe('JobStatusBadge', () => {
  it('renders the STATUS_LABEL for a known status and Unknown for null', () => {
    const { rerender } = render(<JobStatusBadge status="orange" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    rerender(<JobStatusBadge status={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the error message as a tooltip', () => {
    render(<JobStatusBadge status="red" errorMessage="boom" />);
    expect(screen.getByTitle('boom')).toBeInTheDocument();
  });
});

describe('JobList', () => {
  it('renders all jobs and the "No jobs yet." empty state', () => {
    const { rerender } = render(<JobList jobs={[job]} />);
    expect(screen.getByText('ETL_Sync_SAP')).toBeInTheDocument();
    rerender(<JobList jobs={[]} />);
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument();
  });
});

describe('JobErrorDrawer', () => {
  it('renders the raw error log, timestamp and a root-cause hint', () => {
    render(<JobErrorDrawer job={job} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Connection refused to 10.0.0.5')).toBeInTheDocument();
    expect(screen.getByText(/Network:/)).toBeInTheDocument();
    expect(screen.getByText('Raw error log')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<JobErrorDrawer job={job} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
