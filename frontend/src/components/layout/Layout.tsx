import React from 'react';
import { Navbar } from './Navbar';
import { Outlet } from 'react-router-dom';
import { AnnouncerProvider } from '../../context/AnnouncerContext';
import './Layout.css';

export const Layout: React.FC = () => {
  return (
    <AnnouncerProvider>
      <div className="layout">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Navbar />
        <main id="main-content" className="page-wrapper container animate-fade-up" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </AnnouncerProvider>
  );
};
