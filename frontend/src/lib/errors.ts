/**
 * Contract errors, translated.
 *
 * The contracts return around fifty typed errors across five crates. Raw, they
 * are useless to a person: `WrongPhase` means nothing, while "Applications
 * closed on 3 March — this programme is now under review" says what happened
 * and what to do about it.
 *
 * Several of these are not faults at all. `NothingToRefund` usually means a
 * programme paid out in full, and `NotFound` for standing simply means someone
 * has no track record yet. Presenting those as failures would be wrong, so
 * every entry carries a kind that decides how it should be shown.
 */

export type ErrorKind =
  /** Not a fault. The normal answer to the question that was asked. */
  | 'none'
  /** Correct request, wrong moment. Usually resolved by waiting. */
  | 'blocked'
  /** The input can be corrected and retried. */
  | 'invalid'
  /** This account is not permitted to do this. */
  | 'denied'
  /** Already done, or done by someone else first. */
  | 'conflict'
  /** Something genuinely went wrong. */
  | 'fault';

export interface Explained {
  kind: ErrorKind;
  /** One line, addressed to the person who hit it. */
  message: string;
  /** What they can do, when there is something. */
  action?: string;
  code?: number;
  contract?: ContractName;
}

export type ContractName = 'program' | 'attest' | 'record' | 'registry' | 'policy';

type Table = Record<number, Omit<Explained, 'code' | 'contract'>>;

const PROGRAM: Table = {
  1: { kind: 'denied', message: 'This account is not allowed to do that here.' },
  2: { kind: 'blocked', message: 'The window for this action is not open.', action: 'Check the programme timeline for when it opens or closed.' },
  3: { kind: 'invalid', message: 'The amount must be greater than zero.' },
  4: { kind: 'invalid', message: 'The deadlines must run in order: applications, then review, then release, then sweep.' },
  5: { kind: 'invalid', message: 'The quorum must be at least 1 and no more than the number of reviewers.' },
  6: { kind: 'invalid', message: 'That protocol fee is above the maximum of 10%.' },
  7: { kind: 'invalid', message: 'A programme needs at least one reviewer.' },
  8: { kind: 'none', message: 'No application from this account yet.' },
  9: { kind: 'conflict', message: 'You have already applied to this programme.', action: 'Only one application per programme is allowed.' },
  10: { kind: 'conflict', message: 'You have already reviewed this application.' },
  11: { kind: 'invalid', message: 'You cannot approve more than the applicant asked for.' },
  12: { kind: 'blocked', message: 'Not enough reviewers have voted yet.', action: 'The award settles once quorum is reached.' },
  13: { kind: 'conflict', message: 'This application has already been settled into an award.' },
  14: { kind: 'blocked', message: 'The programme does not have enough budget left for this award.', action: 'Awards are settled in the order they are finalised.' },
  15: { kind: 'fault', message: 'That amount is too large to process.' },
  16: { kind: 'blocked', message: 'This programme has been cancelled.' },
  17: { kind: 'denied', message: 'A programme that holds funds or has made awards cannot be cancelled.' },
  18: { kind: 'invalid', message: 'A programme needs at least one verifier, or no tranche could ever be released.' },
  19: { kind: 'none', message: 'No award for this account yet.' },
  20: { kind: 'none', message: 'Every tranche of this award has already been released.' },
  21: { kind: 'denied', message: 'That proof is not valid for this release.', action: 'It may be revoked, expired, or not a claim by this verifier about this recipient under this programme’s schema.' },
  22: { kind: 'conflict', message: 'That proof has already released a tranche.', action: 'Each proof unlocks exactly one tranche.' },
  23: { kind: 'blocked', message: 'The release window for this programme has closed.' },
  24: { kind: 'conflict', message: 'The protocol fee has already been sent to the treasury.' },
  25: { kind: 'blocked', message: 'Refunds are not open yet.', action: 'They open once the release window closes.' },
  26: { kind: 'conflict', message: 'You have already claimed your refund.' },
  27: { kind: 'none', message: 'There is nothing to refund.', action: 'This usually means the programme paid out in full.' },
  28: { kind: 'blocked', message: 'Unclaimed funds cannot be swept yet.', action: 'Donors still have time to claim their refunds.' },
  29: { kind: 'none', message: 'There is nothing left to sweep.' },
  30: { kind: 'denied', message: 'That address is not a verified payee for this programme.', action: 'Only the programme creator can verify a payee.' },
  31: { kind: 'conflict', message: 'That payee is already verified.' },
  32: { kind: 'none', message: 'That address was not a verified payee.' },
  33: { kind: 'invalid', message: 'That is more than you have available to direct.' },
  34: { kind: 'blocked', message: 'This award pays into a wallet with no spend policy installed.', action: 'The policy must be installed before a restricted tranche can be released.' },
  35: { kind: 'blocked', message: 'Allocations can no longer be directed — the sweep window has opened.' },
  36: { kind: 'invalid', message: 'The payee batch size is too large.' },
  37: { kind: 'conflict', message: 'This application has been withdrawn.', action: 'Withdrawn applications cannot be reviewed, finalized, or re-applied.' },
};

