import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { Search } from 'lucide-react';
import { useStanding, useTransaction, phaseLabel } from '../hooks';
import { Empty, ErrorPanel, ErrorState, Loading } from '../components/state/AsyncStates';
import { AddressChip, Badge, Button, Card, Field, TextArea } from '../components/ui';
import { SignInSheet } from '../components/layout/SignInSheet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { KEEPALIVE_DAYS, isTtlLow, standingStats, type StandingView } from '../lib/standing';
import { describeAmount } from '../lib/amount';
import { looksLikeAddress } from '../lib/format';
import { isFailure } from '../lib/errors';
import {
  parseStandingHistory,
  verifyStandingHistory,
  type HistoryVerdict,
} from '../lib/standingHistory';
import './Standing.css';

/**
 * Shape of the claimant's history. `root` is the history root the `Credited`
 * event published after that release; it is what makes the first divergent
 * entry identifiable.
 */
const PLACEHOLDER_HISTORY = JSON.stringify(
  [
    {
      programme: 'CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL',
      amount: '10000000',
      attestation: '76f8441cc4224ab7f6956fbce0502020c9583bc62611626ba833e37e8d3e18cd',
      timestamp: '1700000000',
      root: '5f8d2c5d5f1b68c1a4e1b2e3d4c5f60718293a4b5c6d7e8f9012345678abcdef',
    },
  ],
  null,
  2,
);

/**
 * Fold a pasted history through `record.next_root` and compare it with the
 * subject's root. Simulation only: nothing is signed and no state changes.
 */
