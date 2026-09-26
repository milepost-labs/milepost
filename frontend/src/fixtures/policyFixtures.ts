/**
 * Allowed-payees display stand-in for the spend policy screen.
 *
 * `policy_spend` has no `list_payees` — `is_payee(wallet, payee)` can only
 * confirm one address at a time, the same enumeration gap `program` has for
 * its own payees (see `RecipientDashboard.tsx`). Real source once an indexer
 * handler exists: `PayeeChanged` events per wallet.
 */
export interface PolicyPayeeFixture {
  address: string;
  label: string;
}

export const FIXTURE_POLICY_PAYEES: PolicyPayeeFixture[] = [
  { address: 'GCPAY7K3M9N2L5P8V1R4T6D3Q9W7XKTM', label: 'Verified payee' },
  { address: 'GCPAY8T5W2N9K4M1L7R3V6D8Q2P5Y9QRA', label: 'Verified payee' },
];
