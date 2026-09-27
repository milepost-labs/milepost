import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ContributeFlow } from '../components/funder/ContributeFlow';
import { ContributionList } from '../components/funder/ContributionList';
import { SeededProgrammeTools } from '../components/funder/SeededProgrammeTools';
import { SignInSheet } from '../components/layout/SignInSheet';
import { useWallet } from '../context/useWallet';
import { FIXTURE_BALANCE, FIXTURE_CONTRIBUTIONS } from '../fixtures/funding';
import { useIndexedList } from '../hooks';
import { contributionCard, fundingTotals } from '../lib/funding';
import { fetchProgrammes } from '../lib/indexer';
import { formatUsdc, mergeProgrammes } from '../lib/programmeView';
import './FundingPage.css';

const SIGNED_OUT_PREVIEW = [
  { title: 'Every programme you’ve funded', note: 'How much you put in, and where it sits now' },
  { title: 'Refunds you can claim', note: 'Your share of anything that wasn’t awarded' },
  { title: 'A way to contribute', note: 'To any programme that is Open' },
];

/**
 * `/funders` — what a funder has put in, what can come back, and a way to
 * contribute. Signed out, it explains what signing in would show instead of
 * rendering empty panels.
 *
 * Contributions and the balance are stand-ins (`fixtures/funding.ts`) until
 * the per-address reads are wired; the programme list is the public index
 * merged with the sample programmes, as on the directory.
 */
export const FunderDashboard = () => {
  const { address } = useWallet();
  const [params] = useSearchParams();
  const [signInOpen, setSignInOpen] = useState(false);
  const [refunded, setRefunded] = useState<ReadonlySet<string>>(() => new Set());

  const listRead = useIndexedList(() => fetchProgrammes(), []);
  const programmes = useMemo(() => mergeProgrammes(listRead.data), [listRead.data]);

  const cards = useMemo(() => {
    const byId = new Map(programmes.map((p) => [p.id, p]));
    return FIXTURE_CONTRIBUTIONS.map((c) =>
      contributionCard(c, byId.get(c.programmeId), refunded.has(c.programmeId)),
    );
  }, [programmes, refunded]);
  const totals = fundingTotals(cards);
  const sampleIds = useMemo(() => new Set(programmes.filter((p) => p.sample).map((p) => p.id)), [programmes]);

  const markRefunded = (programmeId: string) =>
    setRefunded((current) => new Set(current).add(programmeId));

  return (
    <div className="funding">
      <header className="funding__intro">
        <h1 className="funding__title">Funding</h1>
        <p className="funding__lede">
          Put money into a programme and follow it. It only moves when a verifier confirms a condition, and
          whatever isn’t awarded comes back to you.
        </p>
      </header>

      {!address ? (
        <section className="funding-signin" aria-labelledby="funding-signin-heading">
          <div className="funding-signin__copy">
            <h2 id="funding-signin-heading" className="funding-signin__title">
              Sign in to see your funding
            </h2>
            <p className="funding-signin__text">
              Sign in with the Freighter browser extension. Browsing programmes never needs it.
            </p>
            <div className="fund-actions">
              <button type="button" className="fund-button fund-button--primary" onClick={() => setSignInOpen(true)}>
                Sign in
              </button>
              <Link to="/directory" className="fund-button">
                Browse programmes
              </Link>
            </div>
          </div>
          <ul className="funding-signin__list" aria-label="What signing in shows">
            {SIGNED_OUT_PREVIEW.map((item) => (
              <li key={item.title} className="funding-signin__item">
                <span className="funding-signin__item-title">{item.title}</span>
                <span className="funding-signin__item-note">{item.note}</span>
              </li>
            ))}
          </ul>
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
        </section>
      ) : (
        <>
          <section className="funding-stats" aria-label="Your funding">
            <div className="funding-stat">
              <span className="funding-stat__label">You’ve contributed</span>
              <span className="funding-stat__value numeric">{formatUsdc(totals.contributed)}</span>
            </div>
            <div className="funding-stat">
              <span className="funding-stat__label">Programmes</span>
              <span className="funding-stat__value numeric">{totals.programmes}</span>
            </div>
            <div className="funding-stat">
              <span className="funding-stat__label">Refundable now</span>
              <span className="funding-stat__value funding-stat__value--refund numeric">
                {formatUsdc(totals.refundableNow)}
              </span>
            </div>
          </section>

          <div className="funding-grid">
            <ContributionList cards={cards} sampleIds={sampleIds} onRefunded={markRefunded} />
            <ContributeFlow
              programmes={programmes}
              linkedProgrammeId={params.get('programme')}
              balance={BigInt(FIXTURE_BALANCE)}
            />
          </div>

          <SeededProgrammeTools />
        </>
      )}
    </div>
  );
};
