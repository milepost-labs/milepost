import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  Stepper,
  AddressList,
  DetailsStep,
  PeopleStep,
  TimelineStep,
  ReviewStep,
  OTHER,
} from './DeploySteps';
import {
  parseMinAward,
  timelineErrors,
  detailsErrors,
  peopleErrors,
  type DeployDraft,
} from '../../lib/deployRules';

const REVIEWER_A = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const REVIEWER_B = 'GCSW2JNZG3XY6Q5Q4QNY7QXZV7WQZ6WXYZ6QWXYZ6QWXYZ6QWXYZ6QWX';
const VERIFIER_A = 'GAHH63NJ55XU2J4T35D6J4274T74AQUQKY73733AQUQKY73733AQUQKY';
const AUTHORITY_ADDR = 'GD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';
const TOKEN_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function makeBaseDraft(overrides: Partial<DeployDraft> = {}): DeployDraft {
  return {
    name: 'Clinic nurse stipends 2027',
    token: TOKEN_ID,
    minAward: '100',
    tranches: 3,
    schema: 'ab'.repeat(32),
    metadataHash: '',
    describe: true,
    description: 'Community health grant',
    vertical: 'health',
    contactName: 'Kano Health Trust',
    contactEmail: 'grants@example.org',
    labels: {},
    reviewers: [REVIEWER_A],
    verifiers: [VERIFIER_A],
    quorum: 1,
    applyDeadline: 1800000000,
    reviewDeadline: 1800100000,
    releaseDeadline: 1800200000,
    sweepDeadline: 1800300000,
    ...overrides,
  };
}

describe('parseMinAward helper boundary tests', () => {
  it('allows empty or blank input, returning 0 stroops', () => {
    const res = parseMinAward('', 3);
    expect(res).toEqual({ ok: true, value: 0n });

    const resSpaces = parseMinAward('   ', 3);
    expect(resSpaces).toEqual({ ok: true, value: 0n });
  });

  it('allows 0 as a valid minimum award', () => {
    const res = parseMinAward('0', 3);
    expect(res).toEqual({ ok: true, value: 0n });
  });

  it('rejects an amount smaller than 1 stroop per tranche (below minimum boundary)', () => {
    // 1 stroop is 0.0000001 (value = 1n). With 2 tranches, 1n < 2n -> fails.
    const res = parseMinAward('0.0000001', 2);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Too small to split into tranches. Use 0 for no minimum.');
    }
  });

  it('accepts an amount exactly equal to 1 stroop per tranche (exact boundary)', () => {
    // 2 stroops is 0.0000002 (value = 2n). With 2 tranches, 2n >= 2n -> ok.
    const res = parseMinAward('0.0000002', 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(2n);
    }
  });

  it('accepts an amount above 1 stroop per tranche', () => {
    // 10 units = 100,000,000 stroops -> ok.
    const res = parseMinAward('10', 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(100_000_000n);
    }
  });

  it('rejects invalid or negative amounts', () => {
    const resNegative = parseMinAward('-5', 2);
    expect(resNegative.ok).toBe(false);

    const resWords = parseMinAward('invalid', 2);
    expect(resWords.ok).toBe(false);
  });
});

describe('Stepper component', () => {
  it('renders value and respects min/max boundaries on decrement and increment', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <Stepper
        label="Tranches per award"
        noun="tranches"
        value={2}
        min={1}
        max={3}
        onChange={handleChange}
        help="One signature unlocks each."
      />,
    );

    const minusBtn = screen.getByRole('button', { name: 'Fewer tranches' });
    const plusBtn = screen.getByRole('button', { name: 'More tranches' });

    expect(minusBtn).not.toBeDisabled();
    expect(plusBtn).not.toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe('2');

    fireEvent.click(minusBtn);
    expect(handleChange).toHaveBeenCalledWith(1);

    fireEvent.click(plusBtn);
    expect(handleChange).toHaveBeenCalledWith(3);

    // Test at min boundary
    rerender(
      <Stepper
        label="Tranches per award"
        noun="tranches"
        value={1}
        min={1}
        max={3}
        onChange={handleChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fewer tranches' })).toBeDisabled();

    // Test at max boundary
    rerender(
      <Stepper
        label="Tranches per award"
        noun="tranches"
        value={3}
        min={1}
        max={3}
        onChange={handleChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'More tranches' })).toBeDisabled();
  });

  it('displays error text when provided', () => {
    render(
      <Stepper
        label="Quorum"
        noun="votes"
        value={1}
        min={1}
        max={5}
        onChange={vi.fn()}
        error="Quorum must be at least 1."
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Quorum must be at least 1.');
  });
});

