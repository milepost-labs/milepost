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

  it('reports an open programme with existing votes', () => {
    expect(
      applicationStatus(application({ phase: 'Open', votes: ['9000000000', '10000000000'], quorum: 5 })),
    ).toBe('In review — applications are still open, with 2 of 5 reviewer votes in.');
  });

  it('uses singular vote wording when finalised with a quorum of one', () => {
    expect(
      applicationStatus(
        application({ phase: 'Settled', finalized: true, votes: ['9000000000'], quorum: 1 }),
      ),
    ).toBe('Finalised — your award is 900.00 USDC, the middle vote of 1 reviewer vote.');
  });

  it('falls back cleanly when finalised without enough votes to derive the award', () => {
    expect(
      applicationStatus(
        application({ phase: 'Settled', finalized: true, votes: ['9000000000'], quorum: 5 }),
      ),
    ).toBe('Finalised — an award has been set for this application.');
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
    expect(steps.find((step) => step.title === 'Review')).toEqual({
      title: 'Review',
      status: 'pending',
      tag: 'Stopped',
      desc: 'You withdrew before the reviews finished.',
    });
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe('No award will be set.');
    expect(steps.find((step) => step.title === 'Tranches')).toEqual({
      title: 'Tranches',
      status: 'pending',
      tag: 'Stopped',
      desc: 'Not reached — the application was withdrawn.',
    });
  });

  it('falls back to a generic award label when finalised without enough votes to compute the middle vote', () => {
    const steps = applicationSteps(
      application({ phase: 'Settled', finalized: true, votes: ['9000000000'], quorum: 5 }),
    );
    expect(steps.find((step) => step.title === 'Award set')).toEqual({
      title: 'Award set',
      status: 'done',
      tag: 'Done',
      desc: 'Award set.',
    });
  });

  it('marks review pending while applications are open, with and without votes', () => {
    const noVotes = applicationSteps(application({ phase: 'Open', votes: [] }));
    expect(noVotes.find((step) => step.title === 'Review')).toEqual({
      title: 'Review',
      status: 'pending',
      tag: 'Next',
      desc: 'Starts when applications close.',
    });

    const withVotes = applicationSteps(application({ phase: 'Open', votes: ['9000000000'], quorum: 5 }));
    expect(withVotes.find((step) => step.title === 'Review')).toEqual({
      title: 'Review',
      status: 'pending',
      tag: 'Next',
      desc: '1 of 5 reviewer votes in. Applications are still open.',
    });
  });

  it('closes review when the programme settled without finalising, and stops review when cancelled', () => {
    const settled = applicationSteps(application({ phase: 'Settled', votes: ['9000000000'], quorum: 5 }));
    expect(settled.find((step) => step.title === 'Review')).toEqual({
      title: 'Review',
      status: 'done',
      tag: 'Closed',
      desc: '1 of 5 reviewer votes in.',
    });
    expect(settled.find((step) => step.title === 'Tranches')).toEqual({
      title: 'Tranches',
      status: 'pending',
      tag: 'Next',
      desc: 'Released one at a time as a verifier confirms each condition.',
    });

    const cancelled = applicationSteps(application({ phase: 'Cancelled' }));
    expect(cancelled.find((step) => step.title === 'Review')).toEqual({
      title: 'Review',
      status: 'pending',
      tag: 'Stopped',
      desc: 'The programme was cancelled.',
    });
  });

  it('explains the award rule while the award is still unset', () => {
    const steps = applicationSteps(application({ phase: 'Review', votes: ['9000000000'] }));
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe(
      'Needs 5 votes. The award will be the middle vote, never an average, and votes beyond 5 can only lower it.',
    );
  });
});
