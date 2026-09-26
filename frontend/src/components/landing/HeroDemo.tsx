import { useState } from 'react';
import { FIXTURE_HERO_AWARD } from './heroFixtures';
import './HeroDemo.css';

function formatAmount(value: number): string {
  return `${value.toLocaleString()} USDC`;
}

/**
 * Interactive tranche demo for the landing hero.
 *
 * One award, three tranches: each press of the button plays the verifier and
 * releases the next tranche, with a live message after each release. The
 * card is marked as an example throughout and never implies a real
 * transaction — it runs on {@link FIXTURE_HERO_AWARD}, not a chain read.
 *
 * Operable by keyboard (a native button) with each release announced through
 * an `aria-live` region.
 */
export function HeroDemo() {
  const [released, setReleased] = useState(0);
  const tranches = FIXTURE_HERO_AWARD.tranches;
  const total = tranches.length;
  const done = released >= total;

  const message =
    released === 0
      ? 'Nothing moves until the verifier confirms the condition. Press the button to play the verifier.'
      : !done
        ? `Tranche ${released} released. That proof is now spent — it can't unlock a second tranche.`
        : "All three tranches released, each by its own proof. The recipient's standing now records it.";

  return (
    <div className="hero-demo">
      <div className="hero-demo__header">
        <span className="hero-demo__title">Try it: one award, three tranches</span>
        <span className="hero-demo__tag">Example</span>
      </div>
      <div className="hero-demo__tranches">
        {tranches.map((amount, index) => {
          const state = index < released ? 'released' : index === released && !done ? 'next' : 'locked';
          const stateLabel =
            state === 'released' ? 'Released' : state === 'next' ? 'Next: needs proof' : 'Locked';
          return (
            <div key={index} className={`hero-demo__tranche hero-demo__tranche--${state}`}>
              <span className="hero-demo__tranche-index">Tranche {index + 1}</span>
              <span className="hero-demo__tranche-amount numeric">{formatAmount(amount)}</span>
              <span className="hero-demo__tranche-state">{stateLabel}</span>
            </div>
          );
        })}
      </div>
      <dl className="hero-demo__facts">
        <div className="hero-demo__fact">
          <dt>Condition</dt>
          <dd>{FIXTURE_HERO_AWARD.condition}</dd>
        </div>
        <div className="hero-demo__fact">
          <dt>Verifier</dt>
          <dd>{FIXTURE_HERO_AWARD.verifier}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="hero-demo__action"
        onClick={() => setReleased(done ? 0 : released + 1)}
      >
        {done ? 'Start over' : `Verifier confirms · release tranche ${released + 1}`}
      </button>
      <p className="hero-demo__message" aria-live="polite">
        {message}
      </p>
      <p className="hero-demo__disclaimer">Illustrative demo — no real transaction.</p>
    </div>
  );
}
