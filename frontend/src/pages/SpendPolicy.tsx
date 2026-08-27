import { useState } from 'react';
import { AllowlistManager } from '../components/policy/AllowlistManager';
import { ConfigurePolicyForm } from '../components/policy/ConfigurePolicyForm';
import { RemainingCapIndicator } from '../components/policy/RemainingCapIndicator';
import { Button, Field } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { looksLikeAddress } from '../lib/format';
import './SpendPolicy.css';

/**
 * A policy governs a *wallet*, not a programme, and the steward who maintains it
 * is usually not the person holding that wallet. So the address is an input
 * rather than simply the connected account — the same shape `Standing` uses.
 */
export const SpendPolicy = () => {
  const { address: walletAddress } = useWallet();

  const [walletInput, setWalletInput] = useState(walletAddress ?? '');
  const [wallet, setWallet] = useState(walletAddress ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  // Bumped after a successful configure so the reads below pick it up.
  const [reloadKey, setReloadKey] = useState(0);

  const handleLookup = () => {
    const address = walletInput.trim();
    if (!looksLikeAddress(address)) {
      setInputError('Enter a valid Stellar address.');
      return;
    }
    setInputError(null);
    setWallet(address);
  };

  const useMyAddress = () => {
    if (!walletAddress) return;
    setWalletInput(walletAddress);
    setInputError(null);
    setWallet(walletAddress);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Spend policy</h1>
        <p className="typo-text text-muted">
          A policy signer limits what a funded wallet may authorise — transfers only, to verified
          payees, within a cap. It is what makes a <code>Restricted</code> tranche restricted.
        </p>
      </header>

      <section className="policy-lookup">
        <Field
          label="Wallet address"
          placeholder="G..."
          value={walletInput}
          onChange={(event) => {
            setWalletInput(event.target.value);
            setInputError(null);
          }}
          error={inputError}
          hint="The smart wallet the policy governs, not the steward's account."
        />
        <div className="policy-lookup-actions">
          <Button onClick={handleLookup}>Look up</Button>
          {walletAddress && (
            <Button variant="secondary" onClick={useMyAddress}>
              Use my address
            </Button>
          )}
        </div>
      </section>

      {wallet ? (
        <div className="policy-sections" key={`${wallet}:${reloadKey}`}>
          <RemainingCapIndicator walletAddress={wallet} />
          <AllowlistManager walletAddress={wallet} />
        </div>
      ) : (
        <p className="typo-text text-muted">
          Enter a wallet address above to see its policy, remaining cap and allowlist.
        </p>
      )}

      <section className="policy-configure">
        <h2>Configure a policy</h2>
        <p className="typo-text text-muted">
          First configuration needs both the steward and the wallet to authorise. Re-configuring an
          existing policy needs only its original steward.
        </p>
        <ConfigurePolicyForm
          initialWallet={wallet}
          onSuccess={() => setReloadKey((k) => k + 1)}
        />
      </section>
    </div>
  );
};
