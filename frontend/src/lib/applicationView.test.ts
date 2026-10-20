import { describe, expect, it } from 'vitest';
import type { RecipientApplicationFixture } from '../fixtures/recipientFixtures';
import {
  applicationStatus,
  applicationSteps,
  effectiveQuorum,
  medianVote,
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
});

describe('medianVote', () => {
  it('is the middle vote for an odd count and the average of the pair for an even one', () => {
    expect(medianVote([9000000000n, 12000000000n, 15000000000n])).toBe(12000000000n);
    expect(medianVote([9000000000n, 12000000000n])).toBe(10500000000n);
  });

  it('is null with no votes, which is not zero', () => {
    expect(medianVote([])).toBeNull();
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

  it('reports a finalised application with the median award', () => {
    const status = applicationStatus(
      application({
        phase: 'Settled',
        finalized: true,
        votes: ['9000000000', '12000000000'],
        quorum: 3,
      }),
    );
    expect(status).toBe('Finalised — your award is 1,050.00 USDC, the median of 2 reviewer votes.');
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
      application({ phase: 'Settled', finalized: true, votes: ['9000000000', '12000000000'] }),
    );
    expect(steps.find((step) => step.title === 'Review')?.status).toBe('done');
    const award = steps.find((step) => step.title === 'Award set');
    expect(award?.status).toBe('done');
    expect(award?.desc).toBe('Median of the votes: 1,050.00 USDC');
  });

  it('stops the remaining stages when the application was withdrawn', () => {
    const steps = applicationSteps(application({ withdrawn: true }));
    expect(steps.find((step) => step.title === 'Review')?.tag).toBe('Stopped');
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe('No award will be set.');
    expect(steps.find((step) => step.title === 'Tranches')?.tag).toBe('Stopped');
  });

  it('explains the median rule while the award is still unset', () => {
    const steps = applicationSteps(application({ phase: 'Review', votes: ['9000000000'] }));
    expect(steps.find((step) => step.title === 'Award set')?.desc).toBe(
      'Needs 5 votes. The award will be the median, not the lowest or the average.',
    );
  });
});
