import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu as MenuIcon, Wallet } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import { AddressChip } from '../ui';
import { APP_ROUTES, HOME_ANCHORS } from '../../routes';
import './Navbar.css';

/**
 * "On this page" + "App" links in one keyboard-operable disclosure.
 *
 * Built on native `<details>`/`<summary>` rather than a custom listbox: it is
 * focusable and toggles with Enter/Space for free, with no roving-tabindex
 * logic to get wrong. The only behaviour added on top is closing on Escape,
 * an outside click, or picking a link — a plain `<details>` leaves all three
 * open, which reads as broken for a nav menu.
 */
const HeaderMenu = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onToggle = () => setOpen(details.open);
    details.addEventListener('toggle', onToggle);
    return () => details.removeEventListener('toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => detailsRef.current?.removeAttribute('open');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onOutsideClick = (event: MouseEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onOutsideClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onOutsideClick);
    };
  }, [open]);

  const closeMenu = () => detailsRef.current?.removeAttribute('open');

  return (
    <details className="nav-menu" ref={detailsRef}>
      <summary className="nav-menu__trigger">
        <MenuIcon size={16} aria-hidden="true" />
        Menu
        <ChevronDown size={14} className="nav-menu__chevron" aria-hidden="true" />
      </summary>
      <div className="nav-menu__panel">
        {isHome && HOME_ANCHORS.length > 0 && (
          <div className="nav-menu__group">
            <span className="nav-menu__group-label">On this page</span>
            {HOME_ANCHORS.map((anchor) => (
              <a key={anchor.id} href={`#${anchor.id}`} className="nav-menu__item" onClick={closeMenu}>
                {anchor.label}
              </a>
            ))}
          </div>
        )}
        <div className="nav-menu__group">
          <span className="nav-menu__group-label">App</span>
          {APP_ROUTES.map((route) => (
            <Link key={route.path} to={route.path} className="nav-menu__item" onClick={closeMenu}>
              <span>{route.label}</span>
              <span className="nav-menu__item-path numeric">{route.path}</span>
            </Link>
          ))}
        </div>
      </div>
    </details>
  );
};

export const Navbar = () => {
  const {
    address,
    connect: connectWallet,
    status,
    network,
    networkError,
    expectedNetwork,
    recheckNetwork,
  } = useWallet();
  const wrongNetwork = status === 'wrong-network';

  return (
    <header className="navbar glass-panel">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/" className="brand-logo">
            <span className="brand-icon" aria-hidden="true">M</span>
            Milepost
          </Link>
        </div>

        <HeaderMenu />

        <nav className="navbar-links" aria-label="Primary">
          <Link to="/directory" className="nav-link">Directory</Link>
          <Link to="/programme" className="nav-link">Programme</Link>
          <Link to="/funders" className="nav-link">Funders</Link>
          <Link to="/recipients" className="nav-link">Recipients</Link>
          <Link to="/verifiers" className="nav-link">Verifiers</Link>
          <Link to="/finalize" className="nav-link">Finalize</Link>
          <Link to="/policy" className="nav-link">Policy</Link>
          <Link to="/admin" className="nav-link">Admin</Link>
        </nav>

        <div className="navbar-actions">
          <span
            className={`network-indicator${wrongNetwork ? ' network-indicator--wrong' : ''}`}
            title={wrongNetwork ? (networkError ?? undefined) : `Contracts are deployed on ${expectedNetwork}`}
          >
            <span
              className="network-indicator__dot"
              aria-hidden="true"
            />
            {wrongNetwork ? `Freighter: ${network ?? 'unknown network'}` : expectedNetwork}
          </span>
          {address ? (
            <div className="badge-pill connected-badge" style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--surface-border)' }}>
              <span className="pulse-dot" style={{ backgroundColor: 'var(--color-success)' }}></span>
              <AddressChip address={address} copyLabel="Copy wallet address" />
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-primary connect-wallet-btn">
              <Wallet size={18} aria-hidden="true" />
              Connect Wallet
            </button>
          )}
        </div>
      </div>
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
  );
};
