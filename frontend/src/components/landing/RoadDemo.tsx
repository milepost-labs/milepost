import { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { useAnnouncer } from '../../context/useAnnouncer';
import { FIXTURE_HERO_AWARD } from './heroFixtures';
import { prefersReducedMotion, useInView } from './motion';

const SQUARES_PER_TRANCHE = 10;
const fmt = (n: number) => n.toLocaleString('en-US');

/** Counts up to `target` over about a second; jumps straight there for reduced motion. */
function useCountTo(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const settle = (value: number) => {
      shownRef.current = value;
      setShown(value);
    };
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      const id = setTimeout(() => settle(target), 0);
      return () => clearTimeout(id);
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - started) / 900);
      settle(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

/**
 * The hero's road: one award, three tranches, three mileposts.
 *
 * Each press of the button plays the verifier and releases exactly one
 * tranche, which is the whole product in one gesture. It plays itself while
 * on screen until someone touches it, and never for a reader who asked for
 * less motion. It runs on {@link FIXTURE_HERO_AWARD} and is labelled an
 * example throughout; nothing here is a chain read.
 *
 * The status sentence is plain text. Only a press of the button is announced,
 * through the shared announcer, so the self-playing loop never talks over a
 * screen reader.
 */
export function RoadDemo() {
  const award = FIXTURE_HERO_AWARD;
  const total = award.tranches.length;
  const sum = award.tranches.reduce((a, b) => a + b, 0);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  const roadRef = useRef<HTMLDivElement>(null);
  const inView = useInView(roadRef, 0.4);
  const announce = useAnnouncer();

  const paid = award.tranches.slice(0, step).reduce((a, b) => a + b, 0);
  const shownPaid = useCountTo(paid);
  const done = step >= total;

  useEffect(() => {
    if (!auto || !inView) return;
    const delay = done ? 2600 : step === 0 ? 1800 : 2400;
    const id = setTimeout(() => setStep(done ? 0 : step + 1), delay);
    return () => clearTimeout(id);
  }, [auto, inView, step, done]);

  const statusFor = (n: number) =>
    n === 0
      ? `${fmt(sum)} ${award.asset} is awarded and locked. Nothing moves until the ${award.verifierRole} confirms enrolment.`
      : n < total
        ? `${award.unit} ${n} confirmed by the ${award.verifierRole}. ${fmt(award.tranches[n - 1])} ${award.asset} released to ${award.payee}. ${fmt(sum - award.tranches.slice(0, n).reduce((a, b) => a + b, 0))} ${award.asset} stays locked.`
        : `${award.unit} ${total} confirmed. All ${fmt(sum)} ${award.asset} released, each tranche backed by its own signed proof.`;

  const confirm = () => {
    if (done) return;
    setAuto(false);
    setStep(step + 1);
    announce(statusFor(step + 1));
  };

  const reset = () => {
    setAuto(false);
    setStep(0);
    announce(statusFor(0));
  };

  return (
    <div className="lp-demo" data-reveal="1" role="group" aria-labelledby="lp-demo-title">
      <div className="lp-demo__head">
        <p className="lp-eyebrow" id="lp-demo-title">
          Try it · one award, {total === 3 ? 'three' : total} tranches
        </p>
        <p className="lp-demo__meta">
          Example: <strong>{award.recipient}</strong> · {award.purpose} · award{' '}
          <strong className="numeric">
            {fmt(sum)} {award.asset}
          </strong>{' '}
          · verifier: {award.verifier} · paid to {award.payee}, for tuition
        </p>
      </div>

      <div className="lp-road" ref={roadRef}>
        <div className="lp-road__track">
          <div className="lp-road__lane" aria-hidden="true" />
          <div
            className="lp-road__lane-fill"
            aria-hidden="true"
            style={{ width: `calc((100% - var(--lp-payee-width)) * ${step / total})` }}
          />
          {award.tranches.map((amount, i) => {
            const on = i < step;
            const current = i === step - 1;
            return (
              <div className="lp-stage" key={i}>
                <div className={`lp-post${on ? ' is-on' : ''}${current ? ' is-current' : ''}`}>
                  <div className="lp-post__stamp" aria-hidden="true">
                    <b>
                      <Check />
                      Attested · enrolled
                    </b>
                    <span className="numeric">signed {award.verifierAddress}</span>
                  </div>
                  <div className="lp-post__sign">
                    <small>{award.unit.toUpperCase()}</small>
                    <b>{String(i + 1).padStart(2, '0')}</b>
                  </div>
                  <div className="lp-post__pole" />
                </div>
                <div className="lp-tranche" aria-hidden="true">
                  {Array.from({ length: SQUARES_PER_TRANCHE }, (_, k) => (
                    <i
                      key={k}
                      className="lp-sq"
                      data-s={on ? 'released' : 'locked'}
                      style={{ transitionDelay: on ? `${350 + k * 55}ms` : '0ms' }}
                    />
                  ))}
                </div>
                <p className="lp-stage__label">
                  <span className="numeric">
                    {fmt(amount)} {award.asset}
                  </span>
                  <br />
                  {award.condition} {i + 1}
                  <span className="visually-hidden">{on ? ', released' : ', locked'}</span>
                </p>
              </div>
            );
          })}
          <div className="lp-payee">
            <span className="lp-payee__k">Paid to {award.payee}</span>
            <span className="lp-payee__who">{award.payeeFor}</span>
            <span className="lp-payee__amt numeric">{fmt(shownPaid)}</span>
            <span className="lp-payee__of numeric">
              of {fmt(sum)} {award.asset}
            </span>
          </div>
        </div>
      </div>

      <div className="lp-demo__controls">
        <button type="button" className="btn-primary" onClick={confirm} disabled={done}>
          <ShieldCheck aria-hidden="true" />
          {done ? 'All three tranches released' : `Confirm ${award.unit.toLowerCase()} ${step + 1} as the ${award.verifierRole}`}
        </button>
        <button type="button" className="btn-secondary" onClick={reset}>
          Start over
        </button>
        <p className="lp-demo__status">{statusFor(step)}</p>
      </div>
      <div className="lp-legend" aria-hidden="true">
        <span>
          <i className="lp-sq" data-s="locked" />
          Awarded, locked
        </span>
        <span>
          <i className="lp-sq" data-s="released" />
          Released
        </span>
      </div>
    </div>
  );
}
