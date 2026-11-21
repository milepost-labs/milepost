import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useMyRoles, programmeLabel, type RoleProgramme } from './useMyRoles';

const mockFetchProgrammes = vi.fn();
vi.mock('../../lib/indexer', () => ({
  fetchProgrammes: () => mockFetchProgrammes(),
}));

const mockProgrammeAt = vi.fn();
vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: mockProgrammeAt,
  }),
}));

function TestRolesConsumer({ address }: { address: string | null }) {
  const { all, mine, verifierOf, reviewerOf } = useMyRoles(address);

  if (!address) {
    return <div data-testid="status">Signed out</div>;
  }

  if (all === null) {
    return <div data-testid="status">Loading</div>;
  }

  return (
    <div>
      <div data-testid="status">Loaded</div>
      <div data-testid="all-count">{all.length}</div>
      <div data-testid="mine-count">{mine?.length ?? 0}</div>
      <ul aria-label="Verifier roles">
        {verifierOf.map((p) => (
          <li key={p.id}>
            <span>{programmeLabel(all, p.id) ?? p.id}</span>
            <span>{p.phase ?? 'no-phase'}</span>
          </li>
        ))}
      </ul>
      <ul aria-label="Reviewer roles">
        {reviewerOf.map((p) => (
          <li key={p.id}>
            <span>{programmeLabel(all, p.id) ?? p.id}</span>
            <span>{p.phase ?? 'no-phase'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('useMyRoles', () => {
  const ADDR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const OTHER_ADDR = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null lists when address is null (signed out)', () => {
    render(<TestRolesConsumer address={null} />);
    expect(screen.getByTestId('status').textContent).toBe('Signed out');
    expect(mockFetchProgrammes).not.toHaveBeenCalled();
    expect(mockProgrammeAt).not.toHaveBeenCalled();
  });

  it('handles empty index results cleanly', async () => {
    mockFetchProgrammes.mockResolvedValue([]);

    render(<TestRolesConsumer address={ADDR} />);
    expect(screen.getByTestId('status').textContent).toBe('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    expect(screen.getByTestId('all-count').textContent).toBe('0');
    expect(screen.getByTestId('mine-count').textContent).toBe('0');
  });

  it('handles index fetch failure by falling back to empty list', async () => {
    mockFetchProgrammes.mockRejectedValue(new Error('Network error loading index'));

    render(<TestRolesConsumer address={ADDR} />);
    expect(screen.getByTestId('status').textContent).toBe('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    expect(screen.getByTestId('all-count').textContent).toBe('0');
    expect(screen.getByTestId('mine-count').textContent).toBe('0');
  });

  it('handles an index entry that the chain disagrees with (not verifier or reviewer)', async () => {
    mockFetchProgrammes.mockResolvedValue([
      { id: 'C_PROG_1', name: 'Indexed Programme 1' },
    ]);

    mockProgrammeAt.mockReturnValue({
      is_verifier: vi.fn().mockResolvedValue({ result: false }),
      is_reviewer: vi.fn().mockResolvedValue({ result: false }),
      get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Open' }) } }),
    });

    render(<TestRolesConsumer address={ADDR} />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    expect(screen.getByTestId('all-count').textContent).toBe('1');
    expect(screen.getByTestId('mine-count').textContent).toBe('0');
    expect(screen.queryByRole('list', { name: 'Verifier roles' })?.children).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Reviewer roles' })?.children).toHaveLength(0);
  });

  it('detects verifier-only, reviewer-only, and both roles across programmes', async () => {
    mockFetchProgrammes.mockResolvedValue([
      { id: 'C_VERIFIER', name: 'Verifier Only Prog' },
      { id: 'C_REVIEWER', name: 'Reviewer Only Prog' },
      { id: 'C_BOTH', name: 'Both Roles Prog' },
    ]);

    mockProgrammeAt.mockImplementation((id: string) => {
      if (id === 'C_VERIFIER') {
        return {
          is_verifier: vi.fn().mockResolvedValue({ result: true }),
          is_reviewer: vi.fn().mockResolvedValue({ result: false }),
          get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Settled' }) } }),
        };
      }
      if (id === 'C_REVIEWER') {
        return {
          is_verifier: vi.fn().mockResolvedValue({ result: false }),
          is_reviewer: vi.fn().mockResolvedValue({ result: true }),
          get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Review' }) } }),
        };
      }
      return {
        is_verifier: vi.fn().mockResolvedValue({ result: true }),
        is_reviewer: vi.fn().mockResolvedValue({ result: true }),
        get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Open' }) } }),
      };
    });

    render(<TestRolesConsumer address={ADDR} />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    expect(screen.getByTestId('all-count').textContent).toBe('3');
    expect(screen.getByTestId('mine-count').textContent).toBe('3');

    const verifierList = screen.getByRole('list', { name: 'Verifier roles' });
    expect(verifierList.children).toHaveLength(2);
    expect(verifierList.textContent).toContain('Verifier Only Prog');
    expect(verifierList.textContent).toContain('Both Roles Prog');

    const reviewerList = screen.getByRole('list', { name: 'Reviewer roles' });
    expect(reviewerList.children).toHaveLength(2);
    expect(reviewerList.textContent).toContain('Reviewer Only Prog');
    expect(reviewerList.textContent).toContain('Both Roles Prog');
  });

  it('sorts reviewer roles with Review-phase programmes first', async () => {
    mockFetchProgrammes.mockResolvedValue([
      { id: 'C_OPEN', name: 'Open Programme' },
      { id: 'C_REVIEW', name: 'Review Programme' },
      { id: 'C_SETTLED', name: 'Settled Programme' },
    ]);

    mockProgrammeAt.mockImplementation((id: string) => {
      const tag = id === 'C_OPEN' ? 'Open' : id === 'C_REVIEW' ? 'Review' : 'Settled';
      return {
        is_verifier: vi.fn().mockResolvedValue({ result: false }),
        is_reviewer: vi.fn().mockResolvedValue({ result: true }),
        get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag }) } }),
      };
    });

    render(<TestRolesConsumer address={ADDR} />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    const reviewerItems = screen.getByRole('list', { name: 'Reviewer roles' }).querySelectorAll('li');
    expect(reviewerItems[0].textContent).toContain('Review Programme');
  });

  it('handles contract client read errors gracefully', async () => {
    mockFetchProgrammes.mockResolvedValue([
      { id: 'C_FAIL_SYNC', name: 'Sync Throw Prog' },
      { id: 'C_FAIL_READS', name: 'Async Rejections Prog' },
    ]);

    mockProgrammeAt.mockImplementation((id: string) => {
      if (id === 'C_FAIL_SYNC') {
        throw new Error('Sync instantiation failure');
      }
      return {
        is_verifier: vi.fn().mockRejectedValue(new Error('RPC network fail')),
        is_reviewer: vi.fn().mockRejectedValue(new Error('RPC network fail')),
        get_phase: vi.fn().mockRejectedValue(new Error('RPC network fail')),
      };
    });

    render(<TestRolesConsumer address={ADDR} />);

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });

    expect(screen.getByTestId('all-count').textContent).toBe('2');
    expect(screen.getByTestId('mine-count').textContent).toBe('0');
  });

  it('handles address switching without showing previous address roles', async () => {
    mockFetchProgrammes.mockResolvedValue([
      { id: 'C_PROG', name: 'Test Prog' },
    ]);

    mockProgrammeAt.mockImplementation(() => ({
      is_verifier: vi.fn().mockImplementation(({ addr }) =>
        Promise.resolve({ result: addr === ADDR }),
      ),
      is_reviewer: vi.fn().mockResolvedValue({ result: false }),
      get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Open' }) } }),
    }));

    const { rerender } = render(<TestRolesConsumer address={ADDR} />);

    await waitFor(() => {
      expect(screen.getByTestId('mine-count').textContent).toBe('1');
    });

    // Switch address to OTHER_ADDR
    rerender(<TestRolesConsumer address={OTHER_ADDR} />);
    expect(screen.getByTestId('status').textContent).toBe('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('Loaded');
    });
    expect(screen.getByTestId('mine-count').textContent).toBe('0');
  });

  it('cancels state update cleanly if unmounted before reads complete', async () => {
    mockFetchProgrammes.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), 50)));

    const { unmount } = render(<TestRolesConsumer address={ADDR} />);
    expect(screen.getByTestId('status').textContent).toBe('Loading');
    unmount();
  });
});

describe('programmeLabel', () => {
  const programmes: RoleProgramme[] = [
    { id: 'C_PROG_1', name: 'Community Resilience', isVerifier: true, isReviewer: false, phase: 'Open' },
    { id: 'C_PROG_2', name: null, isVerifier: false, isReviewer: true, phase: 'Review' },
  ];

  it('returns programme name when present in list', () => {
    expect(programmeLabel(programmes, 'C_PROG_1')).toBe('Community Resilience');
  });

  it('returns null when programme name is null', () => {
    expect(programmeLabel(programmes, 'C_PROG_2')).toBeNull();
  });

  it('returns null when programme id is not found', () => {
    expect(programmeLabel(programmes, 'C_NONEXISTENT')).toBeNull();
  });

  it('returns null when all is null', () => {
    expect(programmeLabel(null, 'C_PROG_1')).toBeNull();
  });
});
