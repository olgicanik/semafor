import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SemaphoreDot from '../components/common/SemaphoreDot.jsx';
import Supergraphic from '../components/common/Supergraphic.jsx';
import PollingCountdown from '../components/common/PollingCountdown.jsx';

describe('SemaphoreDot', () => {
  it('renders the status as data-status and the pulse class', () => {
    const { container } = render(<SemaphoreDot status="red" />);
    const dot = container.querySelector('.sema-dot');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('data-status', 'red');
    expect(dot.className).toContain('sema-dot--red');
    expect(dot.className).toContain('sema-dot--pulse');
  });

  it('renders muted for a null status without pulsing', () => {
    const { container } = render(<SemaphoreDot status={null} />);
    const dot = container.querySelector('.sema-dot');
    expect(dot).toHaveAttribute('data-status', 'muted');
    expect(dot.className).toContain('sema-dot--muted');
    expect(dot.className).not.toContain('sema-dot--pulse');
  });
});

describe('Supergraphic', () => {
  it('renders an aria-hidden decorative bar', () => {
    const { container } = render(<Supergraphic />);
    const bar = container.querySelector('.supergraphic');
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('PollingCountdown', () => {
  it('renders the countdown text and a progress node keyed by lastUpdated', () => {
    const lastUpdated = new Date('2026-10-22T09:00:00Z');
    const { container } = render(<PollingCountdown seconds={8} isRefreshing={false} lastUpdated={lastUpdated} />);
    expect(screen.getByText('Refreshes in 8s')).toBeInTheDocument();
    const fill = container.querySelector('.poll-progress__fill');
    expect(fill).not.toBeNull();
    // key=lastUpdated.getTime() remounts the progress bar each poll
  });

  it('renders "Refreshing…" while a fetch is in flight', () => {
    render(<PollingCountdown seconds={0} isRefreshing lastUpdated={null} />);
    expect(screen.getByText('Refreshing…')).toBeInTheDocument();
  });
});
