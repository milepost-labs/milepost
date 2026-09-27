import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import './VerifierDashboard.css';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useTransaction } from '../hooks/useTransaction';
import { truncateAddress } from '../lib/format';
import { explain } from '../lib/errors';
import { Badge, Button, Field } from '../components/ui';
import { ErrorPanel, PendingState } from '../components/state/AsyncStates';
import {
  FIXTURE_MY_ATTESTATIONS,
  FIXTURE_VERIFIER_QUEUE,
  type VerifierAttestation,
  type VerifierQueueItem,
} from '../fixtures/verifierFixtures';

type ItemStatus = 'idle' | 'pending' | 'error' | 'done' | 'declined';

/**
 * Verifier queue — the verifier's home screen.
 *
 * Signing an attestation releases someone's money and cannot be undone, so the
 * card slows the decision down: expanding shows exactly what is being signed
 * (schema, recipient, ledger), an optional reference note, and a required
 * checkbox that gates the sign button. "Can't confirm" dismisses with no
 * transaction at all.
 *
 * The queue is a stand-in; the indexer does not publish it yet. Every entry is
 * tagged as sample data.
 */
export const VerifierDashboard = () => {
  const { address, connect } = useWallet();
  const { attest } = useSoroban();
  const announce = useAnnouncer();

  const [statusById, setStatusById] = useState<Record<string, ItemStatus>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [reference, setReference] = useState('');
  const [newlySigned, setNewlySigned] = useState<VerifierAttestation[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const signTx = useTransaction<Buffer>({ contract: 'attest' });

  const queue = useMemo(
    () => FIXTURE_VERIFIER_QUEUE.filter((item) => (statusById[item.id] ?? 'idle') !== 'declined' && (statusById[item.id] ?? 'idle') !== 'done'),
    [statusById],
  );
  const mine = useMemo(() => [...newlySigned, ...FIXTURE_MY_ATTESTATIONS], [newlySigned]);

  const programmes = useMemo(() => {
    const ids = new Set<string>();
    for (const item of queue) ids.add(item.programmeId);
    for (const item of mine) ids.add(item.programmeId);
    return ids;
  }, [queue, mine]);

  const stats = [
    { k: 'Waiting for you', v: String(queue.length) },
    { k: 'Signed', v: String(mine.length) },
    { k: 'Programmes', v: String(programmes.size) },
  ];

  const openItem = openId ? (queue.find((item) => item.id === openId) ?? null) : null;

  const openClaim = (item: VerifierQueueItem) => {
    setOpenId(item.id);
    setChecked(false);
    setReference('');
    signTx.reset();
  };

  const closeClaim = () => {
    setOpenId(null);
    setChecked(false);
    setReference('');
    signTx.reset();
  };

  /** Dismiss with no transaction at all — the tranche stays locked. */
  const declineClaim = (item: VerifierQueueItem) => {
    setStatusById((prev) => ({ ...prev, [item.id]: 'declined' }));
    if (openId === item.id) closeClaim();
    announce('Marked as not confirmed. Nothing was sent; the tranche stays locked.');
  };

  const signClaim = async (item: VerifierQueueItem) => {
    if (!address || !checked || signTx.busy) return;
    setSigningId(item.id);
    setStatusById((prev) => ({ ...prev, [item.id]: 'pending' }));
    announce('Signing attestation.');

    // Stand-in queue rows carry human schema names, not on-chain UIDs, so the
    // sign attempt below carries a placeholder hash: the contract rejects it
    // with SchemaNotFound and the error panel explains it. Swapping in the real
    // queue (with real schema UIDs) is a change of source, not of flow.
    const result = await signTx.send(async () => {
      const tx = await attest.attest({
        attester: address,
        schema_uid: Buffer.alloc(32),
        subject: item.subject,
        data_hash: Buffer.alloc(32),
        expires_at: undefined,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      const uid = `att_${result.toString('hex').slice(0, 12)}…${result.toString('hex').slice(-4)}`;
      setNewlySigned((prev) => [
        {
          uid,
          programmeId: item.programmeId,
          programme: item.programme,
          subject: item.subject,
          schema: item.schema,
          ledger: item.requestedLedger + 1,
          used: false,
        },
        ...prev,
      ]);
      setStatusById((prev) => ({ ...prev, [item.id]: 'done' }));
      setOpenId(null);
      setChecked(false);
      setReference('');
      announce(`Attestation signed. ${item.subject} can now release tranche ${item.tranche}.`);
    } else {
      setStatusById((prev) => ({ ...prev, [item.id]: 'error' }));
      const explained = signTx.error ? explain(signTx.error, 'attest') : null;
      announce(explained ? `Attestation not signed. ${explained.message}` : 'Attestation not signed.', 'alert');
    }
    setSigningId(null);
  };

  const signIn = async () => {
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  };

  const signError = signTx.error ? explain(signTx.error, 'attest') : null;

  return (
    <div className="dashboard-container verifier-page">
      <header className="verifier-page__head">
        <div className="verifier-page__titles">
          <h1 id="h-ver">Verify conditions</h1>
          <p className="typo-text text-muted">
            When you confirm a condition, you sign an attestation. Each one unlocks exactly one
            tranche for one recipient, and can&apos;t be used twice.
          </p>
        </div>
        <Link className="verifier-page__lookup" to="/attestations">
          Look up an attestation →
        </Link>
      </header>

      {!address ? (
        <section className="verifier-page__signin" aria-labelledby="verifier-signin">
          <div className="verifier-page__signin-copy">
            <h2 id="verifier-signin">Sign in with your verifier account</h2>
            <p className="typo-text text-muted">
              Use the account the programme registered as its verifier, in Freighter.
            </p>
            <Button onClick={signIn} loading={connecting} loadingLabel="Signing in…">
              Sign in
            </Button>
          </div>
          <ul className="verifier-page__signin-list">
            <li>
              <span className="verifier-page__signin-name">Claims waiting for you</span>
              <span className="verifier-page__signin-hint">
                Recipients whose next tranche needs your confirmation
              </span>
            </li>
            <li>
              <span className="verifier-page__signin-name">Attestations you&apos;ve signed</span>
              <span className="verifier-page__signin-hint">
                And whether each has released a tranche yet
              </span>
            </li>
            <li>
              <span className="verifier-page__signin-name">Programmes you verify for</span>
              <span className="verifier-page__signin-hint">
                With the condition each one asks you to check
              </span>
            </li>
          </ul>
        </section>
      ) : (
        <>
          <div className="verifier-page__stats" role="list" aria-label="Verification summary">
            {stats.map((s) => (
              <div key={s.k} className="verifier-page__stat" role="listitem">
                <span className="verifier-page__stat-label">{s.k}</span>
                <span className="verifier-page__stat-value numeric">{s.v}</span>
              </div>
            ))}
          </div>

          <div className="verifier-page__grid">
            <section aria-labelledby="verifier-queue">
              <h2 id="verifier-queue" className="verifier-page__section-title">
                Waiting for your confirmation
              </h2>
              {queue.length === 0 ? (
                <div className="verifier-page__empty">
                  <p className="typo-text">
                    <strong>All done.</strong> Nothing waiting — new claims appear here when a
                    recipient&apos;s next tranche needs you.
                  </p>
                </div>
              ) : (
                <ul className="verifier-page__queue">
                  {queue.map((item) => {
                    const isOpen = openId === item.id;
                    const status = statusById[item.id] ?? 'idle';
                    const pending = status === 'pending' && signingId === item.id;
                    return (
                      <li key={item.id}>
                        <article
                          className={`verifier-card${isOpen ? ' verifier-card--open' : ''}`}
                          aria-label={`${item.condition}, ${item.programme}`}
                        >
                          <div className="verifier-card__top">
                            <span className="verifier-card__titles">
                              <span className="verifier-card__condition">{item.condition}</span>
                              <span className="verifier-card__meta">
                                {item.programme} · Tranche {item.tranche} of {item.tranches}
                              </span>
                            </span>
                            <span className="verifier-card__subject numeric" title={item.subject}>
                              {truncateAddress(item.subject, 6, 4)}
                            </span>
                          </div>

                          {!isOpen ? (
                            <div className="verifier-card__actions">
                              <Button size="sm" onClick={() => openClaim(item)}>
                                Review claim
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => declineClaim(item)}>
                                Can&apos;t confirm
                              </Button>
                            </div>
                          ) : (
                            <div className="verifier-card__review">
                              <dl className="verifier-card__facts">
                                <div>
                                  <dt>Schema</dt>
                                  <dd className="numeric">{item.schema}</dd>
                                </div>
                                <div>
                                  <dt>Recipient</dt>
                                  <dd className="numeric" title={item.subject}>
                                    {item.subject}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Requested at ledger</dt>
                                  <dd className="numeric">
                                    {item.requestedLedger.toLocaleString()}
                                  </dd>
                                </div>
                              </dl>

                              <Field
                                label="Reference (optional)"
                                placeholder="e.g. register page, invoice number"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                              />

                              <label className="verifier-card__gate">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => setChecked(event.target.checked)}
                                />
                                <span className="verifier-card__box" aria-hidden="true">
                                  {checked ? '✓' : ''}
                                </span>
                                <span>
                                  I checked this myself and the condition is met. Signing releases
                                  money and can&apos;t be undone.
                                </span>
                              </label>

                              {status === 'error' && signError && openItem?.id === item.id && (
                                <ErrorPanel explained={signError} live />
                              )}
                              {pending && (
                                <PendingState title="Signing…" note="Check your wallet to approve." />
                              )}

                              <div className="verifier-card__actions">
                                <Button variant="secondary" size="sm" onClick={closeClaim}>
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={!checked || pending}
                                  loading={pending}
                                  loadingLabel="Signing…"
                                  onClick={() => signClaim(item)}
                                >
                                  Confirm and sign
                                </Button>
                              </div>
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="verifier-page__sample-note">
                <Badge tone="neutral">Sample data</Badge> Sample queue for the design phase.
              </p>
            </section>

            <section aria-labelledby="verifier-signed">
              <h2 id="verifier-signed" className="verifier-page__section-title">
                Signed by you
              </h2>
              {mine.length === 0 ? (
                <div className="verifier-page__empty">
                  <p className="typo-text text-muted">
                    No attestations yet. Claims you confirm appear here.
                  </p>
                </div>
              ) : (
                <ul className="verifier-page__signed">
                  {mine.map((m) => (
                    <li key={m.uid} className="verifier-signed">
                      <div className="verifier-signed__row">
                        <span className="verifier-signed__uid numeric" title={m.uid}>
                          {truncateAddress(m.uid, 8, 6)}
                        </span>
                        <Badge tone={m.used ? 'accent' : 'neutral'}>
                          {m.used ? 'Used to release a tranche' : 'Not used yet'}
                        </Badge>
                      </div>
                      <span className="verifier-signed__meta">
                        {m.programme} · {truncateAddress(m.subject, 6, 4)} · {m.schema} · ledger{' '}
                        {m.ledger.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="verifier-page__sample-note">
                <Badge tone="neutral">Sample data</Badge> Sample queue and attestations for the
                design phase.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
