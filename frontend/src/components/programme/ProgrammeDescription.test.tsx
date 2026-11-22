import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { metadataHash, type ProgrammeMetadata } from '../../lib/metadata';
import { DescriptionBand, MetadataPanel } from './ProgrammeDescription';

const COMMITTED_HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

const BASE_DOC: ProgrammeMetadata = {
  schema_version: '1.1.0',
  name: 'Rural Clinic Stipends',
  description: 'Quarterly stipends for community health workers.',
  vertical: 'health',
  contact: {
    name: 'Dr. Ada Okafor',
    email: 'ada@example.org',
    url: 'https://example.org/clinic',
  },
  links: [{ label: 'Programme charter', url: 'https://example.org/charter' }],
  labels: [
    {
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      role: 'reviewer',
      label: 'Primary Reviewer',
    },
    {
      address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABG',
      role: 'verifier',
      label: 'Field Verifier',
    },
  ],
};

describe('DescriptionBand', () => {
  it('renders the verified description and mapped sector label', () => {
    render(<DescriptionBand doc={BASE_DOC} />);

    expect(screen.getByRole('region', { name: 'Description' })).toBeTruthy();
    expect(screen.getByText(BASE_DOC.description)).toBeTruthy();
    expect(screen.getByText('Health worker stipends')).toBeTruthy();
    expect(screen.getByText(/Written by the creator, checked against the hash on the chain/)).toBeTruthy();
  });

  it('falls back to the raw vertical value when it is not a known sector', () => {
    render(<DescriptionBand doc={{ ...BASE_DOC, vertical: 'clean-water' }} />);

    expect(screen.getByText('clean-water')).toBeTruthy();
  });
});

describe('MetadataPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading message while metadata is being resolved', () => {
    render(<MetadataPanel committedHash={COMMITTED_HASH} resolved={null} />);

    expect(screen.getByText('Looking up the description…')).toBeTruthy();
  });

  it('explains when no metadata hash was committed on-chain', () => {
    render(<MetadataPanel committedHash={'0'.repeat(64)} resolved={{ status: 'none' }} />);

    expect(
      screen.getByText('No description was committed: the programme was deployed with an empty metadata hash.'),
    ).toBeTruthy();
  });

  it('shows the verified document fields including optional contact url, links, and plural labels', () => {
    render(<MetadataPanel committedHash={COMMITTED_HASH} resolved={{ status: 'ok', doc: BASE_DOC }} />);

    expect(screen.getByText('Checked.')).toBeTruthy();
    expect(screen.getByText(/This document hashes to the programme’s commitment\./)).toBeTruthy();
    expect(screen.getByText('Rural Clinic Stipends')).toBeTruthy();
    expect(screen.getByText('Health worker stipends')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ada@example.org' }).getAttribute('href')).toBe('mailto:ada@example.org');
    expect(screen.getByRole('link', { name: 'https://example.org/clinic' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Programme charter/ })).toBeTruthy();
    expect(screen.getByText('2 reviewer and verifier names, shown in the Verifiers tab')).toBeTruthy();
    expect(screen.getByText('1.1.0')).toBeTruthy();
  });

  it('handles singular label count and omitted optional fields', () => {
    const minimalDoc: ProgrammeMetadata = {
      schema_version: '1.0.0',
      name: 'Minimal Grant',
      description: 'Short description.',
      vertical: 'education',
      contact: { name: 'Coordinator', email: 'coord@example.org' },
      labels: [
        {
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          role: 'verifier',
          label: 'Sole Verifier',
        },
      ],
    };

    render(<MetadataPanel committedHash={COMMITTED_HASH} resolved={{ status: 'ok', doc: minimalDoc }} />);

    expect(screen.getByText('1 reviewer and verifier name, shown in the Verifiers tab')).toBeTruthy();
    expect(screen.queryByText('Links')).toBeNull();
    expect(screen.queryByRole('link', { name: 'https://example.org/clinic' })).toBeNull();
  });

  it('warns on hash mismatch and does not offer URL fallback', () => {
    render(
      <MetadataPanel
        committedHash={COMMITTED_HASH}
        resolved={{ status: 'mismatch', fetchedHash: OTHER_HASH }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Refused: the document doesn’t match.');
    expect(alert.textContent).toContain(OTHER_HASH.slice(0, 12));
    expect(alert.textContent).toContain(COMMITTED_HASH.slice(0, 12));
    expect(screen.queryByRole('textbox', { name: /Document address/i })).toBeNull();
  });

  it('warns on malformed metadata and offers URL fallback', () => {
    render(
      <MetadataPanel
        committedHash={COMMITTED_HASH}
        resolved={{ status: 'malformed', reason: 'The document is not valid JSON.' }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Not a valid description.');
    expect(alert.textContent).toContain('The document is not valid JSON.');
    expect(screen.getByRole('textbox', { name: /Document address/i })).toBeTruthy();
  });

  it('warns when metadata is unavailable and offers URL fallback', () => {
    render(
      <MetadataPanel
        committedHash={COMMITTED_HASH}
        resolved={{ status: 'unavailable', reason: 'Could not reach the description store.' }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Description unavailable.');
    expect(alert.textContent).toContain('Could not reach the description store.');
    expect(screen.getByRole('textbox', { name: /Document address/i })).toBeTruthy();
  });

  it('shows missing-document note and lets a user fetch and verify from a URL', async () => {
    const hash = await metadataHash(BASE_DOC);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(BASE_DOC),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MetadataPanel committedHash={hash} resolved={{ status: 'missing' }} />);

    expect(
      screen.getByText('The Milepost description store has no document for this hash. The programme works without one.'),
    ).toBeTruthy();

    const input = screen.getByRole('textbox', { name: /Document address/i });
    const button = screen.getByRole('button', { name: 'Fetch and check' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: '   ' } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'https://example.org/meta.json' } });
    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText('Checked.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('https://example.org/meta.json');
    expect(screen.getByText('Rural Clinic Stipends')).toBeTruthy();
  });

  it('refuses a URL-fetched document whose hash does not match the commitment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(BASE_DOC),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MetadataPanel committedHash={COMMITTED_HASH} resolved={{ status: 'missing' }} />);

    const input = screen.getByRole('textbox', { name: /Document address/i });
    fireEvent.change(input, { target: { value: 'https://example.org/wrong.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch and check' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Refused: the document doesn’t match.');

    // Editing the URL clears the previous outcome.
    fireEvent.change(input, { target: { value: 'https://example.org/other.json' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports non-OK HTTP responses and network failures when fetching from a URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<MetadataPanel committedHash={COMMITTED_HASH} resolved={{ status: 'missing' }} />);

    const input = screen.getByRole('textbox', { name: /Document address/i });
    fireEvent.change(input, { target: { value: 'https://example.org/502.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch and check' }));

    const firstAlert = await screen.findByRole('alert');
    expect(firstAlert.textContent).toContain('Description unavailable.');
    expect(firstAlert.textContent).toContain('The server answered 502.');

    fireEvent.change(input, { target: { value: 'https://example.org/offline.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch and check' }));

    const secondAlert = await screen.findByRole('alert');
    expect(secondAlert.textContent).toContain('Description unavailable.');
    expect(secondAlert.textContent).toContain('Could not fetch that address.');
  });
});
