/**
 * Every route the app exposes, as one source of truth.
 *
 * `App.tsx` renders these paths and the header Menu lists them — sharing one
 * array means a new route is reachable from the Menu the moment it is added
 * here, instead of the two silently drifting apart.
 */
export interface AppRoute {
  path: string;
  label: string;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/directory', label: 'Programme directory' },
  { path: '/programme', label: 'Programme detail' },
  { path: '/funders', label: 'Funders' },
  { path: '/recipients', label: 'Recipients' },
  { path: '/recipients/standing', label: 'Standing' },
  { path: '/recipients/award-progress', label: 'Award progress' },
  { path: '/recipients/application-timeline', label: 'Application timeline' },
  { path: '/verifiers', label: 'Verifiers' },
  { path: '/finalize', label: 'Finalize awards' },
  { path: '/policy', label: 'Spend policy' },
  { path: '/admin', label: 'Admin' },
  { path: '/admin/standing', label: 'Admin standing lookup' },
  { path: '/attestations', label: 'Attestation lookup' },
  { path: '/schemas/register', label: 'Register schema' },
];

/**
 * In-page anchors on the home landing page, for the header Menu's
 * "On this page" group.
 *
 * Grows as the remaining landing sections (how it works, modes, roles) land
 * in their own issues. Listing only sections that exist keeps every entry a
 * working link instead of a placeholder anchor with nothing to scroll to.
 */
export interface HomeAnchor {
  id: string;
  label: string;
}

export const HOME_ANCHORS: HomeAnchor[] = [{ id: 'developers', label: 'Developers' }];
