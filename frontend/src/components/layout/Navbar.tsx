import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import { AddressChip } from '../ui';
import './Navbar.css';

export const Navbar = () => {
  const { address, connect: connectWallet } = useWallet();

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
          {address ? (
            <div className="badge-pill connected-badge" style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--surface-border)' }}>
              <span className="pulse-dot" style={{ backgroundColor: 'var(--color-success)' }}></span>
              <AddressChip address={address} copyLabel="Copy wallet address" />
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-primary connect-wallet-btn">
              <Wallet size={18} />
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
