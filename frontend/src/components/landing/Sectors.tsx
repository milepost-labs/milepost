import { useEffect, useRef, useState } from 'react';
import { SECTORS } from '../../pages/homeContent';
import { prefersReducedMotion, useInView } from './motion';

/**
 * "It's not about education": one sentence that rewrites itself for each
 * sector, over the full table. It makes the point that the contracts carry no
 * subject matter by showing the same three slots filled six ways.
 *
 * The sentence cycles by itself while on screen until a sector is chosen, and
 * not at all for a reader who asked for less motion. It only becomes a live
 * region once someone picks a sector, so the cycling never talks over a
 * screen reader.
 */
export function Sectors() {
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(() => !prefersReducedMotion());
  const sentenceRef = useRef<HTMLParagraphElement>(null);
  const inView = useInView(sentenceRef, 0.3);
  const sector = SECTORS[index];

  useEffect(() => {
    if (!auto || !inView) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % SECTORS.length), 2800);
    return () => clearInterval(id);
  }, [auto, inView]);

  const choose = (next: number) => {
    setAuto(false);
    setIndex(next);
  };

  return (
    <section className="lp-section lp-sectors" aria-labelledby="lp-sectors-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow" data-reveal>
          It's not about education
        </p>
        <h2 id="lp-sectors-title" className="visually-hidden">
          One system, many sectors
        </h2>
        <p className="lp-sentence" ref={sentenceRef} aria-live={auto ? 'off' : 'polite'} data-reveal="1">
          {/* Keyed by sector so each slot fades in afresh. */}
          <span className="lp-slot" key={`v${index}`}>
            {sector.verifier}
          </span>{' '}
          confirms{' '}
          <span className="lp-slot lp-slot--2" key={`c${index}`}>
            {sector.confirms}
          </span>
          , and{' '}
          <span className="lp-slot lp-slot--3" key={`p${index}`}>
            {sector.paid}
          </span>{' '}
          gets paid.
        </p>
        <div className="lp-sector-pills" role="group" aria-label="Choose a sector" data-reveal="2">
          {SECTORS.map((item, i) => (
            <button key={item.pill} type="button" aria-pressed={i === index} onClick={() => choose(i)}>
              {item.pill}
            </button>
          ))}
        </div>
        <table className="lp-sector-table" data-reveal>
          <caption className="visually-hidden">Sectors Milepost can serve</caption>
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Verifier</th>
              <th scope="col">Condition</th>
              <th scope="col">Who gets paid</th>
            </tr>
          </thead>
          <tbody>
            {SECTORS.map((item) => (
              <tr key={item.name}>
                <th scope="row">{item.name}</th>
                <td data-label="Verifier">{item.verifier}</td>
                <td data-label="Condition">{item.condition}</td>
                <td data-label="Who gets paid">{item.payee}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lp-sector-note">
          The contracts carry no subject matter. A verifier, a condition and a payee are all a programme needs.
        </p>
      </div>
    </section>
  );
}
