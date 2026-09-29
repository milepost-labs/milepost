/**
 * Stand-in data for the reviewer voting section (issue #339, `/verifiers`).
 *
 * `program` has no `list_applications`: like the payee and verifier queues,
 * the set of "applications awaiting this reviewer" is a locally-remembered
 * list of applicant addresses, each re-read live via `get_application`. This
 * fixture is what that list starts from before anything is added.
 */

export interface ApplicantFixture {
  address: string;
  /** Shown in this app only — the contract has no name for an applicant. */
  label: string;
}

export const FIXTURE_REVIEW_APPLICANTS: Record<string, ApplicantFixture[]> = {
  [import.meta.env.VITE_PROGRAMME_ID || 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6']: [
    {
      address: 'GB6PCCOLV2NF4DP4LEU7JSWAVPKXMUKCWZGL3M3VRY6FNPW3EY4R2AAW',
      label: 'Sunrise cooperative',
    },
    {
      address: 'GCPTHAOVR4XMB2KYCJUX2JAIW6Y7K53AZ44BKT6Z5Z5BXJKIRVVRHQYQ',
      label: 'Clinic restock request',
    },
  ],
};
