/**
 * Stand-in role data for the "Yours" directory filter.
 *
 * Shaped like the per-programme role checks the contracts expose
 * (contributed_by, get_application, is_verifier, is_reviewer). These are
 * not wired yet because the bindings do not expose enumerable lists, so the
 * filter works against this fixture set until real reads are available.
 */

export type UserRole = 'funder' | 'applicant' | 'verifier' | 'reviewer';

export interface UserProgrammeRole {
  programmeId: string;
  roles: UserRole[];
}

/** A signed-in user's roles across programmes, keyed by programme id. */
export const FIXTURE_USER_ROLES: Record<string, UserRole[]> = {
  CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY: ['funder'],
  CCM2SMALLHOLDERINPUTSLR26A9FK3XU7PZ4E8QT2BN: ['applicant', 'reviewer'],
  CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB: ['verifier'],
};

/** Human label for each role, used on the card pill. */
export const ROLE_LABELS: Record<UserRole, string> = {
  funder: 'Funder',
  applicant: 'Applicant',
  verifier: 'Verifier',
  reviewer: 'Reviewer',
};
