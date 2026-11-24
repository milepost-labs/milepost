import { useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../../context/useAnnouncer';
import { HOW_STEPS, boardSquares } from '../../pages/homeContent';

/**
 * How it works: the seven steps of the money path beside a 40-square budget
 * board that changes with the step in view. The most important section on the
 * page, because it shows that money moves at only three of the steps.
 *
 * The step follows the scroll, and each step's title is a button, so the same
 * walk works from the keyboard. A scroll never speaks; choosing a step does,
 * once, through the shared announcer, with what happened to the money.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const announce = useAnnouncer();

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return;
    // A thin band across the middle of the screen: the step crossing it is the
    // one being read.
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    list.querySelectorAll('[data-step]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const step = HOW_STEPS[active];
  const squares = boardSquares(step.board);

  const choose = (index: number) => {
    if (index === active) return;
    setActive(index);
    const chosen = HOW_STEPS[index];
    announce(`${chosen.title}. ${chosen.board.lead} ${chosen.board.caption}`);
  };

  return (
    <section className="lp-section lp-how" id="how" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow" data-reveal>
          How it works
        </p>
        <h2 id="lp-how-title" className="lp-h2 lp-h2--narrow" data-reveal="1">
          Seven steps. Money moves at three of them.
        </h2>
        <div className="lp-how__grid">
          <ol className="lp-steps" ref={listRef}>
            {HOW_STEPS.map((item, i) => (
              <li
                key={item.title}
                data-step={i}
                className={`lp-step${i === active ? ' is-active' : ''}${i === HOW_STEPS.length - 1 ? ' lp-step--after' : ''}`}
                aria-current={i === active ? 'step' : undefined}
                onClick={() => choose(i)}
              >
                <h3 className="lp-step__title">
                  <button type="button" className="lp-step__button" aria-pressed={i === active}>
                    {item.title}
                  </button>
                  {item.money && <span className="lp-tag lp-tag--money">{item.money}</span>}
                </h3>
                <p>{item.body}</p>
                {item.example && <p className="lp-step__example numeric">{item.example}</p>}
                {item.votes && (
                  <ul className="lp-votes" aria-label="Example votes from a quorum of five; the award is the middle one">
                    {item.votes.map((vote, k) => (
                      <li key={k} className={vote.median ? 'is-median' : undefined}>
                        {vote.amount}
                        {vote.median && <span className="visually-hidden"> (the award)</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          <div className="lp-board-wrap">
            <div className="lp-board">
              <div className="lp-board__top">
                <span className="lp-board__k">Programme budget</span>
                <span className="lp-board__v numeric">{step.board.figure}</span>
              </div>
              <div className="lp-board__grid" aria-hidden="true">
                {squares.map((state, i) => (
                  <i
                    key={i}
                    className={`lp-sq${step.board.asked && i < step.board.asked ? ' is-asked' : ''}`}
                    data-s={state}
                    style={{ transitionDelay: `${i * 12}ms` }}
                  />
                ))}
              </div>
              <p className="lp-board__caption">
                <b>{step.board.lead}</b> {step.board.caption}
              </p>
              <div className="lp-legend lp-board__legend" aria-hidden="true">
                <span>
                  <i className="lp-sq" data-s="unawarded" />
                  Unawarded
                </span>
                <span>
                  <i className="lp-sq" data-s="locked" />
                  Awarded, locked
                </span>
                <span>
                  <i className="lp-sq" data-s="released" />
                  Released
                </span>
                <span>
                  <i className="lp-sq" data-s="refundable" />
                  Refundable
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
