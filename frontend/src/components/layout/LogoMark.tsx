import type { SVGProps } from 'react';

/**
 * The Milepost mark: three small squares, two released (accent) and one still
 * locked. Colours come from the `--logo-released` / `--logo-locked` tokens so
 * the mark follows the theme. Decorative: the link it sits in carries the name.
 */
export const LogoMark = ({ size = 32, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg
    className="logo-mark"
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <rect className="logo-mark__released" x="2" y="2" width="12" height="12" rx="3" />
    <rect className="logo-mark__released" x="18" y="2" width="12" height="12" rx="3" />
    <rect className="logo-mark__locked" x="2" y="18" width="12" height="12" rx="3" />
  </svg>
);