describe('AddressList component', () => {
  it('adds an address via Add button and removes via Remove button', () => {
    const handleChange = vi.fn();
    render(
      <AddressList
        label="Reviewers"
        noun="reviewer"
        items={[REVIEWER_A]}
        onChange={handleChange}
      />,
    );

    expect(screen.getByRole('list', { name: 'Reviewers' }).children).toHaveLength(1);

    // Add another address
    const input = screen.getByPlaceholderText('G… address');
    fireEvent.change(input, { target: { value: REVIEWER_B } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(handleChange).toHaveBeenCalledWith([REVIEWER_A, REVIEWER_B]);

    // Remove existing reviewer
    const removeBtn = screen.getByRole('button', { name: /Remove reviewer/ });
    fireEvent.click(removeBtn);
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('adds an address when pressing Enter key', () => {
    const handleChange = vi.fn();
    render(
      <AddressList
        label="Verifiers"
        noun="verifier"
        items={[]}
        onChange={handleChange}
      />,
    );

    const input = screen.getByPlaceholderText('G… address');
    fireEvent.change(input, { target: { value: VERIFIER_A } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith([VERIFIER_A]);
  });

  it('handles multi-line paste by splitting whitespace and joining with comma', () => {
    render(
      <AddressList
        label="Reviewers"
        noun="reviewer"
        items={[]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('G… address') as HTMLInputElement;
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => `${REVIEWER_A}\n${REVIEWER_B}`,
      },
    });

    expect(input.value).toBe(`${REVIEWER_A}, ${REVIEWER_B}`);
  });

  it('allows labeling addresses when labels and onLabel are provided', () => {
    const handleLabel = vi.fn();
    render(
      <AddressList
        label="Reviewers"
        noun="reviewer"
        items={[REVIEWER_A]}
        labels={{ [REVIEWER_A]: 'Lead Reviewer' }}
        onLabel={handleLabel}
        onChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByPlaceholderText('Name (optional)') as HTMLInputElement;
    expect(nameInput.value).toBe('Lead Reviewer');

    fireEvent.change(nameInput, { target: { value: 'Senior Reviewer' } });
    expect(handleLabel).toHaveBeenCalledWith(REVIEWER_A, 'Senior Reviewer');
  });

  it('shows error when adding an invalid address or duplicate address', () => {
    render(
      <AddressList
        label="Reviewers"
        noun="reviewer"
        items={[REVIEWER_A]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('G… address');

    // Invalid address
    fireEvent.change(input, { target: { value: 'not-valid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toContain('is not a Stellar address.');

    // Duplicate address
    fireEvent.change(input, { target: { value: REVIEWER_A } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toBe('Already listed.');
  });
});

describe('DetailsStep component', () => {
  it('renders fields and updates draft details', () => {
    const handleUpdate = vi.fn();
    const draft = makeBaseDraft();
    const errors = detailsErrors(draft, { tokenKnown: true, schemaFound: true });

    render(
      <MemoryRouter>
        <DetailsStep
          titleId="details-title"
          draft={draft}
          update={handleUpdate}
          errors={errors}
          pilot={{
            token: TOKEN_ID,
            tokenLabel: 'USDC (pilot)',
            schema: 'cd'.repeat(32),
            schemaLabel: 'Milestone schema',
          }}
          assetChoice={TOKEN_ID}
          setAssetChoice={vi.fn()}
          tokenInput=""
          setTokenInput={vi.fn()}
          assetCode="USDC"
          tokenState="ok"
          schemaChoice="cd".repeat(32)
          setSchemaChoice={vi.fn()}
          schemaInput=""
          setSchemaInput={vi.fn()}
          schemaPanel={<div>Schema Details Panel</div>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Details' })).toBeDefined();

    // Change programme name
    const nameInput = screen.getByLabelText('Programme name');
    fireEvent.change(nameInput, { target: { value: 'Updated Programme Name' } });
    expect(handleUpdate).toHaveBeenCalledWith({ name: 'Updated Programme Name' });

    // Change minimum award
    const minAwardInput = screen.getByLabelText('Minimum award');
    fireEvent.change(minAwardInput, { target: { value: '250' } });
    expect(handleUpdate).toHaveBeenCalledWith({ minAward: '250' });

    // Verify assetCode suffix is shown
    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('Schema Details Panel')).toBeDefined();
  });

  it('shows custom asset contract and schema fields when OTHER is chosen', () => {
    const setTokenInput = vi.fn();
    const setSchemaInput = vi.fn();
    const draft = makeBaseDraft({ describe: false });
    const errors = detailsErrors(draft, { tokenKnown: true, schemaFound: true });

    render(
      <MemoryRouter>
        <DetailsStep
          titleId="details-title"
          draft={draft}
          update={vi.fn()}
          errors={errors}
          pilot={null}
          assetChoice={OTHER}
          setAssetChoice={vi.fn()}
          tokenInput="C_CUSTOM_TOKEN"
          setTokenInput={setTokenInput}
          assetCode={null}
          tokenState="idle"
          schemaChoice={OTHER}
          setSchemaChoice={vi.fn()}
          schemaInput="ab".repeat(32)
          setSchemaInput={setSchemaInput}
          schemaPanel={null}
        />
      </MemoryRouter>,
    );

    // Token input is visible
    const tokenInput = screen.getByLabelText('Asset contract');
    fireEvent.change(tokenInput, { target: { value: 'C_NEW' } });
    expect(setTokenInput).toHaveBeenCalledWith('C_NEW');

    // Schema input is visible
    const schemaInput = screen.getByLabelText('Schema id');
    fireEvent.change(schemaInput, { target: { value: 'ff'.repeat(32) } });
    expect(setSchemaInput).toHaveBeenCalledWith('ff'.repeat(32));

    // When describe is false, metadata hash field is visible
    expect(screen.getByLabelText('Metadata hash (optional)')).toBeDefined();
  });

  it('displays minimum award error when below tranche minimum', () => {
    const draft = makeBaseDraft({ minAward: '0.0000001', tranches: 3 });
    const errors = detailsErrors(draft, { tokenKnown: true, schemaFound: true });

    render(
      <MemoryRouter>
        <DetailsStep
          titleId="details-title"
          draft={draft}
          update={vi.fn()}
          errors={errors}
          pilot={null}
          assetChoice={TOKEN_ID}
          setAssetChoice={vi.fn()}
          tokenInput=""
          setTokenInput={vi.fn()}
          assetCode="XLM"
          tokenState="ok"
          schemaChoice={OTHER}
          setSchemaChoice={vi.fn()}
          schemaInput=""
          setSchemaInput={vi.fn()}
          schemaPanel={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Too small to split into tranches. Use 0 for no minimum.')).toBeDefined();
  });
});

describe('PeopleStep component and restricted authority rule', () => {
  it('renders reviewers, quorum stepper, and verifiers', () => {
    const handleUpdate = vi.fn();
    const draft = makeBaseDraft({ reviewers: [REVIEWER_A, REVIEWER_B], verifiers: [VERIFIER_A] });
    const errors = peopleErrors(draft, null);

    render(
      <PeopleStep
        titleId="people-title"
        draft={draft}
        update={handleUpdate}
        errors={errors}
        restrictedAuthority={null}
      />,
    );

    expect(screen.getByRole('heading', { name: 'People' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'Reviewers' }).children).toHaveLength(2);
    expect(screen.getByRole('list', { name: 'Verifiers' }).children).toHaveLength(1);
    expect(screen.queryByText(/The schema is restricted/)).toBeNull();
  });

  it('shows warning notice and "Add it as a verifier" button when restrictedAuthority is not in verifiers', () => {
    const handleUpdate = vi.fn();
    const draft = makeBaseDraft({ verifiers: [VERIFIER_A] });
    const errors = peopleErrors(draft, { restricted: true, authority: AUTHORITY_ADDR });

    render(
      <PeopleStep
        titleId="people-title"
        draft={draft}
        update={handleUpdate}
        errors={errors}
        restrictedAuthority={AUTHORITY_ADDR}
      />,
    );

    expect(screen.getByText(/The schema is restricted: only/)).toBeDefined();
    const addBtn = screen.getByRole('button', { name: 'Add it as a verifier' });
    expect(addBtn).toBeDefined();

    fireEvent.click(addBtn);
    expect(handleUpdate).toHaveBeenCalledWith({
      verifiers: [VERIFIER_A, AUTHORITY_ADDR],
    });
  });

  it('hides "Add it as a verifier" action when restrictedAuthority is already in verifiers (prevents duplicates)', () => {
    const draft = makeBaseDraft({ verifiers: [VERIFIER_A, AUTHORITY_ADDR] });
    const errors = peopleErrors(draft, { restricted: true, authority: AUTHORITY_ADDR });

    render(
      <PeopleStep
        titleId="people-title"
        draft={draft}
        update={vi.fn()}
        errors={errors}
        restrictedAuthority={AUTHORITY_ADDR}
      />,
    );

    expect(screen.queryByText(/The schema is restricted: only/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add it as a verifier' })).toBeNull();
  });
});

describe('TimelineStep component and deadline ordering', () => {
  it('renders all deadline inputs and shows no error when ordering is valid', () => {
    const now = 1000;
    const draft = makeBaseDraft({
      applyDeadline: 2000,
      reviewDeadline: 3000,
      releaseDeadline: 4000,
      sweepDeadline: 5000,
    });
    const errors = timelineErrors(draft, now);

    render(
      <TimelineStep
        titleId="timeline-title"
        draft={draft}
        update={vi.fn()}
        errors={errors}
        nowSeconds={now}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Open')).toBeDefined();
    expect(screen.getByText('Review')).toBeDefined();
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText('Refunds')).toBeDefined();
  });

  it('shows error alert when deadlines are out of order', () => {
    const now = 1000;
    // reviewDeadline before applyDeadline
    const draft = makeBaseDraft({
      applyDeadline: 3000,
      reviewDeadline: 2000,
      releaseDeadline: 4000,
      sweepDeadline: 5000,
    });
    const errors = timelineErrors(draft, now);

    render(
      <TimelineStep
        titleId="timeline-title"
        draft={draft}
        update={vi.fn()}
        errors={errors}
        nowSeconds={now}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('The dates must run in order: applications, review, release, then sweep.');
  });
});

describe('ReviewStep component', () => {
  it('renders summary lines and calls goTo when editing a step', () => {
    const handleGoTo = vi.fn();
    const draft = makeBaseDraft();

    render(
      <ReviewStep
        titleId="review-title"
        draft={draft}
        assetCode="USDC"
        schemaLabel="Standard Claim Schema"
        feeLine="The protocol takes 2.5% of each contribution."
        goTo={handleGoTo}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Review & deploy' })).toBeDefined();
    expect(screen.getByText('Clinic nurse stipends 2027')).toBeDefined();
    expect(screen.getByText(/USDC · minimum award 100/)).toBeDefined();
    expect(screen.getByText(/1 reviewer · quorum 1 · 1 verifier/)).toBeDefined();

    // Click Change on Name
    fireEvent.click(screen.getByRole('button', { name: 'Change name' }));
    expect(handleGoTo).toHaveBeenCalledWith(0);

    // Click Change on People
    fireEvent.click(screen.getByRole('button', { name: 'Change people' }));
    expect(handleGoTo).toHaveBeenCalledWith(1);

    // Click Change on Timeline
    fireEvent.click(screen.getByRole('button', { name: 'Change timeline' }));
    expect(handleGoTo).toHaveBeenCalledWith(2);
  });
});
