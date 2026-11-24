import { SAMPLES_IN_BUILD } from './inBuild';

/**
 * Stand-in data for the reviewer voting section (issue #339, `/verifiers`).
 *
 * `program` has no `list_applications`: like the payee and verifier queues,
 * the set of "applications awaiting this reviewer" is a locally-remembered
 * list of applicant addresses, each re-read live via `get_application`. This
 * fixture is what that list starts from before anything is added. The
 * addresses are the seeded programme's real applicants (from its index
 * awards), so their reads are live; only the labels are made up.
 */

export interface ApplicantFixture {
  address: string;
  /** Shown in this app only — the contract has no name for an applicant. */
  label: string;
}

export const FIXTURE_REVIEW_APPLICANTS: Record<string, ApplicantFixture[]> = SAMPLES_IN_BUILD ? {
  [import.meta.env.VITE_PROGRAMME_ID || 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6']: [
    {
      address: 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA',
      label: 'Sunrise cooperative',
    },
    {
      address: 'GCJTOXX6PUK7WTK6LWRUQEWLYZ3QITOE2Q63JJJOJLWVGAYKZLSS5YNZ',
      label: 'Clinic restock request',
    },
  ],
} : {};
