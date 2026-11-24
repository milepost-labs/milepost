import { useRef, useState, type KeyboardEvent } from 'react';
import { Briefcase, Check, CircleHelp, Lock, User, Wallet, type LucideIcon } from 'lucide-react';
import { modeInfo } from '../../lib/modes';
import { LANDING_MODES, type FlowIcon } from '../../pages/homeContent';

const ICONS: Record<FlowIcon, LucideIcon> = {
  programme: Briefcase,
  escrow: Lock,
  payee: Check,
  recipient: User,
  wallet: Wallet,
  unknown: CircleHelp,
};

const METER = [1, 2, 3, 4];

/**
 * The four payment modes, ranked by how much the contract itself guarantees
 * and never shown as equals: a strength meter, a plain trade-off, and the
 * path the money takes. Where nothing checks the last hop, the path says so.
 *
 * A tab set in the APG pattern: arrows move and wrap, Home and End jump to the
 * ends, and activation follows focus.
 */
export function PaymentModes() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const mode = LANDING_MODES[selected];
  const info = modeInfo(mode.name);
  const strength = info?.strength ?? 0;

  const select = (index: number) => {
    setSelected(index);
    tabs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const count = LANDING_MODES.length;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    select(next);
  };

  return (
    <section className="lp-section lp-modes" id="modes" aria-labelledby="lp-modes-title">
      <div className="lp-wrap">
        <div className="lp-modes__head">
          <div>
            <p className="lp-eyebrow" data-reveal>
              Four payment modes
            </p>
            <h2 id="lp-modes-title" className="lp-h2" data-reveal="1">
              Who chooses where the money goes, and how sure you can be.
            </h2>
          </div>
          <p className="lp-lead" data-reveal="2">
            The mode is chosen per award, at finalize time. They're not equal, so we rank them by how much the
            contract itself guarantees.
          </p>
        </div>

        <div className="lp-mode-tabs" role="tablist" aria-label="Payment modes, strongest guarantee first">
          {LANDING_MODES.map((item, i) => {
            const filled = modeInfo(item.name)?.strength ?? 0;
            return (
              <button
                key={item.name}
                type="button"
                role="tab"
                id={`lp-mode-tab-${item.name}`}
                className="lp-mode-tab"
                aria-selected={i === selected}
                aria-controls="lp-mode-panel"
                tabIndex={i === selected ? 0 : -1}
                ref={(node) => {
                  tabs.current[i] = node;
                }}
                onClick={() => select(i)}
                onKeyDown={(event) => onKeyDown(event, i)}
              >
                <span className="lp-mode-tab__meter" aria-hidden="true">
                  {METER.map((n) => (
                    <i key={n} className={n <= filled ? 'is-filled' : undefined} />
                  ))}
                </span>
                {item.name}
              </button>
            );
          })}
        </div>

        <div
          className="lp-mode-panel"
          role="tabpanel"
          id="lp-mode-panel"
          aria-labelledby={`lp-mode-tab-${mode.name}`}
          tabIndex={0}
        >
          <div>
            <p className="lp-mode-rank">
              {selected + 1} of {LANDING_MODES.length} · {info?.rank}
            </p>
            <h3 className="lp-mode-name">{mode.name}</h3>
            <div className="lp-strength">
              <span className="lp-strength__bars" aria-hidden="true">
                {METER.map((n) => (
                  <i key={n} className={n <= strength ? 'is-filled' : undefined} />
                ))}
              </span>
              <span>
                <span className="visually-hidden">
                  Guarantee strength {strength} of 4.{' '}
                </span>
                {mode.label}
              </span>
            </div>
            <dl className="lp-mode-facts">
              <div>
                <dt>Where it goes</dt>
                <dd>{mode.where}</dd>
              </div>
              <div>
                <dt>Who picks the payee</dt>
                <dd>{mode.who}</dd>
              </div>
            </dl>
            <p className={`lp-tradeoff${mode.sound ? ' lp-tradeoff--sound' : ''}`}>{mode.tradeoff}</p>
          </div>

          {/* Keyed by mode so the path redraws, node by node, on each change. */}
          <ol className="lp-flow" key={mode.name} aria-label={`Money path for ${mode.name}`}>
            {mode.flow.map((node, k) => {
              const Icon = ICONS[node.icon];
              const unchecked = Boolean(mode.unchecked) && k === mode.flow.length - 1;
              return (
                <li key={node.title} className="lp-flow__item" style={{ animationDelay: `${k * 0.18}s` }}>
                  {k > 0 && (
                    <div className={`lp-flow__conn${unchecked ? ' lp-flow__conn--unchecked' : ''}`}>
                      <i aria-hidden="true" />
                      {unchecked && <span className="lp-flow__note numeric">no check here</span>}
                    </div>
                  )}
                  <div className={`lp-flow__node${node.kind ? ` lp-flow__node--${node.kind}` : ''}`}>
                    <span className="lp-flow__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span>
                      {node.title}
                      <small>{node.note}</small>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
