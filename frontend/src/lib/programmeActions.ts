/**
 * What someone can do on a programme right now.
 *
 * Every action is always listed. Availability is derived from the on-chain
 * phase and whether the viewer is signed in, and an unavailable action carries
 * a sentence saying why, so nothing is hidden and nothing is left to fail as a
 * transaction.
 */

import { phaseRequirement, type Phase } from './phaseGate';

export type ActionKey =
  | 'contribute'
  | 'apply'
  | 'finalize'
  | 'release'
  | 'refund'
  | 'sweep'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'extend_release'
  | 'add_verifier'
  | 'remove_verifier';

export interface ProgrammeAction {
  key: ActionKey;
  label: string;
  /** Who the action is for. */
  who: string;
  button: string;
  /** False when the programme's phase rules the action out, signed in or not. */
  phaseAllows: boolean;
  enabled: boolean;
  reason: string;
  /** Deep link into the flow, with `?programme=`. Null while disabled. */
  href: string | null;
}

export interface ActionInput {
  programmeId: string;
  /** Null until the phase has been read on-chain. */
  phase: Phase | null;
  signedIn: boolean;
  /** Whether the contract has opened refunds (cancelled, or past the release deadline). */
  refundsOpen: boolean;
  /** Unawarded budget available to refund, formatted for display. Null when unknown or zero. */
  refundable: string | null;
  /** Whether the viewer is the programme admin. */
  isAdmin?: boolean;
  /** Whether the programme is currently paused. */
  isPaused?: boolean;
}

interface Rule {
  key: ActionKey;
  label: string;
  who: string;
  button: string;
  needs: Exclude<Phase, 'Cancelled'>;
  route: string;
}

const RULES: Rule[] = [
  { key: 'contribute', label: 'Contribute', who: 'Funders', button: 'Contribute', needs: 'Open', route: '/funders' },
  { key: 'apply', label: 'Apply for an award', who: 'Recipients', button: 'Apply', needs: 'Open', route: '/recipients' },
  { key: 'finalize', label: 'Finalize awards', who: 'Anyone', button: 'Finalize', needs: 'Review', route: '/finalize' },
  {
    key: 'release',
    label: 'Release a tranche',
    who: 'Recipients, with a verifier's attestation',
    button: 'Release',
    needs: 'Settled',
    route: '/recipients/award-progress',
  },
  { key: 'refund', label: 'Claim a refund', who: 'Funders', button: 'Refund', needs: 'Settled', route: '/funders' },
  // Admin actions (#335–#338)
  { key: 'sweep', label: 'Sweep protocol fee & unclaimed refunds', who: 'Admin', button: 'Sweep', needs: 'Settled', route: '/admin' },
  { key: 'pause', label: 'Pause programme', who: 'Admin', button: 'Pause', needs: 'Open', route: '/admin' },
  { key: 'resume', label: 'Resume programme', who: 'Admin', button: 'Resume', needs: 'Open', route: '/admin' },
  { key: 'cancel', label: 'Cancel programme', who: 'Admin', button: 'Cancel', needs: 'Open', route: '/admin' },
  { key: 'extend_release', label: 'Extend release window', who: 'Admin', button: 'Extend', needs: 'Settled', route: '/admin' },
  { key: 'add_verifier', label: 'Add verifier', who: 'Admin', button: 'Add', needs: 'Open', route: '/admin' },
  { key: 'remove_verifier', label: 'Remove verifier', who: 'Admin', button: 'Remove', needs: 'Open', route: '/admin' },
];

function phaseAllows(rule: Rule, input: ActionInput): boolean {
  const { phase } = input;
  if (rule.key === 'refund') {
    return phase === 'Cancelled' || (phase === 'Settled' && input.refundsOpen && input.refundable !== null);
  }
  // Admin actions (#335–#338) have special phase rules
  if (rule.key === 'sweep') {
    return phase === 'Settled' || phase === 'Cancelled';
  }
  if (rule.key === 'pause') {
    return phase === 'Open' && !input.isPaused;
  }
  if (rule.key === 'resume') {
    return phase === 'Open' && input.isPaused === true;
  }
  if (rule.key === 'cancel') {
    return phase === 'Open';
  }
  if (rule.key === 'extend_release') {
    return phase === 'Settled';
  }
  if (rule.key === 'add_verifier' || rule.key === 'remove_verifier') {
    return phase === 'Open';
  }
  return phase === rule.needs;
}

function blockedReason(rule: Rule, input: ActionInput, phase: Phase): string {
  if (rule.key === 'refund' && phase === 'Settled') {
    return input.refundsOpen
      ? 'Nothing is left to refund. Every unit was awarded.'
      : 'Refunds open after the release window closes.';
  }
  return phaseRequirement(rule.needs, phase);
}

function enabledReason(rule: Rule, input: ActionInput): string {
  switch (rule.key) {
    case 'refund':
      return input.refundable
        ? `${input.refundable} is refundable, in proportion to what each funder put in.`
        : 'Your share is worked out from what you put in.';
    case 'finalize':
      return 'Needs quorum votes on the application. In an oversubscribed round, whoever finalizes first decides the order.';
    case 'sweep':
      return 'Collects the protocol fee and distributes unclaimed refunds proportionally to contributors.';
    case 'pause':
      return 'Halts all forward money-path actions. Deadlines continue to tick.';
    case 'resume':
      return 'Re-enable contributions, applications, and reviews.';
    case 'cancel':
      return 'Cancels the programme and opens refunds immediately.';
    case 'extend_release':
      return 'Extends the window for recipients to claim their tranches.';
    case 'add_verifier':
      return 'Add a verifier whose attestations this programme accepts.';
    case 'remove_verifier':
      return 'Remove a verifier from this programme.';
    default:
      return 'Re-checked on-chain when you continue.';
  }
}

export function programmeActions(input: ActionInput): ProgrammeAction[] {
  const adminKeys = new Set<ActionKey>([
    'sweep', 'pause', 'resume', 'cancel', 'extend_release', 'add_verifier', 'remove_verifier',
  ]);

  return RULES.map((rule) => {
    const base = { key: rule.key, label: rule.label, who: rule.who, button: rule.button };

    // Filter admin actions for non-admins
    if (adminKeys.has(rule.key) && !input.isAdmin) {
      return { ...base, phaseAllows: false, enabled: false, href: null, reason: 'Admin only.' };
    }

    if (input.phase === null) {
      return { ...base, phaseAllows: false, enabled: false, href: null, reason: 'Reading the phase on-chain…' };
    }

    const allows = phaseAllows(rule, input);
    if (!allows) {
      return { ...base, phaseAllows: false, enabled: false, href: null, reason: blockedReason(rule, input, input.phase) };
    }
    if (!input.signedIn) {
      return { ...base, phaseAllows: true, enabled: false, href: null, reason: `Sign in to ${rule.label.toLowerCase()}.` };
    }
    return {
      ...base,
      phaseAllows: true,
      enabled: true,
      href: `${rule.route}?programme=${encodeURIComponent(input.programmeId)}`,
      reason: enabledReason(rule, input),
    };
  });
}
