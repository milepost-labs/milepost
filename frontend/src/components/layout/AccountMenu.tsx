import { useState } from 'react';
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWallet } from '../../context/useWallet';
import { truncateAddress } from '../../lib/format';
import { formatAmount } from '../../lib/amount';
import { useBalances } from '../../hooks/useBalances';
import { AddressChip } from '../ui';
import { useDetailsMenu } from './useDetailsMenu';

const ACCOUNT_LINKS = [
  { label: 'My funding', path: '/funders' },
  { label: 'My awards', path: '/recipients' },
  { label: 'Spend policy', path: '/policy' },
];

/** The signed-in account: short address as the trigger, balances, Friendbot funding, and linked routes. */
export function AccountMenu({ address }: { address: string }) {
  const { disconnect, expectedNetwork } = useWallet();
  const { ref, close } = useDetailsMenu();
  const balances = useBalances(address);

  const [fundingState, setFundingState] = useState<'idle' | 'funding' | 'success' | 'error'>('idle');
  const [fundingError, setFundingError] = useState<string | null>(null);

  const isTestnet = expectedNetwork.toLowerCase().includes('testnet');

  const handleFundFriendbot = async () => {
    setFundingState('funding');
    setFundingError(null);

    try {
      const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `Friendbot error (${response.status})`);
      }

      setFundingState('success');
      await balances.refetch();
    } catch (err) {
      setFundingState('error');
      setFundingError(err instanceof Error ? err.message : 'Friendbot request failed');
    }
  };

  const renderXlmBalance = () => {
    if (balances.loading) {
      return <span className="account-menu__balance-val text-muted">Loading…</span>;
    }
    if (balances.error || balances.xlm === null) {
      return <span className="account-menu__balance-val text-muted">Unavailable</span>;
    }
    return (
      <span className="account-menu__balance-val numeric">
        {formatAmount(balances.xlm, { asset: 'XLM' })}
      </span>
    );
  };

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

        <div className="nav-menu__group account-menu__balances" aria-label="Account balances">
          <div className="account-menu__balance-row">
            <span className="account-menu__balance-label">XLM balance</span>
            {renderXlmBalance()}
          </div>
          <button
            type="button"
            className="account-menu__refresh-btn"
            onClick={() => void balances.refetch()}
            disabled={balances.loading}
            aria-label="Refresh balances"
            title="Refresh balances"
          >
            <RefreshCw size={12} className={balances.loading ? 'animate-spin' : ''} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>

        {isTestnet && balances.isUnfunded && (
          <div className="nav-menu__group account-menu__friendbot" role="region" aria-label="Friendbot funding">
            <div className="account-menu__friendbot-header">
              <Sparkles size={14} className="text-accent" aria-hidden="true" />
              <span className="account-menu__friendbot-title">Account unfunded</span>
            </div>
            <p className="account-menu__friendbot-desc">
              New testnet accounts hold 0 XLM and need funds to submit transactions.
            </p>

            {fundingState === 'success' ? (
              <p className="account-menu__friendbot-success" role="status">
                Account funded with 10,000 testnet XLM!
              </p>
            ) : (
              <button
                type="button"
                className="account-menu__friendbot-btn"
                onClick={handleFundFriendbot}
                disabled={fundingState === 'funding'}
              >
                {fundingState === 'funding' ? 'Funding from Friendbot…' : 'Fund with Friendbot'}
              </button>
            )}

            {fundingState === 'error' && fundingError && (
              <p className="account-menu__friendbot-error" role="alert">
                {fundingError}
              </p>
            )}
          </div>
        )}

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

