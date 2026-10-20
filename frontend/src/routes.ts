/**
 * Every route the app exposes, as one source of truth.
 *
 * `App.tsx` renders these paths and the header Menu lists them — sharing one
 * array means a new route is reachable from the Menu the moment it is added
 * here, instead of the two silently drifting apart.
 */
export type NavSectionKey = 'programmes' | 'fund' | 'get-funded' | 'verify' | 'admin';

export interface NavSection {
  key: NavSectionKey;
  label: string;
  path: string;
}

export const NAV_SECTIONS: NavSection[] = [
  { key: 'programmes', label: 'Programmes', path: '/directory' },
  { key: 'fund', label: 'Fund', path: '/funders' },
  { key: 'get-funded', label: 'Get funded', path: '/recipients' },
  { key: 'verify', label: 'Verify', path: '/verifiers' },
  { key: 'admin', label: 'Admin', path: '/admin' },
];

export interface AppRoute {
  path: string;
  label: string;
  title: string;
  section: NavSectionKey;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/directory', label: 'Programme directory', title: 'Programme Directory', section: 'programmes' },
  { path: '/programme', label: 'Programme detail', title: 'Programme Detail', section: 'programmes' },
  { path: '/funders', label: 'Funders', title: 'Funder Dashboard', section: 'fund' },
  { path: '/funders/receipt', label: 'Receipt lookup', title: 'Contribution Receipt', section: 'fund' },
  { path: '/recipients', label: 'Recipients', title: 'Recipient Dashboard', section: 'get-funded' },
  { path: '/recipients/standing', label: 'Standing', title: 'Recipient Standing', section: 'get-funded' },
  { path: '/recipients/award-progress', label: 'Award progress', title: 'Award Progress', section: 'get-funded' },
  { path: '/recipients/application-timeline', label: 'Application timeline', title: 'Application Timeline', section: 'get-funded' },
  { path: '/verifiers', label: 'Verifiers', title: 'Verifier Dashboard', section: 'verify' },
  { path: '/finalize', label: 'Finalize awards', title: 'Finalize Awards', section: 'admin' },
  { path: '/policy', label: 'Spend policy', title: 'Spend Policy', section: 'get-funded' },
  { path: '/admin', label: 'Admin', title: 'Admin', section: 'admin' },
  { path: '/admin/standing', label: 'Standing writers', title: 'Standing Writers', section: 'admin' },
  { path: '/attestations', label: 'Attestation lookup', title: 'Attestation Lookup', section: 'verify' },
  { path: '/schemas/register', label: 'Register schema', title: 'Register Schema', section: 'admin' },
  { path: '/keepalive', label: 'Keepalive', title: 'Keepalive', section: 'admin' },
  { path: '/admin/payees', label: 'Payee management', title: 'Payee Management', section: 'admin' },
  { path: '/status', label: 'Index status', title: 'Index Status', section: 'programmes' },
  { path: '/about', label: 'About deployment', title: 'About This Deployment', section: 'programmes' },
];

export function getSectionForPath(pathname: string): NavSectionKey | null {
  if (pathname === '/') return null;
  const directMatch = APP_ROUTES.find((route) => route.path === pathname);
  if (directMatch) return directMatch.section;
  if (pathname.startsWith('/directory') || pathname.startsWith('/programme') || pathname === '/status' || pathname === '/about') {
    return 'programmes';
  }
  if (pathname.startsWith('/funders')) return 'fund';
  if (pathname.startsWith('/recipients') || pathname === '/policy') return 'get-funded';
  if (pathname.startsWith('/verifiers') || pathname.startsWith('/attestations')) return 'verify';
  if (pathname.startsWith('/admin') || pathname.startsWith('/schemas') || pathname === '/finalize' || pathname === '/keepalive') {
    return 'admin';
  }
  return null;
}

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

export const HOME_ANCHORS: HomeAnchor[] = [
  { id: 'how', label: 'How it works' },
  { id: 'roles', label: 'Roles' },
  { id: 'developers', label: 'Developers' },
];