function HistoryVerifier({ onChainRoot }: { onChainRoot: Buffer }) {
  const { record } = useSoroban();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<HistoryVerdict | null>(null);

  const handleVerify = async () => {
    setError(null);
    setVerdict(null);

    const parsed = parseStandingHistory(input);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setVerifying(true);
    try {
      const result = await verifyStandingHistory(parsed.entries, onChainRoot, async (step) => {
        const { result: next } = await record.next_root(step);
        return next;
      });
      setVerdict(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not complete verification: ${caught.message}`
          : 'Could not complete verification. Try again.',
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="standing-history">
      <p className="standing-history__intro">
        Paste the history a recipient shared, as a JSON array. Each entry is one release:
        programme, amount in stroops, the attestation hash, the unix timestamp, and the
        history root recorded after it. The chain is folded through the contract&rsquo;s own{' '}
        <code>next_root</code>, so the hash logic is identical to what was stored.
      </p>

      <TextArea
        label="Credit history (JSON array)"
        hint="Start from the sample shape and replace it with the shared history."
        placeholder={PLACEHOLDER_HISTORY}
        rows={8}
        value={input}
        error={error}
        onChange={(event) => {
          setInput(event.target.value);
          setError(null);
          setVerdict(null);
        }}
      />

      <div className="standing-history__actions">
        <Button
          onClick={() => void handleVerify()}
          loading={verifying}
          loadingLabel="Folding chain…"
          disabled={!input.trim() || verifying}
        >
          Verify history chain
        </Button>
      </div>

      {verdict && (
        <div className="standing-history__result" role="status" aria-live="polite">
          {verdict.kind === 'match' && (
            <>
              <Badge tone="success">History verified</Badge>
              <p>
                Folding these credits from the zero root reproduces the on-chain root
                exactly. The claimed history matches what was recorded.
              </p>
            </>
          )}

          {verdict.kind === 'genesis' && (
            <>
              <Badge tone="success">Genesis confirmed</Badge>
              <p>
                There are no claimed credits and the on-chain root is all zeroes, so this
                address has not received a tranche yet.
              </p>
            </>
          )}

          {verdict.kind === 'mismatch' && (
            <>
              <Badge tone="danger">Mismatch</Badge>
              <p>
                <strong>
                  Entry {verdict.firstBadIndex + 1} is where the history first diverges.
                </strong>{' '}
                {verdict.message}
              </p>
              <dl className="standing-history__roots">
                <div>
                  <dt>Computed from the claimed history</dt>
                  <dd className="numeric">{verdict.computedRoot}</dd>
                </div>
                {verdict.claimedRoot && (
                  <div>
                    <dt>Root claimed by this entry</dt>
                    <dd className="numeric">{verdict.claimedRoot}</dd>
                  </div>
                )}
                <div>
                  <dt>On-chain root</dt>
                  <dd className="numeric">{verdict.onChainRoot}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The four recipient routes, in the order the design's section pills use. */
const RECIPIENT_SECTIONS: { label: string; to: string }[] = [
  { label: 'My awards', to: '/recipients/award-progress' },
  { label: 'Apply', to: '/recipients?apply=1' },
  { label: 'Applications', to: '/recipients/application-timeline' },
  { label: 'Standing', to: '/recipients/standing' },
];

/** The recipient section's four routes, with Standing marked current. */
function RecipientSectionNav() {
  return (
    <nav aria-label="Recipient sections" className="standing-nav">
      {RECIPIENT_SECTIONS.map((section) => {
        const current = section.to === '/recipients/standing';
        return (
          <Link
            key={section.to}
            to={section.to}
            className={`standing-nav__pill${current ? ' standing-nav__pill--on' : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Signed-out explanation for the recipient area.
 *
 * Browsing never needs sign-in, so this must explain what connecting will show
 * rather than render empty shells. Takes `onSignIn` rather than reaching for
 * the sheet itself, so it can be rendered and tested on its own.
 */
export function RecipientSignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="standing-signout">
      <div className="standing-signout__copy">
        <h2>Sign in to see your standing</h2>
        <p>
          Use a browser wallet to read your own standing, awards, and application progress.
          Looking up another address never needs sign-in.
        </p>
        <div className="standing-signout__actions">
          <Button onClick={onSignIn}>Sign in</Button>
          <Link to="/directory" className="standing-signout__browse">
            Find a programme
          </Link>
        </div>
      </div>
      <ul className="standing-signout__list">
        <li>
          <span>Each award and its tranches</span>
          <span>What&rsquo;s released, what&rsquo;s waiting on a verifier</span>
        </li>
        <li>
          <span>Where your applications are</span>
          <span>Review votes and how the award is set</span>
        </li>
        <li>
          <span>Your standing</span>
          <span>A record the next funder can rely on</span>
        </li>
      </ul>
    </div>
  );
}

/** The three aggregate figures. Pure, so it renders without a wallet. */
export function StandingStats({ standing }: { standing: StandingView }) {
  return (
    <div className="standing-stats">
      {standingStats(standing).map((stat) => (
        <div key={stat.label} className="standing-stat">
          <span
            className="standing-stat__figure numeric"
            aria-label={stat.label === 'Total received' ? describeAmount(standing.totalReceived, 'XLM') : undefined}
          >
            {stat.value}
          </span>
          <span className="standing-stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The TTL row: how long this standing stays readable, and a permissionless way
 * to extend it. Anyone may extend anyone's entry, so this needs no ownership —
 * only a connected wallet to pay the fee.
 *
 * The remaining life is a TTL read the frontend does not surface yet, so when
 * it is unknown the row offers the extension without promising a number.
 */
function StandingTtlRow({ standing, subject }: { standing: StandingView; subject: string }) {
  const { record } = useSoroban();
  const { address } = useWallet();
  const announce = useAnnouncer();
  const [extended, setExtended] = useState(false);

  const tx = useTransaction<void>({
    contract: 'record',
    onSuccess: () => {
      setExtended(true);
      announce(`Standing extended for about ${KEEPALIVE_DAYS} days.`);
    },
  });

  const known = standing.liveForDays !== undefined;
  const low = known && isTtlLow(standing.liveForDays!, extended);
  const days = extended ? KEEPALIVE_DAYS : standing.liveForDays;

  const handleExtend = () => {
    void tx.send(async () => {
      const built = await record.keepalive({ subject });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
  };

  return (
    <div className={`standing-ttl${low ? ' standing-ttl--low' : ''}`}>
      <span className="standing-ttl__copy">
        <span className="standing-ttl__title">
          {known
            ? `Stays on the network for about ${days} more days`
            : 'Kept alive by anyone who extends it'}
        </span>
        <span className="standing-ttl__sub">
          Records are archived if nobody extends them. Anyone can extend one; it costs you
          nothing.
        </span>
      </span>
      <Button
        className="standing-ttl__button"
        onClick={handleExtend}
        loading={tx.busy}
        loadingLabel={phaseLabel(tx.phase) || 'Extending…'}
        disabled={extended || !address}
      >
        {extended ? 'Extended' : 'Extend now'}
      </Button>
      {tx.error && (
        <div className="standing-ttl__error">
          <ErrorPanel
            explained={tx.error}
            onRetry={isFailure(tx.error) ? handleExtend : undefined}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The standing of one subject, read from the `record` contract.
 *
 * `record.get` returns the aggregates; an address with no history answers
 * `NotFound`, which is a first-time applicant's ordinary state rather than a
 * failure, so it gets the empty state. Any other failure is shown as one.
 */
export function StandingPanel({ subject }: { subject: string }) {
  const standing = useStanding(subject);

  if (standing.loading) {
    return <Loading label="Reading standing" rows={2} />;
  }

  if (standing.error) {
    return <ErrorState error={standing.error} contract="record" onRetry={standing.refetch} />;
  }

  if (!standing.standing) {
    return (
      <Empty
        title="No standing yet."
        description="Standing is written the first time a programme releases a tranche to this address. It is the record the next funder can rely on, and it appears here as soon as it exists."
      />
    );
  }

  return (
    <div className="standing-panel">
      <p className="standing-panel__intro">
        Standing is a record of what someone has received and delivered across every programme.
        It can&rsquo;t be transferred, and it holds totals only, not a list of who funded them. It
        lives in its own contract that any programme can read, so the next funder can underwrite
        against it — even one this protocol has never seen.
      </p>

      <StandingStats standing={standing.standing} />

      <StandingTtlRow standing={standing.standing} subject={subject} />

      {standing.historyRoot && (
        <Card title="Verify a shared history">
          <p className="standing-panel__intro">
            Standing stores a rolling hash root, not the history itself. A next funder can
            fold the history a recipient shares through the contract and check it against the
            root below — no trust in the recipient or an indexer required.
          </p>
          <p className="standing-root">
            <span className="standing-root__label">On-chain history root</span>
            <code className="numeric standing-root__value">
              {standing.historyRoot.toString('hex')}
            </code>
          </p>
          <HistoryVerifier onChainRoot={standing.historyRoot} />
        </Card>
      )}
    </div>
  );
}

/**
 * `/recipients/standing` — a recipient's standing: aggregates only, never a
 * transaction log.
 *
 * Signed out, the design shows an explainer rather than empty shells. Signed
 * in, it reads the signed-in address's standing from the chain and offers a
 * lookup so any address's record can be read before it is underwritten.
 */
export const Standing = () => {
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  const subject = lookedUp ?? address;
  const candidate = lookupInput.trim();
  const canLookup = looksLikeAddress(candidate) && candidate !== subject;

  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canLookup) return;
    setLookedUp(candidate);
    setLookupInput('');
  };

  return (
    <div className="standing-page">
      <header className="standing-head">
        <h1>Your funding</h1>
        <p className="standing-head__lede">
          Apply for what you need, see what&rsquo;s been released, and carry your record to the
          next programme.
        </p>
      </header>

      {address ? (
        <div className="standing-section">
          <RecipientSectionNav />
        </div>
      ) : (
        <RecipientSignedOut onSignIn={() => setSignInOpen(true)} />
      )}

      <div className="standing-section">
        {subject && (
          <>
            <div className="standing-viewer">
              <span className="standing-viewer__who">
                <span className="standing-viewer__label">{lookedUp ? 'Viewing' : 'Your standing'}</span>
                {lookedUp && <AddressChip address={lookedUp} />}
              </span>
              {lookedUp && (
                <Button
                  variant="secondary"
                  onClick={() => setLookedUp(null)}
                >
                  {address ? 'Show my standing' : 'Clear lookup'}
                </Button>
              )}
            </div>

            {/* Keyed by subject so switching addresses starts a fresh read
                rather than showing the previous one's figures. */}
            <StandingPanel key={subject} subject={subject} />
          </>
        )}

        <form className="standing-lookup" onSubmit={submitLookup}>
          <div className="standing-lookup__copy">
            <h2 className="standing-lookup__title">Look up a recipient</h2>
            <p className="standing-lookup__desc">
              Standing is portable, so the next funder can read any address&rsquo;s record before
              underwriting it. Paste an address to see what the chain holds.
            </p>
          </div>
          <div className="standing-lookup__row">
            <div className="standing-lookup__field">
              <Field
                label="Recipient address"
                value={lookupInput}
                onChange={(event) => setLookupInput(event.target.value)}
                placeholder="G…"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              icon={<Search size={18} aria-hidden="true" />}
              disabled={!canLookup}
            >
              Look up
            </Button>
          </div>
        </form>
      </div>

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
};
