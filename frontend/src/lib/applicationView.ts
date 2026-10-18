/**
 * Pure view logic for a recipient's applications.
 *
 * Kept out of the timeline component so the status sentence, the vote counts
 * and the step progression can be unit-tested without rendering, and so the
 * same rules apply whether an entry came from a chain read or from the sample
 * fixtures.
 *
 * Everything here reads from a {@link RecipientApplicationFixture}: the
 * application's own flags (`finalized`, `withdrawn`, votes), the programme's
 * phase, and the quorum. The contract stores the current state only, so there
 * is no per-vote history to show.
 */

import { formatAmount } from './amount';
import { formatDate } from './format';
import type { RecipientApplicationFixture } from '../fixtures/recipientFixtures';

/** The protocol refuses a quorum above this, so a bad read cannot print "2 of 40". */
export const MAX_QUORUM = 16;

/** Reviewer votes needed before an award can be finalised, within protocol bounds. */
export function effectiveQuorum(quorum: number): number {
  if (!Number.isFinite(quorum)) return 1;
  return Math.min(MAX_QUORUM, Math.max(1, Math.trunc(quorum)));
}

/** The approved amounts in stroops. */
export function voteAmounts(application: RecipientApplicationFixture): bigint[] {
  return application.votes.map((vote) => BigInt(vote));
}

/**
 * The amount an application settles on.
 *
 * The contract keeps votes ascending so the median is a lookup; an even count
 * averages the middle pair. Null when nobody has voted — which is not zero.
 */
export function medianVote(votes: bigint[]): bigint | null {
  if (votes.length === 0) return null;
  const sorted = [...votes].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

/** "2 of 5 reviewer votes in", with the quorum capped at the protocol maximum. */
export function votesInLabel(application: RecipientApplicationFixture): string {
  return `${application.votes.length} of ${effectiveQuorum(application.quorum)} reviewer votes in`;
}

/**
 * One sentence saying where the application stands.
 *
 * Ordered by what is most settled: a withdrawal or a finalisation is a fact
 * about the application itself, and the phase only explains what happens next.
 */
export function applicationStatus(
  application: RecipientApplicationFixture,
  asset = 'USDC',
): string {
  const quorum = effectiveQuorum(application.quorum);
  const votes = application.votes.length;

  if (application.withdrawn) {
    return 'Withdrawn — you cancelled this application, so it will not be reviewed or finalised.';
  }

  if (application.finalized) {
    const award = medianVote(voteAmounts(application));
    return award === null
      ? 'Finalised — an award has been set for this application.'
      : `Finalised — your award is ${formatAmount(award, { asset })}, the median of ${votes} reviewer ${
          votes === 1 ? 'vote' : 'votes'
        }.`;
  }

  switch (application.phase) {
    case 'Cancelled':
      return 'Cancelled — the programme was cancelled, so no award will be set.';
    case 'Settled':
      return `Not finalised — the programme settled with ${votes} of ${quorum} reviewer votes in.`;
    case 'Open':
      return votes === 0
        ? 'In review — applications are still open, and no reviewer has voted yet.'
        : `In review — applications are still open, with ${votes} of ${quorum} reviewer votes in.`;
    case 'Review':
      return `In review — ${votes} of ${quorum} reviewer votes in.`;
  }
}

export interface ApplicationStep {
  title: string;
  status: 'done' | 'current' | 'pending';
  tag: string;
  desc: string;
}

/** The four stages of an application, with the current one marked. */
export function applicationSteps(
  application: RecipientApplicationFixture,
  asset = 'USDC',
): ApplicationStep[] {
  const quorum = effectiveQuorum(application.quorum);
  const quorumLabel = `${votesInLabel(application)}.`;
  const median = medianVote(voteAmounts(application));

  return [
    {
      title: 'Applied',
      status: 'done',
      tag: 'Done',
      desc: `Asked for ${formatAmount(BigInt(application.requested), { asset })} · submitted ${formatDate(application.submittedAt)}`,
    },
    reviewStep(application, quorumLabel),
    awardStep(application, quorum, median, asset),
    {
      title: 'Tranches',
      status: 'pending',
      tag: application.withdrawn ? 'Stopped' : 'Next',
      desc: application.withdrawn
        ? 'Not reached — the application was withdrawn.'
        : 'Released one at a time as a verifier confirms each condition.',
    },
  ];
}

function reviewStep(application: RecipientApplicationFixture, quorumLabel: string): ApplicationStep {
  if (application.withdrawn) {
    return {
      title: 'Review',
      status: 'pending',
      tag: 'Stopped',
      desc: 'You withdrew before the reviews finished.',
    };
  }
  if (application.finalized) {
    return { title: 'Review', status: 'done', tag: 'Done', desc: quorumLabel };
  }

  switch (application.phase) {
    case 'Cancelled':
      return {
        title: 'Review',
        status: 'pending',
        tag: 'Stopped',
        desc: 'The programme was cancelled.',
      };
    case 'Settled':
      return { title: 'Review', status: 'done', tag: 'Closed', desc: quorumLabel };
    case 'Review':
      return { title: 'Review', status: 'current', tag: 'Now', desc: quorumLabel };
    case 'Open':
      return {
        title: 'Review',
        status: 'pending',
        tag: 'Next',
        desc:
          application.votes.length === 0
            ? 'Starts when applications close.'
            : `${quorumLabel} Applications are still open.`,
      };
  }
}

function awardStep(
  application: RecipientApplicationFixture,
  quorum: number,
  median: bigint | null,
  asset: string,
): ApplicationStep {
  if (application.withdrawn) {
    return {
      title: 'Award set',
      status: 'pending',
      tag: 'Stopped',
      desc: 'No award will be set.',
    };
  }
  if (application.finalized) {
    return {
      title: 'Award set',
      status: 'done',
      tag: 'Done',
      desc: median === null ? 'Award set.' : `Median of the votes: ${formatAmount(median, { asset })}`,
    };
  }
  return {
    title: 'Award set',
    status: 'pending',
    tag: 'Next',
    desc: `Needs ${quorum} votes. The award will be the median, not the lowest or the average.`,
  };
}
