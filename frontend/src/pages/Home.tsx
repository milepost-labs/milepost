import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, CircleAlert } from 'lucide-react';
import { CopyButton } from '../components/ui/CopyButton';
import { LogoMark } from '../components/layout/LogoMark';
import { RoadDemo } from '../components/landing/RoadDemo';
import { HowItWorks } from '../components/landing/HowItWorks';
import { PaymentModes } from '../components/landing/PaymentModes';
import { Sectors } from '../components/landing/Sectors';
import { LiveIndex } from '../components/landing/LiveIndex';
import { useReveal } from '../components/landing/motion';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  CONTRACTS,
  DOC_LINKS,
  FOOTER_GROUPS,
  GUARANTEES,
  INSTALL_COMMAND,
  LIMITS,
  PEOPLE,
  PROBLEM_EYEBROW,
  PROBLEM_FOOT,
  PROBLEM_HEADING,
  PROBLEM_QUESTIONS,
  ROLE_ENTRIES,
  STELLAR_POINTS,
  type Claim,
} from './homeContent';
import '../components/landing/Landing.css';

/** The commit the app was built from, shortened; the full id is on /about. */
const BUILD = (import.meta.env.VITE_APP_VERSION || 'dev') as string;
const APP_BUILD_VERSION = /^[0-9a-f]{40}$/.test(BUILD) ? BUILD.slice(0, 7) : BUILD;

const HEADLINE = ['Money', 'moves', 'at', 'each', 'milepost.'];
const HEADLINE_TURN = ['And', 'only', 'there.'];

/**
 * Guarantees and limits render through this one component so neither column
 * can drift into being quieter than the other: only the mark and its colour
 * differ.
 */
