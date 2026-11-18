import { describe, expect, it } from 'vitest';
import type { RecipientApplicationFixture } from '../fixtures/recipientFixtures';
import {
  applicationStatus,
  applicationSteps,
  effectiveQuorum,
  votesInLabel,
} from './applicationView';

function application(
  overrides: Partial<RecipientApplicationFixture> = {},
): RecipientApplicationFixture {
  return {
    programmeId: 'PROG-TEST',
    programmeName: 'Secondary School Bursaries 2026',
    phase: 'Review',
    requested: '12000000000', // 1,200 USDC
    submittedAt: 1774000000,
    votes: [],
    quorum: 5,
    ...overrides,
  };
}

describe('effectiveQuorum', () => {
  it('caps the quorum at the protocol maximum of 16', () => {
    expect(effectiveQuorum(20)).toBe(16);
    expect(effectiveQuorum(3)).toBe(3);
  });

  it('never reports a quorum below one', () => {
    expect(effectiveQuorum(0)).toBe(1);
    expect(effectiveQuorum(-4)).toBe(1);
  });

  it('falls back to one when the quorum is not a finite number', () => {
    // A bad chain read should not print "0 of NaN" or "0 of Infinity".
    expect(effectiveQuorum(Number.NaN)).toBe(1);
    expect(effectiveQuorum(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('votesInLabel', () => {
  it('counts the votes against the capped quorum', () => {
    expect(votesInLabel(application({ votes: ['1', '2'], quorum: 20 }))).toBe(
      '2 of 16 reviewer votes in',
    );
  });
});

describe('applicationStatus', () => {
  it('reports an application still under review with its vote count', () => {
    const status = applicationStatus(
      application({ phase: 'Review', votes: ['12000000000', '9000000000'], quorum: 5 }),
    );
    expect(status).toBe('In review — 2 of 5 reviewer votes in.');
  });

  it('reports a finalised application with the award the contract settled on', () => {
    // An even quorum takes the lower middle vote; it never averages.
    const status = applicationStatus(
      application({
        phase: 'Settled',
        finalized: true,
        votes: ['9000000000', '12000000000'],
        quorum: 2,
      }),
    );
    expect(status).toBe('Finalised — your award is 900.00 USDC, the middle vote of 2 reviewer votes.');
  });

  it('reports a withdrawn application as withdrawn regardless of the phase', () => {
    const status = applicationStatus(
      application({ phase: 'Review', withdrawn: true, votes: ['9000000000'] }),
    );
    expect(status).toBe(
      'Withdrawn — you cancelled this application, so it will not be reviewed or finalised.',
    );
  });

  it('reports an application that never reached quorum when the programme settled', () => {
    const status = applicationStatus(
      application({ phase: 'Settled', votes: ['9000000000'], quorum: 5 }),
    );
    expect(status).toBe('Not finalised — the programme settled with 1 of 5 reviewer votes in.');
  });

  it('reports a cancelled programme', () => {
    expect(applicationStatus(application({ phase: 'Cancelled' }))).toBe(
      'Cancelled — the programme was cancelled, so no award will be set.',
    );
  });

  it('reports an open programme with no votes yet', () => {
    expect(applicationStatus(application({ phase: 'Open', votes: [] }))).toBe(
      'In review — applications are still open, and no reviewer has voted yet.',
    );
  });

  it('reports an open programme that already has votes in', () => {
    expect(
      applicationStatus(
        application({ phase: 'Open', votes: ['12000000000', '9000000000'], quorum: 5 }),
      ),
    ).toBe('In review — applications are still open, with 2 of 5 reviewer votes in.');
  });

  it('does not invent an award when a finalised application never reached its quorum', () => {
    // The contract cannot finalize before the quorum is in, so this state means
    // the read is inconsistent: say it was finalised, but do not print a number.
    expect(
      applicationStatus(
        application({
          phase: 'Settled',
          finalized: true,
          votes: ['9000000000'],
          quorum: 5,
        }),
      ),
    ).toBe('Finalised — an award has been set for this application.');
  });

  it('uses the singular when a single reviewer settled the award', () => {
    expect(
      applicationStatus(
        application({ phase: 'Settled', finalized: true, votes: ['9000000000'], quorum: 1 }),
      ),
    ).toBe('Finalised — your award is 900.00 USDC, the middle vote of 1 reviewer vote.');
  });
});

describe('applicationSteps', () => {
  it('marks the review stage current while the programme is under review', () => {
    const steps = applicationSteps(application({ phase: 'Review', votes: ['9000000000'] }));
    const review = steps.find((step) => step.title === 'Review');
    expect(review?.status).toBe('current');
    expect(review?.tag).toBe('Now');
    expect(review?.desc).toBe('1 of 5 reviewer votes in.');
  });

  it('marks review and award done once the application is finalised', () => {
    const steps = applicationSteps(
      application({ phase: 'Settled', finalized: true, votes: ['9000000000', '12000000000'], quorum: 2 }),
    );
    expect(steps.find((step) => step.title === 'Review')?.status).toBe('done');
    const award = steps.find((step) => step.title === 'Award set');
    expect(award?.status).toBe('done');
    expect(award?.desc).toBe('Middle vote: 900.00 USDC');
  });

  it('stops the remaining stages when the application was withdrawn', () => {
    const steps = applicationSteps(application({ withdrawn: true }));
    expect(steps.find((step) => step.title === 'Review')?.tag).toBe('Stopped');
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe('No award will be set.');
    expect(steps.find((step) => step.title === 'Tranches')?.tag).toBe('Stopped');
  });

  it('explains the award rule while the award is still unset', () => {
    const steps = applicationSteps(application({ phase: 'Review', votes: ['9000000000'] }));
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe(
      'Needs 5 votes. The award will be the middle vote, never an average, and votes beyond 5 can only lower it.',
    );
  });

  it('leaves review pending until applications close', () => {
    const review = applicationSteps(application({ phase: 'Open', votes: [] })).find(
      (step) => step.title === 'Review',
    );
    expect(review?.status).toBe('pending');
    expect(review?.tag).toBe('Next');
    expect(review?.desc).toBe('Starts when applications close.');
  });

  it('shows the votes already in while applications are still open', () => {
    const review = applicationSteps(
      application({ phase: 'Open', votes: ['12000000000', '9000000000'], quorum: 5 }),
    ).find((step) => step.title === 'Review');
    expect(review?.status).toBe('pending');
    expect(review?.desc).toBe('2 of 5 reviewer votes in. Applications are still open.');
  });

  it('closes review when the programme settled without finalising the application', () => {
    const review = applicationSteps(
      application({ phase: 'Settled', votes: ['9000000000'], quorum: 5 }),
    ).find((step) => step.title === 'Review');
    expect(review?.status).toBe('done');
    expect(review?.tag).toBe('Closed');
    expect(review?.desc).toBe('1 of 5 reviewer votes in.');
  });

  it('stops review when the programme was cancelled', () => {
    const review = applicationSteps(application({ phase: 'Cancelled' })).find(
      (step) => step.title === 'Review',
    );
    expect(review?.status).toBe('pending');
    expect(review?.tag).toBe('Stopped');
    expect(review?.desc).toBe('The programme was cancelled.');
  });

  it('marks the award done without naming one when the vote count never reached quorum', () => {
    const award = applicationSteps(
      application({ phase: 'Settled', finalized: true, votes: ['9000000000'], quorum: 5 }),
    ).find((step) => step.title === 'Award set');
    expect(award?.status).toBe('done');
    expect(award?.tag).toBe('Done');
    expect(award?.desc).toBe('Award set.');
  });
});
