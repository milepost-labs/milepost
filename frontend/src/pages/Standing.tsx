import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransaction, phaseLabel } from '../hooks';
import { ErrorPanel } from '../components/state/AsyncStates';
import { Button } from '../components/ui';
import { SignInSheet } from '../components/layout/SignInSheet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { FIXTURE_STANDING, type StandingFixture } from '../fixtures/standing';
import { KEEPALIVE_DAYS, isTtlLow, standingStats } from '../lib/standing';
import { describeAmount } from '../lib/amount';
import { isFailure } from '../lib/errors';
import './Standing.css';

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
        <h2>Sign in to see your awards</h2>
        <p>
          Use a browser wallet to see what has been released and what is still waiting on a
          verifier. Browsing programmes never needs sign-in.
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
export function StandingStats({ standing }: { standing: StandingFixture }) {
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
 */
function StandingTtlRow({ standing, subject }: { standing: StandingFixture; subject: string }) {
  const { record } = useSoroban();
  const announce = useAnnouncer();
  const [extended, setExtended] = useState(false);

  const tx = useTransaction<void>({
    contract: 'record',
    onSuccess: () => {
      setExtended(true);
      announce(`Standing extended for about ${KEEPALIVE_DAYS} days.`);
    },
  });

  const days = extended ? KEEPALIVE_DAYS : standing.liveForDays;
  const low = isTtlLow(standing.liveForDays, extended);

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
          Stays on the network for about {days} more days
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
        disabled={extended}
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

/** The signed-in standing view: aggregates, TTL row, and where they come from. */
function StandingPanel({ standing, subject }: { standing: StandingFixture; subject: string }) {
  return (
    <div className="standing-panel">
      <p className="standing-panel__intro">
        Your standing is a record of what you&rsquo;ve received and delivered across every
        programme. It can&rsquo;t be transferred, and it holds totals only, not a list of who
        funded you. It lives in its own contract that any programme can read, so the next funder
        can underwrite against it — even one this protocol has never seen.
      </p>

      <StandingStats standing={standing} />

      <StandingTtlRow standing={standing} subject={subject} />

      <span className="standing-sample">Sample standing for the design phase.</span>
    </div>
  );
}

/**
 * `/recipients/standing` — a recipient's standing: aggregates only, never a
 * transaction log.
 *
 * Signed out, the design shows an explainer rather than empty shells. Signed
 * in, it shows totals from every programme and a TTL row that can be extended
 * by anyone.
 */
export const Standing = () => {
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);

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
          <StandingPanel standing={FIXTURE_STANDING} subject={address} />
        </div>
      ) : (
        <RecipientSignedOut onSignIn={() => setSignInOpen(true)} />
      )}

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
};
