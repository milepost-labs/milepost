/**
 * Every route the app exposes, as one source of truth.
 *
 * `App.tsx` renders these paths, and each route names the header section it
 * belongs to, so the header highlights the right section for every page.
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
  { key: 'admin', label: 'Admin', path: '/finalize' },
];

/**
 * The pages listed under each section in the header's sub-navigation.
 *
 * Shorter than `APP_ROUTES` on purpose: a recipient's Apply, Applications and
 * Standing views are tabs inside "My awards", and a programme's own page is
 * reached from the directory, so neither gets a sub-navigation entry.
 */
export interface SectionPage {
  path: string;
  label: string;
}

export const SECTION_PAGES: Record<NavSectionKey, SectionPage[]> = {
  programmes: [
    { path: '/directory', label: 'Directory' },
    { path: '/status', label: 'Index status' },
    { path: '/about', label: 'About this deployment' },
  ],
  fund: [
    { path: '/funders', label: 'My funding' },
    { path: '/funders/receipt', label: 'Receipt lookup' },
    { path: '/funders/propose', label: 'Propose a programme' },
  ],
  'get-funded': [
    { path: '/recipients', label: 'My awards' },
    { path: '/policy', label: 'Spend policy' },
  ],
  verify: [
    { path: '/verifiers', label: 'Queue' },
    { path: '/attestations', label: 'Attestation lookup' },
  ],
  admin: [
    { path: '/finalize', label: 'Finalize awards' },
    { path: '/admin', label: 'Deploy programme' },
    { path: '/schemas/register', label: 'Register schema' },
    { path: '/admin/payees', label: 'Payees' },
    { path: '/admin/standing', label: 'Standing' },
    { path: '/keepalive', label: 'Keepalive' },
  ],
};

/**
 * Which sub-navigation entry a pathname sits under: an exact match first,
 * otherwise the section's page with the longest matching prefix, otherwise the
 * section's first page (a programme's own page sits under Directory).
 */
export function getSectionPageForPath(pathname: string): SectionPage | null {
  const section = getSectionForPath(pathname);
  if (!section) return null;
  const pages = SECTION_PAGES[section];
  const exact = pages.find((page) => page.path === pathname);
  if (exact) return exact;
  const nested = pages
    .filter((page) => pathname.startsWith(`${page.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return nested ?? pages[0];
}

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
  { path: '/funders/propose', label: 'Propose a programme', title: 'Propose a programme', section: 'fund' },
  { path: '/recipients', label: 'Recipients', title: 'Recipient Dashboard', section: 'get-funded' },
  { path: '/recipients/standing', label: 'Standing', title: 'Recipient Standing', section: 'get-funded' },
  { path: '/recipients/award-progress', label: 'Award progress', title: 'Award Progress', section: 'get-funded' },
  { path: '/recipients/application-timeline', label: 'Application timeline', title: 'Application Timeline', section: 'get-funded' },
  { path: '/award', label: 'Award detail', title: 'Award Detail', section: 'get-funded' },
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
  if (pathname.startsWith('/recipients') || pathname === '/policy' || pathname.startsWith('/award')) return 'get-funded';
  if (pathname.startsWith('/verifiers') || pathname.startsWith('/attestations')) return 'verify';
  if (pathname.startsWith('/admin') || pathname.startsWith('/schemas') || pathname === '/finalize' || pathname === '/keepalive') {
    return 'admin';
  }
  return null;
}

/**
 * In-page anchors on the landing page, shown as links in its header.
 *
 * Listing only sections that exist keeps every entry a working link instead
 * of a placeholder anchor with nothing to scroll to.
 */
export interface HomeAnchor {
  id: string;
  label: string;
}

export const HOME_ANCHORS: HomeAnchor[] = [
  { id: 'how', label: 'How it works' },
  { id: 'modes', label: 'Payment modes' },
  { id: 'limits', label: 'Guarantees' },
  { id: 'developers', label: 'Developers' },
];
