import type { SVGProps } from 'react';

/**
 * The Milepost mark: three bars rising like roadside markers — one still
 * locked, one proven (outlined in the accent), one released. Colours come from
 * the money tokens, so the mark follows the theme. Decorative: the link it
 * sits in carries the name.
 */
export const LogoMark = ({ size = 20, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg
    className="logo-mark"
    width={(size * 24) / 20}
    height={size}
    viewBox="0 0 24 20"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <rect className="logo-mark__locked" x="0" y="12" width="6" height="8" rx="2" />
    <rect className="logo-mark__proven" x="9.75" y="6.75" width="4.5" height="12.5" rx="1.25" />
    <rect className="logo-mark__released" x="18" y="0" width="6" height="20" rx="2" />
  </svg>
);
