import { useState, type FormEvent } from 'react';
import type { Policy } from '@milepost/policy-spend';
import { useAnnounceTransaction, useContractRead, useContractResult, useTransaction } from '../hooks';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { ErrorPanel, ErrorState, Loading, PendingState } from '../components/state/AsyncStates';
import { Button, Field } from '../components/ui';
import { formatAmount, percentOf } from '../lib/amount';
import { looksLikeAddress, truncateAddress } from '../lib/format';
import { formatPeriod, summarisePolicy } from '../lib/policySummary';
import './SpendPolicy.css';

/**
 * Spend policy checker, for any wallet.
 *
 * Funders and recipients both need to see what a Restricted wallet can do, so
 * the wallet is an input (defaulting to the signed-in one). Everything shown
 * is read from `policy_spend`: `get_policy` (asset, cap, period, spent),
 * `remaining`, `is_installed`, and `is_payee` for a payee the user names —
 * the contract cannot list payees, only confirm one at a time.
 *
 * A policy constrains one signer, not the wallet: `is_installed` only
 * confirms the wallet claims to have added this contract as a signer. Neither
 * call can verify the wallet's own signer limits, which is why the limitation
 * below is stated rather than implied by a green checkmark. Configuring a
 * policy (dual-auth `configure()`) is out of scope for this screen; it only
 * checks, and installs the signer flag on the signed-in wallet.
 */
