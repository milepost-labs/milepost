import { useState, type FormEvent } from 'react';
import type { Policy } from '@milepost/policy-spend';
import {
  useAnnounceTransaction,
  useContractRead,
  useContractResult,
  useTransaction,
} from '../hooks';
import type { Sendable } from '../hooks/useTransaction';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { AmountField, Badge, Button, Card, Field } from '../components/ui';
import {
  ErrorPanel,
  Loading,
  PendingState,
  TransactionOutcome,
} from '../components/state/AsyncStates';
import { formatAmount, percentOf, tryParseAmount } from '../lib/amount';
import { looksLikeAddress } from '../lib/format';
import './SpendPolicy.css';

const SECONDS_PER_DAY = 86_400n;

/**
 * Spend policy: check, configure, and manage payees.
 *
 * A policy constrains one signer, not the wallet: `is_installed` only
 * confirms the wallet claims to have added this contract as a signer, and
 * `get_policy` only exists once a steward has configured an asset, payees
 * and a cap for it. Neither call can verify the wallet's own signer limits
 * — that is a deployment step outside these contracts, which is why the
 * limitation below is stated rather than implied by a green checkmark.
 *
 * Who may write (from `contracts/policy-spend/src/lib.rs`):
 * - `configure` needs the steward's signature; on the *first* configuration
 *   it also needs the wallet's, so the recipient consents before money
 *   arrives. Later changes are steward-only, so the wallet cannot raise its
 *   own cap.
 * - `allow_payee` / `deny_payee` are steward-only. The wallet deliberately
 *   cannot edit its own allowlist.
 *
 * The screen signs with the connected account, so configure and payee actions
 * are gated on that account being the steward. A steward may enter a
 * recipient's wallet address to manage it; the wallet's own signer setup is
 * what lets a first configuration pass.
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

  // --- Which wallet is being inspected / managed --------------------------
  const [walletInput, setWalletInput] = useState('');
  const walletError =
    walletInput.trim() !== '' && !looksLikeAddress(walletInput.trim())
      ? 'Enter a valid wallet address.'
      : null;
  const viewedWallet = walletError ? '' : walletInput.trim() || address;
  const canRead = signedIn && viewedWallet !== '';

  // --- Which wallet is being inspected / managed --------------------------
  const [walletInput, setWalletInput] = useState('');
  const walletError =
    walletInput.trim() !== '' && !looksLikeAddress(walletInput.trim())
      ? 'Enter a valid wallet address.'
      : null;
  const viewedWallet = walletError ? '' : walletInput.trim() || address;
  const canRead = signedIn && viewedWallet !== '';

  const installedRead = useContractRead<boolean>(
    () => policy.is_installed({ wallet: viewedWallet }),
    [policy, viewedWallet],
    { enabled: canRead, contract: 'policy' },
  );
  const policyRead = useContractResult<Policy>(
    () => policy.get_policy({ wallet: viewedWallet }),
    [policy, viewedWallet],
    { enabled: canRead, contract: 'policy' },
  );
  const remainingRead = useContractResult<bigint>(
    () => policy.remaining({ wallet: viewedWallet }),
    [policy, viewedWallet],
    { enabled: canRead && policyRead.data !== null, contract: 'policy' },
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
  const configured = policyRead.data !== null && !policyRead.error;
  const protectedFully = installed && configured;
  const policyData = policyRead.data;

  const handleSetUp = () => {
    if (!viewedWallet) return;
    void installTx.send(() => policy.install({ wallet: viewedWallet }));
  };

  const capLabel = configured
    ? `Spending cap of ${formatAmount(policyData!.cap)}`
    : 'A spending cap';

  const checks: { label: string; ok: boolean }[] = [
    { label: 'Policy signer installed on the wallet', ok: installed },
    { label: "Only the grant's token can be sent", ok: configured },
    { label: 'Only verified payees can receive', ok: configured },
    { label: capLabel, ok: configured },
  ];

  const pct = configured ? percentOf(policyData!.spent, policyData!.cap) : 0;
  const remaining = remainingRead.data ?? (policyData ? policyData.cap - policyData.spent : 0n);

  // --- Configure (#409) ----------------------------------------------------
  const [stewardInput, setStewardInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [capInput, setCapInput] = useState('');
  const [periodInput, setPeriodInput] = useState('30');

  const configuredSteward = policyData?.steward ?? null;
  const effectiveSteward = stewardInput.trim() || configuredSteward || '';
  const stewardError =
    stewardInput.trim() !== '' && !looksLikeAddress(stewardInput.trim())
      ? 'Enter a valid steward address.'
      : null;
  const isConfigureSteward = Boolean(address && effectiveSteward === address);

  const tokenError =
    tokenInput.trim() !== '' && !looksLikeAddress(tokenInput.trim())
      ? 'Enter the asset contract address.'
      : null;
  const capParsed = tryParseAmount(capInput);
  const periodDays = Number(periodInput);
  const periodError =
    periodInput.trim() === ''
      ? 'Enter a period.'
      : !Number.isInteger(periodDays) || periodDays < 1 || periodDays > 365
        ? 'Enter a whole number of days from 1 to 365.'
        : null;

  const configureTx = useTransaction<null>({
    contract: 'policy',
    onSuccess: () => {
      policyRead.refetch();
      remainingRead.refetch();
    },
  });

  const canConfigure =
    signedIn &&
    !walletError &&
    viewedWallet !== '' &&
    isConfigureSteward &&
    tokenInput.trim() !== '' &&
    !tokenError &&
    capParsed.ok &&
    !periodError &&
    !configureTx.busy;

  const handleConfigure = (event: FormEvent) => {
    event.preventDefault();
    if (!canConfigure || !capParsed.ok) return;
    const period = BigInt(periodDays) * SECONDS_PER_DAY;
    void configureTx.send(async () => {
      const tx = await policy.configure({
        steward: effectiveSteward,
        wallet: viewedWallet,
        token: tokenInput.trim(),
        cap: capParsed.value,
        period,
      });
      return {
        signAndSend: async (options) => {
          const sent = await tx.signAndSend(options);
          // The contract returns Result<void>; a rejection reverts the whole
          // invocation, so surfacing it here routes it through explain().
          sent.result.unwrap();
          return { result: null };
        },
      } satisfies Sendable<null>;
    });
  };

  const currentPeriodDays = policyData
    ? Math.round(Number(policyData.period) / Number(SECONDS_PER_DAY))
    : null;

  // --- Payees (#410) -------------------------------------------------------
  const [payeeInput, setPayeeInput] = useState('');
  const [payeeAttempted, setPayeeAttempted] = useState(false);
  const payeeError =
    payeeAttempted && !looksLikeAddress(payeeInput.trim())
      ? 'Enter a valid Stellar address.'
      : null;
  const payeeTx = useTransaction<string>({ contract: 'policy' });
  const isSteward = Boolean(address && configuredSteward && address === configuredSteward);
  const canManagePayees = configured && isSteward && !payeeTx.busy;

  const [sessionPayees, setSessionPayees] = useState<string[]>([]);
  const [checkInput, setCheckInput] = useState('');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<'checking' | 'yes' | 'no' | 'error' | null>(null);

  const handleAddPayee = async (event: FormEvent) => {
    event.preventDefault();
    setPayeeAttempted(true);
    const payee = payeeInput.trim();
    if (!canManagePayees || !configuredSteward || !looksLikeAddress(payee)) return;

    const added = await payeeTx.send(async () => {
      const tx = await policy.allow_payee({
        steward: configuredSteward,
        wallet: viewedWallet,
        payee,
      });
      return {
        signAndSend: async (options) => {
          const sent = await tx.signAndSend(options);
          sent.result.unwrap();
          return { result: payee };
        },
      } satisfies Sendable<string>;
    });

    if (added !== null) {
      setSessionPayees((prev) => (prev.includes(added) ? prev : [...prev, added]));
      setPayeeInput('');
      setPayeeAttempted(false);
    }
  };

  const handleRemovePayee = async (payee: string) => {
    if (!canManagePayees || !configuredSteward) return;
    const removed = await payeeTx.send(async () => {
      const tx = await policy.deny_payee({
        steward: configuredSteward,
        wallet: viewedWallet,
        payee,
      });
      return {
        signAndSend: async (options) => {
          const sent = await tx.signAndSend(options);
          sent.result.unwrap();
          return { result: payee };
        },
      } satisfies Sendable<string>;
    });
    if (removed !== null) {
      setSessionPayees((prev) => prev.filter((entry) => entry !== removed));
    }
  };

  const handleCheckPayee = async (event: FormEvent) => {
    event.preventDefault();
    const payee = checkInput.trim();
    if (!looksLikeAddress(payee)) {
      setCheckError('Enter a valid Stellar address.');
      setCheckState(null);
      return;
    }
    setCheckError(null);
    setCheckState('checking');
    try {
      const { result } = await policy.is_payee({ wallet: viewedWallet, payee });
      setCheckState(result ? 'yes' : 'no');
    } catch {
      setCheckState('error');
    }
  };

  return (
    <div className="spend-policy">
      <header className="spend-policy__header">
        <h1>Spend policy</h1>
        <p className="typo-text text-muted">
          In Restricted mode, grant money lands in the recipient&rsquo;s own wallet. A policy
          signer keeps it to the grant&rsquo;s token, verified payees, and a cap. This page checks
          that it&rsquo;s set up, configures it, and manages its payees.
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
          <span className="spend-policy__signin-title">Sign in to check or manage a wallet</span>
          <span className="spend-policy__signin-body">
            You&rsquo;ll see whether a policy signer is installed and how much of the cap is used.
            A steward can also configure the rules and its payees.
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

      {signedIn && (
        <Card title="Wallet">
          <Field
            label="Wallet address"
            placeholder={address || 'G…'}
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value)}
            error={walletError ?? undefined}
            hint="Defaults to your connected wallet. A steward can enter the recipient's wallet address to manage it."
            spellCheck={false}
          />
        </Card>
      )}

      {signedIn && loading && <Loading label="Checking the wallet's policy" />}

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
                  {installed
                    ? 'The policy signer is installed, but nothing limits what it may authorise yet. Configure the asset, cap and payees below before releasing a tranche.'
                    : 'Without it, Restricted mode has no restriction at all: released money can be sent anywhere. Set it up before releasing a tranche.'}
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

            {protectedFully && policyData && (
              <div className="spend-policy__card">
                <h2>Cap this period</h2>
                <div aria-hidden="true" className="spend-policy__track">
                  <span style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                </div>
                <div className="spend-policy__cap-row">
                  <span>
                    Spent <b className="numeric">{formatAmount(policyData.spent)}</b>
                  </span>
                  <span className="spend-policy__cap-row-muted">
                    Left <b className="numeric">{formatAmount(remaining)}</b> of{' '}
                    {formatAmount(policyData.cap)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Configure (issue #409) */}
          <Card title={configured ? 'Update the policy' : 'Configure the policy'}>
            <form onSubmit={handleConfigure} className="spend-policy__form">
              <Field
                label="Steward address"
                placeholder={configuredSteward ?? 'G…'}
                value={stewardInput}
                onChange={(event) => setStewardInput(event.target.value)}
                error={stewardInput !== '' ? (stewardError ?? undefined) : undefined}
                hint="The only account allowed to change these rules. It must authorise this transaction."
                spellCheck={false}
              />
              <Field
                label="Asset contract"
                placeholder="C…"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                error={tokenInput !== '' ? (tokenError ?? undefined) : undefined}
                hint="The one asset this restricted signer may move."
                spellCheck={false}
              />
              <AmountField
                label="Spending cap per period"
                value={capInput}
                onChange={setCapInput}
                asset="tokens"
                hint="The most that may leave this wallet in one period."
              />
              <Field
                label="Period (days)"
                inputMode="numeric"
                value={periodInput}
                onChange={(event) => setPeriodInput(event.target.value)}
                error={periodInput !== '' ? (periodError ?? undefined) : undefined}
                hint="Length of the spending window."
              />

              <p className="spend-policy__review" role="note">
                This will limit <b className="numeric">{viewedWallet || 'this wallet'}</b> to{' '}
                <b className="numeric">
                  {capParsed.ok ? formatAmount(capParsed.value) : '—'} tokens
                </b>{' '}
                every <b className="numeric">{periodInput.trim() || '—'} days</b>, sending only to
                verified payees. A wallet&rsquo;s first configuration must also be approved by
                the wallet itself.
              </p>

              {configuredSteward && !isConfigureSteward && (
                <p className="spend-policy__readonly" role="note">
                  Only the policy steward ({configuredSteward}) can change these rules. Connect
                  that account to continue.
                </p>
              )}
              {!configuredSteward && (
                <p className="spend-policy__readonly" role="note">
                  No policy is configured yet. Enter the steward address above; only that
                  account can send this configuration.
                </p>
              )}
              {configured && policyData && (
                <p className="spend-policy__current">
                  Current: cap {formatAmount(policyData.cap)}, period {currentPeriodDays} days,
                  steward {policyData.steward}.
                </p>
              )}

              <div className="spend-policy__actions">
                <Button
                  type="submit"
                  loading={configureTx.busy}
                  disabled={!canConfigure}
                >
                  {configured ? 'Update policy' : 'Configure policy'}
                </Button>
              </div>

              <TransactionOutcome
                phase={configureTx.phase}
                error={configureTx.error}
                successTitle={configured ? 'Policy updated' : 'Policy configured'}
                successDescription="The new limits apply to the next transfer this signer authorises."
              />
            </form>
          </Card>

          {/* Payees (issue #410) */}
          <Card title="Payees">
            {!configured && (
              <p className="spend-policy__readonly" role="note">
                Configure the policy first. The payee allowlist belongs to a configured policy.
              </p>
            )}
            {configured && !isSteward && (
              <p className="spend-policy__readonly" role="note">
                Only the policy steward ({configuredSteward}) can add or remove payees. You can
                still check whether an address is allowed.
              </p>
            )}

            <form onSubmit={handleAddPayee} className="spend-policy__form">
              <Field
                label="Add a payee"
                placeholder="G… or C…"
                value={payeeInput}
                onChange={(event) => {
                  setPayeeInput(event.target.value);
                  setPayeeAttempted(false);
                }}
                error={payeeError ?? undefined}
                hint="The address may then receive from this wallet, within the cap. Adding also records it below for this session."
                spellCheck={false}
              />
              <div className="spend-policy__actions">
                <Button
                  type="submit"
                  loading={payeeTx.busy}
                  disabled={!canManagePayees || !looksLikeAddress(payeeInput.trim())}
                >
                  Add payee
                </Button>
              </div>
            </form>

            <TransactionOutcome
              phase={payeeTx.phase}
              error={payeeTx.error}
              successTitle="Payee updated"
              successDescription="The allowlist change is live for this wallet."
            />

            {sessionPayees.length > 0 && (
              <div className="spend-policy__session">
                <h3>Added in this session</h3>
                <ul className="spend-policy__session-list">
                  {sessionPayees.map((payee) => (
                    <li key={payee} className="spend-policy__session-row">
                      <span className="spend-policy__payee">{payee}</span>
                      <Badge tone="neutral">Added this session</Badge>
                      {isSteward && (
                        <Button
                          variant="secondary"
                          onClick={() => void handleRemovePayee(payee)}
                          loading={payeeTx.busy}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleCheckPayee} className="spend-policy__form">
              <Field
                label="Check an address"
                placeholder="G… or C…"
                value={checkInput}
                onChange={(event) => {
                  setCheckInput(event.target.value);
                  setCheckError(null);
                  setCheckState(null);
                }}
                error={checkError ?? undefined}
                hint="Confirms one address at a time — the contract cannot list the allowlist."
                spellCheck={false}
              />
              <div className="spend-policy__actions">
                <Button
                  type="submit"
                  variant="secondary"
                  loading={checkState === 'checking'}
                  disabled={!configured || checkState === 'checking'}
                >
                  Check payee
                </Button>
              </div>
              {checkState === 'yes' && <Badge tone="success">Allowed payee</Badge>}
              {checkState === 'no' && <Badge tone="danger">Not an allowed payee</Badge>}
              {checkState === 'error' && <Badge tone="warning">Could not check this address</Badge>}
            </form>
          </Card>

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
