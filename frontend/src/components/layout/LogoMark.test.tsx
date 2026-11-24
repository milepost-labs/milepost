import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { LogoMark } from './LogoMark';

describe('logo mark', () => {
  it('draws three rising bars — locked, proven, released — hidden from assistive tech', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const bars = [...svg.querySelectorAll('rect')];
    expect(bars.map((bar) => bar.getAttribute('class'))).toEqual([
      'logo-mark__locked',
      'logo-mark__proven',
      'logo-mark__released',
    ]);
    const heights = bars.map((bar) => Number(bar.getAttribute('height')));
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
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
