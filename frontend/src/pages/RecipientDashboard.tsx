import { useSearchParams, Link } from 'react-router-dom';
import { useWallet } from '../context/useWallet';
import { RecipientNav } from '../components/recipient/RecipientNav';
import { RecipientAwards } from '../components/recipient/RecipientAwards';
import { ApplyForm } from '../components/recipient/ApplyForm';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { useProgrammeParam } from '../hooks';
import { usePageTitle } from '../hooks/usePageTitle';
import './RecipientDashboard.css';

export function RecipientDashboard() {
  usePageTitle('Recipient Dashboard');
  const { address, connect } = useWallet();
  const [searchParams] = useSearchParams();
  const programmeParam = useProgrammeParam();

  // If ?programme= or ?apply= is in query, render the Apply form
  const isApply = searchParams.has('programme') || searchParams.has('apply');

  return (
    <section className="recipient-page" aria-labelledby="h-recipient-funding">
      <div className="recipient-page__header">
        <h1 id="h-recipient-funding" className="recipient-page__title">
          Your funding
        </h1>
        <p className="recipient-page__desc">
          Apply for what you need, see what's been released, and carry your record to the next programme.
        </p>
      </div>

      {!address ? (
        <div className="recipient-signed-out">
          <div className="recipient-signed-out__callout">
            <h2 className="recipient-signed-out__title">Sign in to see your awards</h2>
            <p className="recipient-signed-out__text">
              Use a passkey (Face ID or fingerprint) or the Freighter extension. No seed phrase, and you won't need XLM for fees.
            </p>
            <div className="recipient-signed-out__actions">
              <button
                type="button"
                className="recipient-signed-out__btn"
                onClick={connect}
              >
                Sign in
              </button>
              <Link to="/directory" className="recipient-signed-out__link">
                Find a programme
              </Link>
            </div>
          </div>

          <ul className="recipient-signed-out__list">
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Each award and its tranches</span>
              <span className="recipient-signed-out__item-desc">What's released, what's waiting on a verifier</span>
            </li>
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Where your applications are</span>
              <span className="recipient-signed-out__item-desc">Review votes and how the award is set</span>
            </li>
            <li className="recipient-signed-out__item">
              <span className="recipient-signed-out__item-title">Your standing</span>
              <span className="recipient-signed-out__item-desc">A record the next funder can rely on</span>
            </li>
          </ul>
        </div>
      ) : (
        <>
          <RecipientNav currentSection={isApply ? 'apply' : 'awards'} />
          <ProgrammeParamNotice state={programmeParam} />
          {isApply ? (
            <ApplyForm
              preselectedProgrammeId={
                programmeParam.status === 'valid' ? (programmeParam.programmeId ?? undefined) : undefined
              }
            />
          ) : (
            <RecipientAwards />
          )}
        </>
      )}
    </section>
  );
}
