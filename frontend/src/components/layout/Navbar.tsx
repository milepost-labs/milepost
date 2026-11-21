import { useState } from 'react';
import { ArrowRight, Coins, HandCoins, LayoutGrid, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import { NETWORK } from '../../config/network';
import {
  HOME_ANCHORS,
  NAV_SECTIONS,
  SECTION_PAGES,
  getSectionForPath,
  getSectionPageForPath,
  type NavSectionKey,
} from '../../routes';
import { AccountMenu } from './AccountMenu';
import { LogoMark } from './LogoMark';
import { SignInSheet } from './SignInSheet';
import { ThemeToggle } from './ThemeToggle';
import './Navbar.css';

const SECTION_ICONS: Record<NavSectionKey, LucideIcon> = {
  programmes: LayoutGrid,
  fund: Coins,
  'get-funded': HandCoins,
  verify: ShieldCheck,
  admin: SlidersHorizontal,
};

/**
 * The five sections, as links. Rendered twice: in the header on a wide screen
 * and as a fixed bar along the bottom edge on a phone, where a thumb reaches.
 * CSS shows one at a time, so only one is ever in the accessibility tree.
 */
const SectionLinks = ({ current, className }: { current: NavSectionKey | null; className: string }) => (
  <nav className={className} aria-label="Primary">
    {NAV_SECTIONS.map((section) => {
      const Icon = SECTION_ICONS[section.key];
      const isCurrent = current === section.key;
      return (
        <Link
          key={section.key}
          to={section.path}
          className={`${className}__link`}
          aria-current={isCurrent ? 'page' : undefined}
        >
          <Icon aria-hidden="true" />
          <span>{section.label}</span>
        </Link>
      );
    })}
  </nav>
);

/**
 * The header. The landing page gets its own in-page links and one way in
 * ("Launch app"); every other page gets the five sections, the pages inside
 * the current one, and the account.
 */
export const Navbar = () => {
  const [signInOpen, setSignInOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';
  const currentSection = getSectionForPath(location.pathname);
  const currentPage = getSectionPageForPath(location.pathname);
  const { address, status, network, networkError, expectedNetwork, recheckNetwork } = useWallet();
  const wrongNetwork = status === 'wrong-network';
  // The road-paint yellow dot is reserved for testnet. Mainnet reads as muted
  // ink instead, and a wrong network still turns the whole tag red.
  const isMainnet = NETWORK.name === 'mainnet';
  const showDot = !isMainnet || wrongNetwork;

  return (
    <>
      <header className="app-header">
        <div className="app-header__row container">
          <Link to="/" className="brand">
            <LogoMark />
            Milepost
          </Link>

          {isHome ? (
            <nav className="main-nav" aria-label="Page sections">
              {HOME_ANCHORS.map((anchor) => (
                <a key={anchor.id} href={`#${anchor.id}`} className="main-nav__link">
                  {anchor.label}
                </a>
              ))}
            </nav>
          ) : (
            <SectionLinks current={currentSection} className="main-nav" />
          )}

          <div className="app-header__actions">
            <span
              className={`testnet-tag${isMainnet ? ' testnet-tag--mainnet' : ''}${wrongNetwork ? ' testnet-tag--wrong' : ''}`}
              title={
                wrongNetwork
                  ? (networkError ?? undefined)
                  : `Contracts are deployed on ${expectedNetwork}. They have not been audited.`
              }
            >
              {showDot && <span className="testnet-tag__dot" aria-hidden="true" />}
              <span className="testnet-tag__text">
                {wrongNetwork
                  ? `Freighter: ${network ?? 'unknown network'}`
                  : isMainnet
                    ? expectedNetwork
                    : isHome
                      ? `${expectedNetwork} · pre-audit`
                      : expectedNetwork}
              </span>
            </span>
            <ThemeToggle />
            {isHome ? (
              <Link to="/directory" className="btn-primary app-header__cta">
                Launch app
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : address ? (
              <AccountMenu address={address} />
            ) : (
              <button type="button" onClick={() => setSignInOpen(true)} className="btn-primary app-header__cta">
                <Wallet aria-hidden="true" />
                Sign in
              </button>
            )}
          </div>
        </div>

        {!isHome && currentSection && (
          <nav
            className="subnav container"
            aria-label={`${NAV_SECTIONS.find((section) => section.key === currentSection)?.label} pages`}
          >
            {SECTION_PAGES[currentSection].map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="subnav__link"
                aria-current={currentPage?.path === page.path ? 'page' : undefined}
              >
                {page.label}
              </Link>
            ))}
          </nav>
        )}

        {wrongNetwork && (
          <div className="network-banner" role="alert">
            <p className="network-banner__message">
              {networkError ??
                `Your wallet is on ${network ?? 'an unknown network'}, but these contracts are deployed on ${expectedNetwork}.`}
            </p>
            <p className="network-banner__note">
              Browsing still works — only signing is paused. Switch network in Freighter, then check again.
            </p>
            <button type="button" className="network-banner__retry" onClick={recheckNetwork}>
              Check again
            </button>
          </div>
        )}
      </header>

      {!isHome && <SectionLinks current={currentSection} className="tabbar" />}

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
};