const ATTEST: Table = {
  1: { kind: 'none', message: 'No such schema.' },
  2: { kind: 'conflict', message: 'A schema with this definition and authority already exists.' },
  3: { kind: 'none', message: 'No such attestation.' },
  4: { kind: 'denied', message: 'Attestations under this schema cannot be revoked.' },
  5: { kind: 'denied', message: 'Only the verifier who made an attestation can revoke it.' },
  6: { kind: 'conflict', message: 'This attestation has already been revoked.' },
  7: { kind: 'invalid', message: 'The expiry date is in the past.' },
  8: { kind: 'denied', message: 'This schema is restricted — only its authority can attest under it.' },
};

const RECORD: Table = {
  1: { kind: 'denied', message: 'This account is not allowed to write standing.' },
  2: { kind: 'none', message: 'No track record yet.', action: 'Standing appears after a first tranche is released.' },
  3: { kind: 'invalid', message: 'The amount must be greater than zero.' },
  4: { kind: 'fault', message: 'That amount is too large to process.' },
  5: { kind: 'conflict', message: 'That contract is already allowed to write standing.' },
  6: { kind: 'none', message: 'That contract was not allowed to write standing.' },
};

const REGISTRY: Table = {
  1: { kind: 'denied', message: 'Only the protocol admin can do that.' },
  2: { kind: 'invalid', message: 'That protocol fee is above the maximum of 10%.' },
  3: { kind: 'fault', message: 'The registry has not been set up.' },
};

/** `SpendError` from the policy contract — not the smart wallet's own errors. */
const POLICY: Table = {
  1: { kind: 'blocked', message: 'This wallet has no spend policy configured.' },
  2: { kind: 'conflict', message: 'This wallet already has a policy configured.' },
  3: { kind: 'denied', message: 'Only the policy steward can change these rules.' },
  4: { kind: 'denied', message: 'This signer may only make transfers, and only of the programme’s asset.' },
  5: { kind: 'denied', message: 'That destination is not a verified payee.' },
  6: { kind: 'blocked', message: 'That would exceed the spending limit for this period.' },
  7: { kind: 'denied', message: 'This signer can only move its own wallet’s funds.' },
  8: { kind: 'invalid', message: 'The amount must be greater than zero.' },
  9: { kind: 'invalid', message: 'The spending cap and period must both be greater than zero.' },
  10: { kind: 'conflict', message: 'That payee is already allowed.' },
  11: { kind: 'none', message: 'That payee was not on the allowlist.' },
};

const TABLES: Record<ContractName, Table> = {
  program: PROGRAM,
  attest: ATTEST,
  record: RECORD,
  registry: REGISTRY,
  policy: POLICY,
};

const UNKNOWN: Explained = {
  kind: 'fault',
  message: 'Something went wrong that we do not have a specific explanation for.',
  action: 'The details are in the browser console.',
};

/**
 * Pull a contract error code out of whatever the bindings threw.
 *
 * Soroban surfaces these as `Error(Contract, #14)` inside the message, so this
 * is string matching by necessity. Returns null when the failure was something
 * else entirely — a network error, a rejected signature, a bug in our own code.
 */
export function extractCode(error: unknown): number | null {
  const text =
    typeof error === 'string' ? error : error instanceof Error ? error.message : JSON.stringify(error ?? '');

  const match = text.match(/Error\(Contract,\s*#(\d+)\)/) ?? text.match(/#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

/** Translate a raw contract error code. */
export function explainCode(contract: ContractName, code: number): Explained {
  const entry = TABLES[contract][code];
  return entry ? { ...entry, code, contract } : { ...UNKNOWN, code, contract };
}

/**
 * Translate anything thrown by a contract call.
 *
 * Handles the two non-contract cases that users actually hit: a rejected
 * signature, which is a choice rather than a failure, and an unreachable
 * network.
 */
export function explain(error: unknown, contract: ContractName = 'program'): Explained {
  const text = error instanceof Error ? error.message : String(error ?? '');

  if (/user (declined|rejected)|denied by the user|UserDeclined/i.test(text)) {
    return { kind: 'none', message: 'You declined the signature.', action: 'Nothing was submitted.' };
  }
  if (/fetch|network|timeout|ECONNREFUSED|Failed to fetch/i.test(text)) {
    return {
      kind: 'fault',
      message: 'Could not reach the network.',
      action: 'Check your connection and try again.',
    };
  }

  const code = extractCode(error);
  return code === null ? { ...UNKNOWN } : explainCode(contract, code);
}

/** Whether this should be shown as a failure at all. */
export function isFailure(explained: Explained): boolean {
  return explained.kind !== 'none';
}
