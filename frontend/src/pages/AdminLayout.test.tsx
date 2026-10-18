import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './AdminLayout';
import { ADMIN_SECTIONS } from './adminSections';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminLayout />}>
          {ADMIN_SECTIONS.map(({ to, label }) => (
            <Route key={to} path={to} element={<p>{`${label} screen`}</p>} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminLayout', () => {
  it('lists all five admin screens as links under one heading', () => {
    renderAt('/admin');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Run programmes' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
    expect(ADMIN_SECTIONS.map((s) => s.to)).toEqual([
      '/finalize',
      '/admin',
      '/schemas/register',
      '/admin/standing',
      '/keepalive',
    ]);
  });

  it.each(ADMIN_SECTIONS)('marks only $label as current at $to', ({ to, label }) => {
    renderAt(to);
    expect(screen.getByText(`${label} screen`)).toBeTruthy();
    const current = screen
      .getByRole('navigation', { name: 'Admin sections' })
      .querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe(label);
  });
});
