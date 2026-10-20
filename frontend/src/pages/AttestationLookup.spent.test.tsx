import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FIXTURE_ATTESTATIONS } from '../fixtures/attestationFixtures';
import { AttestationLookup } from './AttestationLookup';

// Issue #408 — the used/unused state comes from `program.is_spent` for the
// selected programme, never from a fixture flag. Without a programme the page
// says the check needs one.

const PROGRAMME = `C${'A'.repeat(55)}`;
const sample = FIXTURE_ATTESTATIONS.find((a) => !a.revoked)!;

const state = vi.hoisted(() => {
  const programme = {
    is_spent: (...args: unknown[]) => state.isSpent(...args),
  };
  // Stable across renders, like the real provider's memoized `programmeAt`.
  const programmeAt = () => programme;
  return { isSpent: vi.fn(), programmeAt };
});

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: state.programmeAt }),
}));

function renderPage() {
  return render(<AttestationLookup />);
}

function lookUpSample() {
  fireEvent.click(screen.getByRole('button', { name: sample.uid }));
}

function selectProgramme() {
  fireEvent.change(
    screen.getByLabelText('Programme (to check whether a proof was used)'),
    { target: { value: PROGRAMME } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use programme' }));
}

describe('AttestationLookup spent status', () => {
  beforeEach(() => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: true }));
  });

  it('asks for a programme instead of guessing the used state', () => {
    renderPage();
    lookUpSample();

    expect(screen.getByText('Select a programme to check usage')).toBeTruthy();
    expect(state.isSpent).not.toHaveBeenCalled();
  });

  it('shows a proof already spent in the selected programme', async () => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: true }));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Already released a tranche here');
    // The status names the programme it was checked against.
    expect(screen.getByText(PROGRAMME)).toBeTruthy();
    expect(state.isSpent).toHaveBeenCalled();
    expect(state.isSpent.mock.calls[0][0].attestation.toString('hex')).toBe(sample.uid);
  });

  it('shows a proof that is still unused in the selected programme', async () => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: false }));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Not used in this programme');
  });

  it('does not claim the proof is unused when the read fails', async () => {
    state.isSpent = vi.fn(() => Promise.reject(new Error('rpc down')));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Could not check this programme');
  });
});
