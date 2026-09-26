/**
 * What someone can do on a programme right now.
 *
 * Every action is always listed. Availability is derived from the on-chain
 * phase and whether the viewer is signed in, and an unavailable action carries
 * a sentence saying why, so nothing is hidden and nothing is left to fail as a
 * transaction.
 */

import { phaseRequirement, type Phase } from './phaseGate';

export type ActionKey = 'contribute' | 'apply' | 'finalize' | 'release' | 'refund';

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
    who: 'Recipients, with a verifier’s attestation',
    button: 'Release',
    needs: 'Settled',
    route: '/recipients/award-progress',
  },
  { key: 'refund', label: 'Claim a refund', who: 'Funders', button: 'Refund', needs: 'Settled', route: '/funders' },
];

function phaseAllows(rule: Rule, input: ActionInput): boolean {
  const { phase } = input;
  if (rule.key === 'refund') {
    return phase === 'Cancelled' || (phase === 'Settled' && input.refundsOpen && input.refundable !== null);
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
    default:
      return 'Re-checked on-chain when you continue.';
  }
}

export function programmeActions(input: ActionInput): ProgrammeAction[] {
  return RULES.map((rule) => {
    const base = { key: rule.key, label: rule.label, who: rule.who, button: rule.button };

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
