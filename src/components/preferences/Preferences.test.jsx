import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/mlApi', () => ({
  getPreferences: vi.fn().mockResolvedValue({
    update_counts: {
      total_updates: 7,
      eq_updates: 3,
      genre_updates: {
        jazz: 2,
      },
    },
    session_count: 2,
  }),
  resetPreferences: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

import Preferences from './Preferences';

describe('Preferences smoke', () => {
  it('renders and loads preferences summary', async () => {
    render(<Preferences />);

    expect(screen.getByText('Preferences')).toBeInTheDocument();

    await waitFor(() => {
      const totalUpdatesCard = screen.getByText('Total Updates').closest('.stat-card');
      const sessionsCard = screen.getByText('Sessions Logged').closest('.stat-card');

      expect(totalUpdatesCard).not.toBeNull();
      expect(sessionsCard).not.toBeNull();

      expect(within(totalUpdatesCard).getByText('7')).toBeInTheDocument();
      expect(within(sessionsCard).getByText('2')).toBeInTheDocument();
    });
  });
});
