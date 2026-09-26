/**
 * Verified-payee list stand-in, seeded per programme.
 *
 * `program` has no `list_payees` — `is_payee(payee)` can only confirm one
 * address at a time, so there is no read that enumerates a programme's
 * verified payees. This seeds the picker the same way
 * `RecipientDashboard.tsx` seeds its own candidate list; each seeded address
 * is still re-checked on-chain via `is_payee` before it is shown as
 * verified. Shaped like the design's own `FIXTURE_PAYEES`, plus the label a
 * payee is — a wallet, business or institution — since the contract stores
 * only the address.
 */
export interface PayeeFixture {
  address: string;
  label: string;
}

export const FIXTURE_PAYEES: Record<string, PayeeFixture[]> = {
  CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6: [
    { address: 'GAUHWES2VEBGS5IWDET2IUYZXG3HCXOV7QIMXWM3AH3KHXE4HWJOSC5A', label: 'Verified payee · Pharmacy' },
  ],
};
