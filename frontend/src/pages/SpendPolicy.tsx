import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import type { Policy } from '@milepost/policy-spend';
import { useAnnounceTransaction, useContractRead, useContractResult, useTransaction } from '../hooks';
import { useKeyedRead } from '../hooks/useKeyedRead';
import { usePageTitle } from '../hooks/usePageTitle';
import type { Sendable } from '../hooks/useTransaction';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { Empty, ErrorState, Loading } from '../components/state/AsyncStates';
import { TxSheet } from '../components/state/TxSheet';
import { SignInSheet } from '../components/layout/SignInSheet';
import { AmountField, Badge, Button, DisabledReason, Field, Notice, PageHead, StatTile } from '../components/ui';
import { formatAmount, percentOf, tryParseAmount } from '../lib/amount';
import { looksLikeAddress, truncateAddress } from '../lib/format';
import { extractCode } from '../lib/errors';
import { formatPeriod, summarisePolicy } from '../lib/policySummary';
import { fetchTokenName, parseTokenName } from '../lib/token';
import './SpendPolicy.css';

const SECONDS_PER_DAY = 86_400n;

/**
 * Whether a `get_policy` failure just means "no policy here". Its only error is
 * `NotConfigured` (1), but the published `@milepost/policy-spend` binding maps
 * the smart-wallet interface's errors instead of `SpendError`, so the code
 * arrives as an empty message. Either form means the same thing.
 */
function isNotConfigured(error: unknown): boolean {
  if (extractCode(error) === 1) return true;
  const message = error instanceof Error ? error.message : (error as { message?: unknown } | null)?.message;
  return message === '';
}

type Sheet = 'install' | 'configure' | 'payee' | null;

/**
 * `/policy`: what a Restricted wallet's spend policy allows, for any wallet.
 *
 * Funders and recipients both need to see what a Restricted wallet can do, so
 * the wallet is an input (defaulting to the signed-in one). Everything shown
 * is read from `policy_spend`: `get_policy` (asset, cap, period, spent),
 * `remaining`, `is_installed`, and `is_payee` for a payee someone names. The
 * contract can't list payees, only confirm one at a time.
 *
 * A policy constrains one signer, not the wallet, so the page says so first,
 * and never lets a green tick imply more.
 *
 * Writes (from `contracts/policy-spend`), each in a sheet:
 * - `install` adds the policy signer to the wallet.
 * - `configure` needs the steward's signature, and on the first configuration
 *   the wallet's too, so the recipient consents. Later changes are
 *   steward-only, so the wallet can't raise its own cap.
 * - `allow_payee` / `deny_payee` are steward-only.
 */
