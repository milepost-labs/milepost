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
  CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7: ['funder'],
  CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI: ['applicant', 'reviewer'],
  CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM: ['verifier'],
};

/** Human label for each role, used on the card pill. */
export const ROLE_LABELS: Record<UserRole, string> = {
  funder: 'Funder',
  applicant: 'Applicant',
  verifier: 'Verifier',
  reviewer: 'Reviewer',
};
