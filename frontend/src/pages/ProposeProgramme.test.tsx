import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { parseProposalParam } from '../fixtures/adminFixtures';
import { ProposeProgramme } from './ProposeProgramme';

// Pure client-side form — nothing here reads the chain, so no useSoroban mock
// is needed (unlike the dashboards, which follow FunderDashboard.test.tsx's
// pattern instead).

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('ProposeProgramme', () => {
  it('reflects entered fields in the summary text', () => {
    render(<ProposeProgramme />);
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano clinic stipends' } });
    fireEvent.change(screen.getByLabelText('What it pays for'), { target: { value: 'Monthly nurse stipends' } });

    const summary = screen.getByText(/Programme proposal: Kano clinic stipends/);
    expect(summary.textContent).toContain('What it pays for: Monthly nurse stipends');
  });

  it('has no deploy link until the programme is named', () => {
    render(<ProposeProgramme />);
    expect(screen.queryByRole('button', { name: /copy deploy link/i })).toBeNull();
    expect(screen.getByText('Name the programme to make a deploy link.')).toBeTruthy();
  });

  it('round-trips the deploy link through the wizard’s parser with non-ASCII text', async () => {
    render(<ProposeProgramme />);
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Café Niño stipends' } });
    fireEvent.change(screen.getByLabelText('Who can confirm it?'), { target: { value: 'Dirección del clínica' } });

    fireEvent.click(screen.getByRole('button', { name: /copy deploy link/i }));

    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;
    expect(writeText).toHaveBeenCalledTimes(1);
    const link = writeText.mock.calls[0][0] as string;

    const proposalParam = new URL(link).searchParams.get('proposal');
    const parsed = parseProposalParam(proposalParam);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.proposal.name).toBe('Café Niño stipends');
      expect(parsed.proposal.verifier).toBe('Dirección del clínica');
    }
  });

  it('has a mailto link carrying the summary and the deploy link', () => {
    render(<ProposeProgramme />);
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Test programme' } });

    const mailLink = screen.getByRole('link', { name: /email it/i });
    expect(mailLink.getAttribute('href')).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(mailLink.getAttribute('href') ?? '')).toContain('Test programme');
  });
});
