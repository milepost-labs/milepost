import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import './Navbar.css';

export const Navbar = () => {
  const { address, connect: connectWallet } = useWallet();

  // Helper to truncate address
  const truncate = (addr: string) => `${addr.slice(0, 5)}...${addr.slice(-4)}`;

  return (
    <header className="navbar glass-panel">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/" className="brand-logo">
            <span className="brand-icon">M</span>
            Milepost
          </Link>
        </div>
        
        <nav className="navbar-links">
          <Link to="/funders" className="nav-link">Funders</Link>
          <Link to="/recipients" className="nav-link">Recipients</Link>
          <Link to="/verifiers" className="nav-link">Verifiers</Link>
        </nav>

        <div className="navbar-actions">
          {address ? (
            <div className="badge-pill connected-badge" style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--surface-border)' }} aria-label={`Connected wallet: ${address}`}>
              <span className="pulse-dot" style={{ backgroundColor: 'var(--color-success)' }} aria-hidden="true"></span>
              {truncate(address)}
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-primary connect-wallet-btn">
              <Wallet size={18} aria-hidden="true" />
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
