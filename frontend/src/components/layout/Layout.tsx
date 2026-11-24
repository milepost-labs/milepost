import React, { useEffect, useRef } from 'react';
import { Navbar } from './Navbar';
import { Outlet, useLocation } from 'react-router-dom';
import { AnnouncerProvider } from '../../context/AnnouncerContext';
import { RestoreConsentHost } from '../state/RestoreConsent';
import { useAnnouncer } from '../../context/useAnnouncer';
import { OfflineBanner } from './OfflineBanner';
import './Layout.css';

/**
 * On route change, moves focus to the page's h1 and announces the new title,
 * without doing so on initial load. In-page anchor links are left unaffected.
 */
const NavigationFocusManager: React.FC = () => {
  const location = useLocation();
  const announce = useAnnouncer();
  const isFirstMount = useRef(true);
  const prevPathname = useRef(location.pathname);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevPathname.current = location.pathname;
      return;
    }

    // In-page anchor links (same pathname, hash changed) are unaffected
    if (prevPathname.current === location.pathname) {
      return;
    }
    prevPathname.current = location.pathname;

    // In-page hash targets on navigation are unaffected
    if (location.hash) {
      return;
    }

    // Move focus to page's h1 and announce the title
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1, h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) {
          heading.setAttribute('tabindex', '-1');
        }
        heading.focus();
        const title = heading.textContent?.trim() || document.title;
        if (title) {
          announce(title);
        }
      }
    });
  }, [location.pathname, location.hash, announce]);

  return null;
};

export const Layout: React.FC = () => {
  // The landing page runs edge to edge: its bands are full-bleed and each
  // section sets its own measure. Every other page sits in the shared column.
  const isHome = useLocation().pathname === '/';
  return (
    <AnnouncerProvider>
      <NavigationFocusManager />
      <div className="layout">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Navbar />
        <OfflineBanner />
        <main
          id="main-content"
          className={isHome ? 'page-wrapper page-wrapper--bleed' : 'page-wrapper container animate-fade-up'}
          tabIndex={-1}
        >
          <Outlet />
        </main>
      </div>
      <RestoreConsentHost />
    </AnnouncerProvider>
  );
};
