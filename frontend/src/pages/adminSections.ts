/**
 * The admin area's section nav, rendered once by `AdminLayout` above whichever
 * screen is current, so the pill bar is identical (and gains a section in one
 * place) on every admin screen.
 */
export interface AdminSection {
  to: string;
  label: string;
  /**
   * The screen has been rebuilt to the new design and brings its own page
   * head. The shared heading and pill row are skipped for it, since the
   * header's sub-navigation already lists the admin screens.
   */
  ownHead?: boolean;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/finalize', label: 'Finalize awards' },
  { to: '/admin', label: 'Deploy programme', ownHead: true },
  { to: '/schemas/register', label: 'Schemas' },
  { to: '/admin/standing', label: 'Standing writers' },
  { to: '/keepalive', label: 'Keepalive' },
];