function ClaimList({ tone, heading, claims }: { tone: 'guaranteed' | 'limit'; heading: string; claims: Claim[] }) {
  const Icon = tone === 'guaranteed' ? Check : CircleAlert;
  return (
    <div className={`lp-claims lp-claims--${tone}`} data-reveal={tone === 'limit' ? '1' : ''}>
      <h3>
        <span className="lp-claims__dot" aria-hidden="true" />
        {heading}
      </h3>
      <ul>
        {claims.map((claim) => (
          <li key={claim.title}>
            <Icon aria-hidden="true" />
            <div>
              <b>{claim.title}</b>
              <span>{claim.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The landing page. It has to explain the protocol well enough that a funder,
 * a recipient, a verifier or a developer knows what this is and where to go,
 * and every way in works without a wallet: "Launch app" goes to the
 * directory, which reads the public index.
 *
 * Sections, in order: hero with the road demo, "What brings you here?", the
 * problem, how it works, payment modes, sectors, the people, why Stellar,
 * guarantees and limits, live on testnet, for developers, a closing call to
 * action, and the footer. The look follows `docs/design/prototypes/landing.html`;
 * the copy follows the contracts where the two differ.
 */
export const Home = () => {
  usePageTitle('Conditional grants on Stellar');
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  return (
    <div className="lp" ref={rootRef}>
      {/* Hero */}
      <div className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-hero__grid">
            <div>
              <p className="lp-eyebrow lp-hero__eyebrow">Conditional grants on Stellar</p>
              <h1 className="lp-hero__title" aria-label="Money moves at each milepost. And only there.">
                <span aria-hidden="true">
                  {HEADLINE.map((word, i) => (
                    <span key={word}>
                      <span className="lp-word" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                        {word}
                      </span>{' '}
                    </span>
                  ))}
                  <span className="lp-hero__turn">
                    {HEADLINE_TURN.map((word, i) => (
                      <span key={word}>
                        <span className="lp-word" style={{ animationDelay: `${0.5 + i * 0.07}s` }}>
                          {word}
                        </span>{' '}
                      </span>
                    ))}
                  </span>
                </span>
              </h1>
            </div>
            <div data-reveal="2">
              <p className="lp-lead">
                Funders pool money into a programme. Reviewers decide how much each person gets. Then it's
                paid in tranches, and each one unlocks only when a trusted verifier confirms the condition
                was met.
              </p>
              <div className="lp-cta-row">
                <Link to="/directory" className="btn-primary lp-btn">
                  Browse programmes
                  <ArrowRight aria-hidden="true" />
                </Link>
                <a href="#how" className="btn-secondary lp-btn">
                  See how it works
                </a>
              </div>
              <div className="lp-fineprint">
                <span>
                  <Check aria-hidden="true" />
                  No wallet needed to browse
                </span>
                <span>
                  <Check aria-hidden="true" />
                  Every release on the public record
                </span>
              </div>
            </div>
          </div>
          <RoadDemo />
        </div>
      </div>

      {/* What brings you here? */}
      <section className="lp-section lp-roles" aria-labelledby="lp-roles-title">
        <div className="lp-wrap">
          <p className="lp-eyebrow" data-reveal>
            What brings you here?
          </p>
          <h2 id="lp-roles-title" className="lp-h2 lp-h2--narrow" data-reveal="1">
            Pick your road. Each one starts without a wallet.
          </h2>
          <ul className="lp-role-list">
            {ROLE_ENTRIES.map((entry, i) => {
              const inner = (
                <>
                  <span className="lp-role__idx numeric">
                    {String(i + 1).padStart(2, '0')} / {entry.key}
                  </span>
                  <span>
                    <span className="lp-role__want">{entry.want}</span>
                    <span className="lp-role__detail">{entry.detail}</span>
                  </span>
                  <span className="lp-role__squares" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="lp-role__go" aria-hidden="true">
                    <ArrowRight />
                  </span>
                </>
              );
              return (
                <li key={entry.key} data-reveal={String(i)}>
                  {entry.path.startsWith('#') ? (
                    <a className="lp-role" href={entry.path}>
                      {inner}
                    </a>
                  ) : (
                    <Link className="lp-role" to={entry.path}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* The problem */}
      <section className="lp-section lp-problem lp-band-ink" aria-labelledby="lp-problem-title">
        <div className="lp-wrap">
          <p className="lp-eyebrow" data-reveal>
            {PROBLEM_EYEBROW}
          </p>
          <h2 id="lp-problem-title" className="lp-h2 lp-h2--narrow" data-reveal="1">
            {PROBLEM_HEADING.before} <span className="lp-strike">{PROBLEM_HEADING.struck}</span>{' '}
            <span className="lp-problem__after">{PROBLEM_HEADING.after}</span>
          </h2>
          <ol className="lp-questions">
            {PROBLEM_QUESTIONS.map((item, i) => (
              <li key={item.n} data-reveal={String(i)}>
                <div className="lp-question__n" aria-hidden="true">
                  {item.n}
                </div>
                <p className="lp-question__q">{item.question}</p>
                <small>{item.detail}</small>
              </li>
            ))}
          </ol>
          <p className="lp-problem__foot" data-reveal>
            {PROBLEM_FOOT}
          </p>
        </div>
      </section>

      <HowItWorks />

      <PaymentModes />

      <Sectors />

      {/* The people */}
      <section className="lp-section lp-section--flush" aria-labelledby="lp-people-title">
        <div className="lp-wrap">
          <p className="lp-eyebrow" data-reveal>
            The people
          </p>
          <h2 id="lp-people-title" className="lp-h2 lp-h2--mid" data-reveal="1">
            Two jobs that are easy to confuse, kept apart.
          </h2>
          <div className="lp-jobs">
            <div className="lp-job" data-reveal>
              <span className="lp-job__k">Reviewer</span>
              <h3>Sets the amount.</h3>
              <p>
                Votes on how much each applicant should get. The award is the median, so one generous or
                stingy vote can't swing it.
              </p>
            </div>
            <div className="lp-job lp-job--verifier" data-reveal="1">
              <span className="lp-job__k">Verifier</span>
              <h3>Unlocks the payment.</h3>
              <p>
                Signs that a condition was met. Each attestation unlocks exactly one tranche for one
                recipient, once.
              </p>
            </div>
          </div>
          <div className="lp-others">
            {PEOPLE.map((person, i) => (
              <div key={person.who} data-reveal={String(i)}>
                <h4>{person.who}</h4>
                <p>{person.does}</p>
                <span className="lp-others__wallet numeric">{person.wallet}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Stellar */}
      <section className="lp-section lp-section--flush" aria-labelledby="lp-stellar-title">
        <div className="lp-wrap">
          <p className="lp-eyebrow" data-reveal>
            Why Stellar
          </p>
          <h2 id="lp-stellar-title" className="lp-h2 lp-h2--mid" data-reveal="1">
            Built where small payments are cheap and stablecoins are native.
          </h2>
          <div className="lp-stellar">
            {STELLAR_POINTS.map((point, i) => (
              <div key={point.title} data-reveal={String(i)}>
                <span className={`lp-tag ${point.today ? 'lp-tag--now' : 'lp-tag--road'}`}>
                  {point.today ? 'Today' : 'Roadmap · not available'}
                </span>
                <h4>{point.title}</h4>
                <p>{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantees and limits */}
      <section className="lp-section lp-section--flush" id="limits" aria-labelledby="lp-limits-title">
        <div className="lp-wrap">
          <p className="lp-eyebrow" data-reveal>
            Guarantees and limits
          </p>
          <h2 id="lp-limits-title" className="lp-h2 lp-h2--narrow" data-reveal="1">
            What's promised, and what isn't.
          </h2>
          <div className="lp-claims-grid">
            <ClaimList tone="guaranteed" heading="Guaranteed by the contracts" claims={GUARANTEES} />
            <ClaimList tone="limit" heading="Limits, stated plainly" claims={LIMITS} />
          </div>
        </div>
      </section>

      <LiveIndex />

      {/* For developers */}
      <section className="lp-dev lp-band-ink" id="developers" aria-labelledby="lp-dev-title">
        <div className="lp-wrap lp-dev__grid">
          <div>
            <p className="lp-eyebrow">For developers</p>
            <h2 id="lp-dev-title" className="lp-h2">
              Open contracts. Deploy without asking.
            </h2>
            <p className="lp-lead">
              Anyone can deploy a programme. The registry admin only sets the protocol fee and treasury.
              Lists come from an open indexer you can run yourself.
            </p>
            <div className="lp-cmd">
              <code>
                <span className="lp-cmd__prompt" aria-hidden="true">
                  ${' '}
                </span>
                {INSTALL_COMMAND}
              </code>
              <CopyButton value={INSTALL_COMMAND} label="Copy install command" />
            </div>
            <div className="lp-dev__links">
              <Link to="/about" className="btn-primary lp-btn">
                Contract ids and build
              </Link>
              <Link to="/status" className="btn-secondary lp-btn">
                Index status
              </Link>
            </div>
            <nav className="lp-dev__docs" aria-label="Documentation">
              {DOC_LINKS.map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              ))}
            </nav>
          </div>
          <ol className="lp-contracts">
            {CONTRACTS.map((contract, i) => (
              <li key={contract.name}>
                <span className="lp-contracts__n numeric">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  {contract.href ? (
                    <a href={contract.href} target="_blank" rel="noreferrer noopener" className="numeric">
                      {contract.name}
                    </a>
                  ) : (
                    <b className="numeric">{contract.name}</b>
                  )}
                  <span>{contract.description}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="lp-final" aria-labelledby="lp-final-title">
        <div className="lp-wrap">
          <div className="lp-final__squares" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.25}s` }} />
            ))}
          </div>
          <h2 id="lp-final-title" className="lp-final__title" data-reveal>
            See where the money went.
          </h2>
          <p className="lp-lead" data-reveal="1">
            Every programme, every award, every release. Open to anyone, no wallet required.
          </p>
          <div className="lp-cta-row" data-reveal="2">
            <Link to="/directory" className="btn-primary lp-btn">
              Launch app
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link to="/attestations" className="btn-secondary lp-btn">
              Look up an attestation
            </Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer__grid">
            <div>
              <span className="lp-footer__brand">
                <LogoMark />
                Milepost
              </span>
              <p>Conditional grants on Stellar. Money moves at each milepost, and only at each milepost.</p>
            </div>
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <h3>{group.heading}</h3>
                {group.links.map((link) => (
                  <Link key={link.path} to={link.path}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
          <div className="lp-footer__base">
            <span>Stellar testnet · pre-audit · not for real funds</span>
            <span className="numeric">build {APP_BUILD_VERSION}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