export const SpendPolicy = () => {
  usePageTitle('Spend policy');
  const wallet = useWallet();
  const { policy, rpcUrl } = useSoroban();
  const signedIn = Boolean(wallet.address);
  const address = wallet.address ?? '';
  const [signInOpen, setSignInOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const [walletInput, setWalletInput] = useState('');
  const [walletInputError, setWalletInputError] = useState<string | null>(null);
  const [checkedWallet, setCheckedWallet] = useState<string | null>(null);
  const target = checkedWallet ?? wallet.address ?? '';
  const ownWallet = Boolean(wallet.address) && target === wallet.address;
  const enabled = looksLikeAddress(target);

  const [payeeInput, setPayeeInput] = useState('');
  const [payeeInputError, setPayeeInputError] = useState<string | null>(null);
  const [payee, setPayee] = useState<string | null>(null);

  const installedRead = useContractRead<boolean>(() => policy.is_installed({ wallet: target }), [policy, target], {
    enabled,
    contract: 'policy',
  });
  const policyRead = useContractResult<Policy>(() => policy.get_policy({ wallet: target }), [policy, target], {
    enabled,
    contract: 'policy',
  });
  const remainingRead = useContractResult<bigint>(() => policy.remaining({ wallet: target }), [policy, target], {
    enabled: enabled && policyRead.data !== null,
    contract: 'policy',
  });
  const payeeRead = useContractRead<boolean>(
    () => policy.is_payee({ wallet: target, payee: payee ?? '' }),
    [policy, target, payee],
    { enabled: enabled && payee !== null, contract: 'policy' },
  );

  const loading = enabled && (installedRead.loading || policyRead.loading);
  const installed = installedRead.data === true;
  const noPolicy = policyRead.error !== null && isNotConfigured(policyRead.error);
  const policyFailed = policyRead.error !== null && !noPolicy;
  const configuredPolicy = policyRead.error ? null : policyRead.data;
  const summary = summarisePolicy({ installed, policy: configuredPolicy, remaining: remainingRead.data ?? null });

  // The policy's asset, by its code where the token answers.
  const tokenRead = useKeyedRead(configuredPolicy?.token ?? null, (token) =>
    fetchTokenName(token, rpcUrl).then((r) => parseTokenName(r.result).code),
  );
  const unit = tokenRead.status === 'ok' ? tokenRead.data : 'tokens';

  // --- Install --------------------------------------------------------------
  const installTx = useTransaction<null>({ contract: 'policy', onSuccess: () => installedRead.refetch() });
  useAnnounceTransaction({
    phase: installTx.phase,
    error: installTx.error,
    pending: 'Installing the policy signer…',
    success: 'Policy signer installed.',
  });
  const install = () => {
    setSheet('install');
    void installTx.prepare(() => policy.install({ wallet: target }));
  };

  // --- Configure ------------------------------------------------------------
  const [stewardInput, setStewardInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [capInput, setCapInput] = useState('');
  const [periodInput, setPeriodInput] = useState('30');

  const configuredSteward = configuredPolicy?.steward ?? null;
  const effectiveSteward = stewardInput.trim() || configuredSteward || '';
  const stewardError =
    stewardInput.trim() !== '' && !looksLikeAddress(stewardInput.trim()) ? 'Enter a valid steward address.' : null;
  const isConfigureSteward = Boolean(address && effectiveSteward === address);
  const tokenError =
    tokenInput.trim() !== '' && !looksLikeAddress(tokenInput.trim()) ? 'Enter the asset contract address.' : null;
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
  useAnnounceTransaction({
    phase: configureTx.phase,
    error: configureTx.error,
    pending: 'Configuring the policy…',
    success: 'Policy configured.',
  });

  const configureReason = !enabled
    ? 'Choose a wallet first.'
    : !isConfigureSteward
      ? configuredSteward
        ? `Only the policy steward (${truncateAddress(configuredSteward)}) can change these rules.`
        : 'Enter the steward address; only that account can send this configuration.'
      : tokenInput.trim() === '' || tokenError
        ? 'Enter the asset contract.'
        : !capParsed.ok
          ? 'Enter a spending cap.'
          : periodError;

  const configure = (event?: FormEvent) => {
    event?.preventDefault();
    if (configureReason || configureTx.busy || !capParsed.ok) return;
    const period = BigInt(periodDays) * SECONDS_PER_DAY;
    setSheet('configure');
    void configureTx.prepare(async () => {
      const tx = await policy.configure({
        steward: effectiveSteward,
        wallet: target,
        token: tokenInput.trim(),
        cap: capParsed.value,
        period,
      });
      const rawFee = (
        tx as unknown as { simulationResponse?: { minResourceFee?: string | number | bigint } }
      ).simulationResponse?.minResourceFee;
      return {
        estimatedFee: rawFee !== undefined ? BigInt(rawFee) : undefined,
        signAndSend: async (options) => {
          const sent = await tx.signAndSend(options);
          // Result<void>: a rejection reverts the whole call, so surface it through explain().
          sent.result.unwrap();
          return { result: null };
        },
      } satisfies Sendable<null>;
    });
  };

  // --- Payees ---------------------------------------------------------------
  const [newPayeeInput, setNewPayeeInput] = useState('');
  const [payeeAttempted, setPayeeAttempted] = useState(false);
  const newPayeeError =
    payeeAttempted && !looksLikeAddress(newPayeeInput.trim()) ? 'Enter a valid Stellar address.' : null;
  const [payeeAction, setPayeeAction] = useState<{ kind: 'allow' | 'deny'; payee: string } | null>(null);
  const payeeTx = useTransaction<string>({ contract: 'policy', onSuccess: () => payeeRead.refetch() });
  useAnnounceTransaction({
    phase: payeeTx.phase,
    error: payeeTx.error,
    pending: 'Updating the payee list…',
    success: 'Payee list updated.',
  });
  const isSteward = Boolean(address && configuredSteward && address === configuredSteward);
  const payeeReason = !configuredPolicy
    ? 'Configure the policy first. The payee list belongs to a configured policy.'
    : !isSteward
      ? `Only the policy steward (${truncateAddress(configuredSteward ?? '')}) can add or remove payees.`
      : null;
  const [sessionPayees, setSessionPayees] = useState<string[]>([]);

  const changePayee = async (kind: 'allow' | 'deny', who: string) => {
    if (payeeReason || !configuredSteward || payeeTx.busy) return;
    setPayeeAction({ kind, payee: who });
    setSheet('payee');
    await payeeTx.prepare(async () => {
      const args = { steward: configuredSteward, wallet: target, payee: who };
      const tx = kind === 'allow' ? await policy.allow_payee(args) : await policy.deny_payee(args);
      const rawFee = (
        tx as unknown as { simulationResponse?: { minResourceFee?: string | number | bigint } }
      ).simulationResponse?.minResourceFee;
      return {
        estimatedFee: rawFee !== undefined ? BigInt(rawFee) : undefined,
        signAndSend: async (options) => {
          const sent = await tx.signAndSend(options);
          sent.result.unwrap();
          return { result: who };
        },
      } satisfies Sendable<string>;
    });
  };

  const confirmPayee = async () => {
    if (!payeeAction) return;
    const done = await payeeTx.confirm();
    if (done !== null) {
      setSessionPayees((prev) =>
        payeeAction.kind === 'allow'
          ? prev.includes(done)
            ? prev
            : [...prev, done]
          : prev.filter((p) => p !== done),
      );
      if (payeeAction.kind === 'allow') {
        setNewPayeeInput('');
        setPayeeAttempted(false);
      }
    }
  };

  const handleAddPayee = (event: FormEvent) => {
    event.preventDefault();
    setPayeeAttempted(true);
    if (!looksLikeAddress(newPayeeInput.trim())) return;
    void changePayee('allow', newPayeeInput.trim());
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

  const checks: { label: string; detail: string; ok: boolean }[] = [
    {
      label: 'Policy signer installed',
      detail: installed ? 'The wallet says it added this signer.' : 'Nothing enforces the rules until it is.',
      ok: installed,
    },
    {
      label: configuredPolicy ? `Only ${unit}` : 'Only one asset',
      detail: configuredPolicy ? 'Other assets are refused by this signer.' : 'Set when the policy is configured.',
      ok: Boolean(configuredPolicy),
    },
    {
      label: 'Only verified payees',
      detail: configuredPolicy ? 'The steward’s payee list.' : 'Set when the policy is configured.',
      ok: Boolean(configuredPolicy),
    },
    {
      label: 'Spending cap',
      detail: configuredPolicy
        ? `${formatAmount(configuredPolicy.cap)} ${unit} each ${formatPeriod(configuredPolicy.period)}`
        : 'Set when the policy is configured.',
      ok: Boolean(configuredPolicy),
    },
  ];
  const pct = configuredPolicy ? percentOf(configuredPolicy.spent, configuredPolicy.cap) : 0;
  const summaryTone = summary.status === 'protected' ? 'ok' : summary.status === 'unprotected' ? 'risk' : 'warn';
  const currentPeriodDays = configuredPolicy
    ? Math.round(Number(configuredPolicy.period) / Number(SECONDS_PER_DAY))
    : null;

  return (
    <div className="spend-policy">
      <PageHead eyebrow="Get funded" title="Spend policy">
        <p>
          Restricted awards are paid into a smart wallet, behind a policy that limits what can be spent and where. Check
          any wallet’s policy here.
        </p>
      </PageHead>

      <Notice tone="risk">
        <span>
          <strong>Restricted is weaker than it looks.</strong> A policy limits one signer on the wallet, not the whole
          wallet. If the wallet has another signer without the policy, the money is effectively unrestricted. Allocated
          mode doesn’t have this problem.
        </span>
      </Notice>

      <form className="spend-policy__lookup" onSubmit={handleCheckWallet} noValidate>
        <Field
          label="Wallet to check"
          value={walletInput}
          onChange={(event) => setWalletInput(event.target.value)}
          placeholder={wallet.address ?? 'G… or C…'}
          hint={wallet.address ? 'Leave empty to check your own wallet.' : 'A Stellar account or smart wallet address.'}
          error={walletInputError}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary">
          Check wallet
        </Button>
      </form>

      {!enabled && (
        <>
          <Empty
            title="Check a wallet’s spend policy"
            description="Enter a wallet above, or sign in to check your own. You’ll see whether a policy signer is installed, the asset, cap and period it enforces, and how much is left this period."
            action={
              <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={() => setSignInOpen(true)}>
                Sign in with Freighter
              </Button>
            }
          />
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
        </>
      )}

      {loading && <Loading label="Checking the wallet's policy" />}

      {enabled && !loading && (
        <>
          <p className="spend-policy__target">
            {ownWallet ? 'Your wallet' : 'Wallet'} <span className="numeric">{truncateAddress(target)}</span>
          </p>

          {policyFailed ? (
            <ErrorState error={policyRead.error} contract="policy" onRetry={policyRead.refetch} />
          ) : (
            <Notice tone={summaryTone} role={summary.status === 'protected' ? undefined : 'alert'}>
              <span>{summary.sentence}</span>
              {ownWallet && summary.status === 'none' && (
                <Button size="sm" icon={<ShieldCheck size={16} aria-hidden="true" />} onClick={install}>
                  Install policy signer
                </Button>
              )}
            </Notice>
          )}

          {configuredPolicy && (
            <div className="ui-stat-tiles ui-stat-tiles--three">
              <StatTile
                label="Cap left this period"
                value={formatAmount(summary.remaining ?? 0n)}
                unit={unit}
                hint={`of ${formatAmount(configuredPolicy.cap)}`}
                highlight
              />
              <StatTile label="Spent this period" value={formatAmount(configuredPolicy.spent)} unit={unit} />
              <StatTile label="Period" value={currentPeriodDays ?? '—'} unit="days" hint="The cap resets each period" />
            </div>
          )}

          <div className="spend-policy__grid">
            <section className="spend-policy__panel" aria-labelledby="policy-checks">
              <div className="spend-policy__panel-head">
                <h2 id="policy-checks">Checks</h2>
                <Badge tone={summary.status === 'protected' ? 'success' : 'warning'}>
                  {summary.status === 'protected' ? 'Policy active' : 'Not enforced'}
                </Badge>
              </div>
              <ul className="spend-policy__checks">
                {checks.map((c) => (
                  <li key={c.label}>
                    <span>
                      <b>{c.label}</b>
                      <span>{c.detail}</span>
                    </span>
                    <span className={c.ok ? 'spend-policy__on' : 'spend-policy__off'}>
                      {c.ok ? <Check size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
                      {c.ok ? 'On' : 'Missing'}
                    </span>
                  </li>
                ))}
              </ul>
              {configuredPolicy && (
                <div className="spend-policy__meter">
                  <div className="spend-policy__meter-row">
                    <span>Cap used this period</span>
                    <span className="numeric">
                      {formatAmount(configuredPolicy.spent)} / {formatAmount(configuredPolicy.cap)}
                    </span>
                  </div>
                  <div className="spend-policy__track" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                  </div>
                </div>
              )}
            </section>

            <aside className="spend-policy__aside">
              <section aria-labelledby="payee-check">
                <h2 id="payee-check">Is a payee approved?</h2>
                <p>The contract can’t list payees, only confirm one at a time.</p>
                <form className="spend-policy__inline" onSubmit={handleCheckPayee} noValidate>
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
                    {payeeRead.data ? 'is an approved payee for this wallet.' : 'is not an approved payee for this wallet.'}
                  </p>
                )}
              </section>
              <section aria-labelledby="policy-alt">
                <h2 id="policy-alt">Rather not deal with this?</h2>
                <p>
                  Ask the programme for <b>Allocated</b> awards. The money stays in the contract’s escrow until you choose a
                  verified payee, so nothing outside the contract can weaken it. <Link to="/recipients">Your awards</Link>
                </p>
              </section>
            </aside>
          </div>

          {signedIn && (
            <div className="spend-policy__steward">
              <section className="spend-policy__panel" aria-labelledby="policy-configure">
                <h2 id="policy-configure">{configuredPolicy ? 'Update the policy' : 'Configure the policy'}</h2>
                <p className="spend-policy__lead">
                  Only the steward can set these. A wallet’s first configuration must also be approved by the wallet itself.
                </p>
                <form onSubmit={configure} className="spend-policy__form">
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
                    hint="The one asset this signer may move."
                    spellCheck={false}
                  />
                  <div className="spend-policy__two">
                    <AmountField
                      label="Spending cap per period"
                      value={capInput}
                      onChange={setCapInput}
                      asset="tokens"
                      hint="The most that may leave the wallet in one period."
                    />
                    <Field
                      label="Period (days)"
                      inputMode="numeric"
                      value={periodInput}
                      onChange={(event) => setPeriodInput(event.target.value)}
                      error={periodInput !== '' ? (periodError ?? undefined) : undefined}
                      hint="Length of the spending window."
                    />
                  </div>
                  {configuredPolicy && (
                    <p className="spend-policy__current">
                      Now: cap {formatAmount(configuredPolicy.cap)} {unit}, every {currentPeriodDays} days, steward{' '}
                      <span className="numeric">{truncateAddress(configuredPolicy.steward)}</span>.
                    </p>
                  )}
                  <div className="spend-policy__actions">
                    <Button type="submit" disabled={Boolean(configureReason) || configureTx.busy}>
                      {configuredPolicy ? 'Update policy' : 'Configure policy'}
                    </Button>
                    {configureReason && <DisabledReason>{configureReason}</DisabledReason>}
                  </div>
                </form>
              </section>

              <section className="spend-policy__panel" aria-labelledby="policy-payees">
                <h2 id="policy-payees">Payees</h2>
                <p className="spend-policy__lead">Who this wallet may pay, within the cap. Only the steward changes this list.</p>
                <form onSubmit={handleAddPayee} className="spend-policy__inline">
                  <Field
                    label="Add a payee"
                    placeholder="G… or C…"
                    value={newPayeeInput}
                    onChange={(event) => {
                      setNewPayeeInput(event.target.value);
                      setPayeeAttempted(false);
                    }}
                    error={newPayeeError ?? undefined}
                    spellCheck={false}
                  />
                  <Button type="submit" variant="secondary" disabled={Boolean(payeeReason) || payeeTx.busy}>
                    Add payee
                  </Button>
                </form>
                {payeeReason && <DisabledReason>{payeeReason}</DisabledReason>}
                {sessionPayees.length > 0 && (
                  <ul className="spend-policy__session">
                    {sessionPayees.map((p) => (
                      <li key={p}>
                        <span className="numeric" title={p}>
                          {truncateAddress(p, 8, 6)}
                        </span>
                        <Badge tone="neutral">Added this session</Badge>
                        {isSteward && (
                          <Button size="sm" variant="ghost" onClick={() => void changePayee('deny', p)}>
                            Remove
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}

      <TxSheet
        open={sheet === 'install'}
        onClose={() => {
          setSheet(null);
          installTx.reset();
        }}
        tx={installTx}
        eyebrow="Spend policy"
        pendingTitle="Installing the policy signer"
        doneTitle="Policy signer installed"
        doneText="Configure its asset, cap and payees next. Until then it enforces nothing."
        failTitle="Policy signer not installed"
        onRetry={install}
      />
      <TxSheet
        open={sheet === 'configure'}
        onClose={() => {
          setSheet(null);
          configureTx.reset();
        }}
        tx={configureTx}
        eyebrow="Spend policy"
        pendingTitle={configuredPolicy ? 'Updating the policy' : 'Configuring the policy'}
        doneTitle={configuredPolicy ? 'Policy updated' : 'Policy configured'}
        doneText="The new limits apply to the next transfer this signer authorises."
        failTitle="Policy not changed"
        onRetry={() => configure()}
      />
      <TxSheet
        open={sheet === 'payee'}
        onClose={() => {
          setSheet(null);
          payeeTx.reset();
        }}
        tx={payeeTx}
        eyebrow="Spend policy"
        pendingTitle={payeeAction?.kind === 'deny' ? 'Removing the payee' : 'Adding the payee'}
        doneTitle={payeeAction?.kind === 'deny' ? 'Payee removed' : 'Payee added'}
        doneText={
          payeeAction ? (
            <>
              <span className="numeric">{truncateAddress(payeeAction.payee)}</span>{' '}
              {payeeAction.kind === 'deny' ? 'can no longer be paid from this wallet.' : 'can now be paid from this wallet, within the cap.'}
            </>
          ) : undefined
        }
        onConfirm={() => void confirmPayee()}
        failTitle="Payee list not changed"
        onRetry={payeeAction ? () => void changePayee(payeeAction.kind, payeeAction.payee) : undefined}
      />
    </div>
  );
};