export const SpendPolicy = () => {
  const wallet = useWallet();
  const { policy } = useSoroban();

  const [walletInput, setWalletInput] = useState('');
  const [walletInputError, setWalletInputError] = useState<string | null>(null);
  const [checkedWallet, setCheckedWallet] = useState<string | null>(null);
  const target = checkedWallet ?? wallet.address ?? '';
  const ownWallet = Boolean(wallet.address) && target === wallet.address;
  const enabled = looksLikeAddress(target);

  const [payeeInput, setPayeeInput] = useState('');
  const [payeeInputError, setPayeeInputError] = useState<string | null>(null);
  const [payee, setPayee] = useState<string | null>(null);

  const installedRead = useContractRead<boolean>(
    () => policy.is_installed({ wallet: target }),
    [policy, target],
    { enabled, contract: 'policy' },
  );
  const policyRead = useContractResult<Policy>(
    () => policy.get_policy({ wallet: target }),
    [policy, target],
    { enabled, contract: 'policy' },
  );
  const remainingRead = useContractResult<bigint>(
    () => policy.remaining({ wallet: target }),
    [policy, target],
    { enabled: enabled && policyRead.data !== null, contract: 'policy' },
  );
  const payeeRead = useContractRead<boolean>(
    () => policy.is_payee({ wallet: target, payee: payee ?? '' }),
    [policy, target, payee],
    { enabled: enabled && payee !== null, contract: 'policy' },
  );

  const installTx = useTransaction<null>({
    contract: 'policy',
    onSuccess: () => installedRead.refetch(),
  });
  useAnnounceTransaction({
    phase: installTx.phase,
    error: installTx.error,
    pending: 'Installing the policy signer…',
    success: 'Policy signer installed.',
  });

  const loading = enabled && (installedRead.loading || policyRead.loading);
  const installed = installedRead.data === true;
  const configuredPolicy = policyRead.error ? null : policyRead.data;
  const summary = summarisePolicy({
    installed,
    policy: configuredPolicy,
    remaining: remainingRead.data ?? null,
  });

  const handleSetUp = () => {
    void installTx.send(() => policy.install({ wallet: target }));
  };

  const handleCheckWallet = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = walletInput.trim();
    if (!looksLikeAddress(value)) {
      setWalletInputError('Enter a Stellar account (G…) or smart wallet (C…) address.');
      return;
    }
    setWalletInputError(null);
    setPayee(null);
    setCheckedWallet(value);
  };

  const handleCheckPayee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = payeeInput.trim();
    if (!looksLikeAddress(value)) {
      setPayeeInputError('Enter the payee address (G… or C…).');
      return;
    }
    setPayeeInputError(null);
    setPayee(value);
  };

  const checks: { label: string; ok: boolean }[] = [
    { label: 'Policy signer installed on this wallet', ok: installed },
    {
      label: configuredPolicy
        ? `Only ${truncateAddress(configuredPolicy.token)} can be sent`
        : "Only the grant's token can be sent",
      ok: Boolean(configuredPolicy),
    },
    { label: 'Only verified payees can receive', ok: Boolean(configuredPolicy) },
    {
      label: configuredPolicy
        ? `Spending cap of ${formatAmount(configuredPolicy.cap)} each ${formatPeriod(configuredPolicy.period)}`
        : 'A spending cap',
      ok: Boolean(configuredPolicy),
    },
  ];

  const pct = configuredPolicy ? percentOf(configuredPolicy.spent, configuredPolicy.cap) : 0;

  return (
    <div className="spend-policy">
      <header className="spend-policy__header">
        <h1>Spend policy</h1>
        <p className="typo-text text-muted">
          In Restricted mode, grant money lands in the recipient&rsquo;s own wallet. A policy
          signer keeps it to the grant&rsquo;s token, verified payees, and a cap. Check any
          wallet&rsquo;s policy here.
        </p>
      </header>

      <form className="spend-policy__lookup" onSubmit={handleCheckWallet} noValidate>
        <Field
          label="Wallet to check"
          value={walletInput}
          onChange={(event) => setWalletInput(event.target.value)}
          placeholder={wallet.address ?? 'G… or C…'}
          hint={
            wallet.address
              ? 'Leave empty to check your own wallet.'
              : 'A Stellar account or smart wallet address.'
          }
          error={walletInputError}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary">
          Check wallet
        </Button>
      </form>

      {!enabled && (
        <div className="spend-policy__signin">
          <span className="spend-policy__signin-title">Enter a wallet, or sign in</span>
          <span className="spend-policy__signin-body">
            You&rsquo;ll see whether a policy signer is installed, the asset, cap and period it
            enforces, and how much is left this period.
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

      {loading && <Loading label="Checking the wallet's policy" />}

      {enabled && !loading && (
        <>
          <p className="spend-policy__target">
            {ownWallet ? 'Your wallet' : 'Wallet'}{' '}
            <span className="numeric">{truncateAddress(target)}</span>
          </p>

          {policyRead.error ? (
            <ErrorState error={policyRead.error} contract="policy" onRetry={policyRead.refetch} />
          ) : (
            <p
              className={`spend-policy__summary spend-policy__summary--${summary.status}`}
              role={summary.status === 'protected' ? undefined : 'alert'}
            >
              {summary.sentence}
            </p>
          )}

          {ownWallet && summary.status === 'none' && !installTx.busy && (
            <div className="spend-policy__alert">
              <span className="spend-policy__alert-text">
                <b>No policy on this wallet</b>
                <span>
                  Without it, Restricted mode has no restriction at all: released money can be sent
                  anywhere. Set it up before releasing a tranche.
                </span>
              </span>
              <button
                type="button"
                className="spend-policy__setup"
                onClick={handleSetUp}
                disabled={installTx.busy}
              >
                Set up policy
              </button>
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

            {configuredPolicy && (
              <div className="spend-policy__card">
                <h2>Cap this period</h2>
                <div aria-hidden="true" className="spend-policy__track">
                  <span style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                </div>
                <div className="spend-policy__cap-row">
                  <span>
                    Spent <b className="numeric">{formatAmount(configuredPolicy.spent)}</b>
                  </span>
                  <span className="spend-policy__cap-row-muted">
                    Left <b className="numeric">{formatAmount(summary.remaining ?? 0n)}</b> of{' '}
                    {formatAmount(configuredPolicy.cap)}
                  </span>
                </div>

                <h3>Is a payee approved?</h3>
                <form className="spend-policy__payee-check" onSubmit={handleCheckPayee} noValidate>
                  <Field
                    label="Payee address"
                    value={payeeInput}
                    onChange={(event) => setPayeeInput(event.target.value)}
                    placeholder="G… or C…"
                    error={payeeInputError}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button type="submit" variant="secondary">
                    Check payee
                  </Button>
                </form>
                {payee && payeeRead.loading && <Loading label="Checking the payee" rows={1} />}
                {payee && Boolean(payeeRead.error) && (
                  <ErrorState error={payeeRead.error} contract="policy" onRetry={payeeRead.refetch} />
                )}
                {payee && payeeRead.data !== null && !payeeRead.loading && (
                  <p className="spend-policy__payee-result" role="status">
                    <span className="numeric">{truncateAddress(payee)}</span>{' '}
                    {payeeRead.data
                      ? 'is an approved payee for this wallet.'
                      : 'is not an approved payee for this wallet.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="spend-policy__limitation">
            A policy constrains one signer, not the wallet. A recipient holding an unrestricted
            admin signer can authorise around it — genuine enforcement needs the wallet&rsquo;s
            own signer limits, a deployment step this page cannot perform. Allocated mode
            doesn&rsquo;t need this: money stays in escrow until the recipient chooses a payee.
          </p>
        </>
      )}
    </div>
  );
};
