/**
 * The admin area's section nav, shared by every admin page so the pill bar
 * is identical (and gains a section in one place) regardless of which one
 * is currently rendered.
 */
export interface AdminSection {
  to: string;
  label: string;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/finalize', label: 'Finalize awards' },
  { to: '/admin', label: 'Deploy programme' },
  { to: '/schemas/register', label: 'Schemas' },
  { to: '/admin/standing', label: 'Standing writers' },
];
