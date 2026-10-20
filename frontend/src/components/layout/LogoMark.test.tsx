import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { LogoMark } from './LogoMark';

describe('logo mark', () => {
  it('draws two released squares and one locked, hidden from assistive tech', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('.logo-mark__released').length).toBe(2);
    expect(svg.querySelectorAll('.logo-mark__locked').length).toBe(1);
  });

  it('leaves the link with its accessible name', () => {
    render(
      <MemoryRouter>
        <Link to="/">
          <LogoMark />
          Milepost
        </Link>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Milepost' })).toBeTruthy();
  });
});
