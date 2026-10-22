import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EnvironmentTabs from '../components/domain/environment/EnvironmentTabs.jsx';
import EnvironmentBadge from '../components/domain/environment/EnvironmentBadge.jsx';

describe('EnvironmentTabs', () => {
  it('renders All / DEV / QA / PROD / Pinned with server counts', () => {
    render(<EnvironmentTabs active="dev" counts={{ dev: 2, qa: 1, prod: 0, pinned: 3 }} onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /DEV/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /QA/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PROD/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Pinned/ })).toBeInTheDocument();
    expect(screen.getByTestId('env-tab-pinned')).toBeInTheDocument();
    // counts render inside the tabs
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<EnvironmentTabs active="pinned" counts={{}} onChange={() => {}} />);
    expect(screen.getByTestId('env-tab-pinned')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('env-tab-all')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the clicked tab value (includes the Pinned tab)', async () => {
    const onChange = vi.fn();
    render(<EnvironmentTabs active="all" counts={{}} onChange={onChange} />);
    await userEvent.click(screen.getByTestId('env-tab-pinned'));
    expect(onChange).toHaveBeenCalledWith('pinned');
    await userEvent.click(screen.getByTestId('env-tab-qa'));
    expect(onChange).toHaveBeenCalledWith('qa');
  });
});

describe('EnvironmentBadge', () => {
  it('renders uppercase DEV / QA / PROD labels', () => {
    const { rerender } = render(<EnvironmentBadge env="dev" />);
    expect(screen.getByText('DEV')).toBeInTheDocument();
    rerender(<EnvironmentBadge env="qa" />);
    expect(screen.getByText('QA')).toBeInTheDocument();
    rerender(<EnvironmentBadge env="prod" />);
    expect(screen.getByText('PROD')).toBeInTheDocument();
  });
});
