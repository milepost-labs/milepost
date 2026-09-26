import type { Policy } from '@milepost/policy-spend';
import { useContractRead, useContractResult, useTransaction } from '../hooks';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { ErrorPanel, Loading, PendingState } from '../components/state/AsyncStates';
import { formatAmount, percentOf } from '../lib/amount';
import { FIXTURE_POLICY_PAYEES } from '../fixtures/policyFixtures';
import './SpendPolicy.css';

/**
 * Spend policy checker.
 *
 * A policy constrains one signer, not the wallet: `is_installed` only
 * confirms the wallet claims to have added this contract as a signer, and
 * `get_policy` only exists once a steward has configured an asset, payees
 * and a cap for it. Neither call can verify the wallet's own signer limits
 * — that is a deployment step outside these contracts, which is why the
 * limitation below is stated rather than implied by a green checkmark.
 * Configuring a policy (dual-auth `configure()`) is out of scope for this
 * screen; it only checks and installs the signer flag.
 */
export const SpendPolicy = () => {
  const wallet = useWallet();
  const { policy } = useSoroban();
  const signedIn = Boolean(wallet.address);
  const address = wallet.address ?? '';

  const installedRead = useContractRead<boolean>(
    () => policy.is_installed({ wallet: address }),
    [policy, address],
    { enabled: signedIn, contract: 'policy' },
  );
  const policyRead = useContractResult<Policy>(
    () => policy.get_policy({ wallet: address }),
    [policy, address],
    { enabled: signedIn, contract: 'policy' },
  );
  const remainingRead = useContractResult<bigint>(
    () => policy.remaining({ wallet: address }),
    [policy, address],
    { enabled: signedIn && policyRead.data !== null, contract: 'policy' },
  );

  const installTx = useTransaction<null>({
    contract: 'policy',
    onSuccess: () => installedRead.refetch(),
  });

  const loading = signedIn && (installedRead.loading || policyRead.loading);
  const installed = installedRead.data === true;
  const configured = policyRead.data !== null && !policyRead.error;
  const protectedFully = installed && configured;

  const handleSetUp = () => {
    void installTx.send(() => policy.install({ wallet: address }));
  };

  const capLabel =
    configured && policyRead.data
      ? `Spending cap of ${formatAmount(policyRead.data.cap, { asset: 'USDC' })}`
      : 'A spending cap';

  const checks: { label: string; ok: boolean }[] = [
    { label: 'Policy signer installed on your wallet', ok: installed },
    { label: 'Only USDC can be sent', ok: configured },
    { label: 'Only verified payees can receive', ok: configured },
    { label: capLabel, ok: configured },
  ];

  const pct =
    configured && policyRead.data ? percentOf(policyRead.data.spent, policyRead.data.cap) : 0;
  const remaining =
    remainingRead.data ?? (policyRead.data ? policyRead.data.cap - policyRead.data.spent : 0n);

  return (
    <div className="spend-policy">
      <header className="spend-policy__header">
        <h1>Spend policy</h1>
        <p className="typo-text text-muted">
          In Restricted mode, grant money lands in your own wallet. A policy signer keeps it to
          USDC, verified payees, and a cap. This page checks that it&rsquo;s set up.
        </p>
      </header>

      {!signedIn && (
        <div className="spend-policy__signin">
          <span className="spend-policy__signin-title">Sign in to check your wallet</span>
          <span className="spend-policy__signin-body">
            You&rsquo;ll see whether a policy signer is installed, which payees it allows, and
            how much of the cap is used.
          </span>
          <button
            type="button"
            className="spend-policy__signin-button"
            onClick={() => void wallet.connect()}
          >
            Sign in
          </button>
        </div>
      )}

      {signedIn && loading && <Loading label="Checking your wallet's policy" />}

      {signedIn && !loading && (
        <>
          {!protectedFully && !installTx.busy && (
            <div role="alert" className="spend-policy__alert">
              <span className="spend-policy__alert-text">
                <b>{installed ? 'No spending rules configured' : 'No policy on this wallet'}</b>
                <span>
                  {installed
                    ? "The policy signer is installed, but nothing limits what it may authorise yet. Only the wallet's steward can set the asset, payees and cap — ask them to configure it before releasing a tranche."
                    : 'Without it, Restricted mode has no restriction at all: released money can be sent anywhere. Set it up before releasing a tranche.'}
                </span>
              </span>
              {!installed && (
                <button
                  type="button"
                  className="spend-policy__setup"
                  onClick={handleSetUp}
                  disabled={installTx.busy}
                >
                  Set up policy
                </button>
              )}
            </div>
          )}

          {installTx.busy && <PendingState title="Installing the policy signer…" />}

          {installTx.error && <ErrorPanel explained={installTx.error} onRetry={handleSetUp} />}

          <div className="spend-policy__grid">
            <div className="spend-policy__card">
              <h2>Checks</h2>
              {checks.map((check) => (
                <div key={check.label} className="spend-policy__check">
                  <span
                    aria-hidden="true"
                    className={`spend-policy__check-mark ${
                      check.ok
                        ? 'spend-policy__check-mark--ok'
                        : 'spend-policy__check-mark--missing'
                    }`}
                  >
                    {check.ok ? '✓' : '!'}
                  </span>
                  {check.label}
                </div>
              ))}
            </div>

            {protectedFully && policyRead.data && (
              <div className="spend-policy__card">
                <h2>Cap</h2>
                <div aria-hidden="true" className="spend-policy__track">
                  <span style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                </div>
                <div className="spend-policy__cap-row">
                  <span>
                    Spent <b className="numeric">{formatAmount(policyRead.data.spent, { asset: 'USDC' })}</b>
                  </span>
                  <span className="spend-policy__cap-row-muted">
                    Left <b className="numeric">{formatAmount(remaining, { asset: 'USDC' })}</b> of{' '}
                    {formatAmount(policyRead.data.cap, { asset: 'USDC' })}
                  </span>
                </div>
                <h3>Allowed payees</h3>
                <div className="spend-policy__payees">
                  {FIXTURE_POLICY_PAYEES.map((p) => (
                    <span key={p.address} className="spend-policy__payee">
                      {p.address}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {protectedFully && (
            <span className="spend-policy__sample-note">
              Sample payees — the policy contract can only confirm one address at a time, not
              list them. Allocated mode doesn&rsquo;t need this: money stays in escrow until you
              choose a payee.
            </span>
          )}

          <p className="spend-policy__limitation">
            A policy constrains one signer, not the wallet. A recipient holding an unrestricted
            admin signer can authorise around it — genuine enforcement needs the wallet&rsquo;s
            own signer limits, a deployment step this page cannot perform. This check only
            confirms the policy signer is installed, which bounds a misconfiguration to one
            tranche.
          </p>

          <p aria-live="polite" className="spend-policy__announce">
            {installTx.phase === 'success' ? 'Policy signer installed.' : ''}
          </p>
        </>
      )}
    </div>
  );
};
