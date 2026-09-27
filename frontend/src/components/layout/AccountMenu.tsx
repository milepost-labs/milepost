import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import { truncateAddress } from '../../lib/format';
import { AddressChip } from '../ui';
import { useDetailsMenu } from './useDetailsMenu';

const ACCOUNT_LINKS = [
  { label: 'My funding', path: '/funders' },
  { label: 'My awards', path: '/recipients' },
  { label: 'Spend policy', path: '/policy' },
];

/** The signed-in account: short address as the trigger, a menu of the routes tied to it. */
export function AccountMenu({ address }: { address: string }) {
  const { disconnect, expectedNetwork } = useWallet();
  const { ref, close } = useDetailsMenu();

  return (
    <details className="nav-menu account-menu" ref={ref}>
      <summary className="nav-menu__trigger account-menu__trigger" aria-label={`Account ${address}`}>
        <span className="numeric">{truncateAddress(address)}</span>
        <ChevronDown size={14} className="nav-menu__chevron" aria-hidden="true" />
      </summary>
      <div className="nav-menu__panel account-menu__panel">
        <div className="nav-menu__group">
          <AddressChip address={address} copyLabel="Copy wallet address" />
          <span className="nav-menu__group-label">Signed in with Freighter · {expectedNetwork}</span>
        </div>
        <div className="nav-menu__group">
          {ACCOUNT_LINKS.map((link) => (
            <Link key={link.path} to={link.path} className="nav-menu__item" onClick={close}>
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            className="nav-menu__item account-menu__sign-out"
            onClick={() => {
              close();
              disconnect();
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </details>
  );
}
