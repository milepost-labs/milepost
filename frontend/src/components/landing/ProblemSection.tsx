import {
  PROBLEM_BODY,
  PROBLEM_EYEBROW,
  PROBLEM_HEADING,
  PROBLEM_QUESTIONS,
} from '../../pages/homeContent';
import './LandingSections.css';

/**
 * Landing section 3: why the project exists.
 *
 * A short two-column band — the claim on the left, the three questions the
 * product answers on the right. No illustration: the copy is the point. The
 * eyebrow uses `--refund` rather than the accent so it reads as a problem.
 */
export function ProblemSection() {
  return (
    <section className="problem" aria-labelledby="problem-heading">
      <div className="problem__intro">
        <span className="eyebrow problem__eyebrow">{PROBLEM_EYEBROW}</span>
        <h2 id="problem-heading" className="problem__heading">
          {PROBLEM_HEADING}
        </h2>
        <p className="problem__body">{PROBLEM_BODY}</p>
      </div>
      <ol className="problem__questions">
        {PROBLEM_QUESTIONS.map((item) => (
          <li key={item.n} className="problem__question">
            <span className="problem__number numeric">{item.n}</span>
            <span className="problem__text">{item.question}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
