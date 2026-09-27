import React, { useRef, useState, type KeyboardEvent } from 'react';
import './MoneyPath.css';
import { FIXTURE_PATH_BUDGET } from '../../fixtures/homeFixtures';

type StepData = {
  name: string;
  moves: boolean;
  plain: string;
  detail: string;
  tech: string;
  sq: { pool?: number; locked?: number; released?: number; refund?: number };
  ring?: number;
};

const STEPS: StepData[] = [
  { name: 'Contribute', moves: true, plain: 'Funders put money into a programme.', detail: 'The budget is contributions less the protocol fee.', tech: 'program.contribute(from, amount)', sq: { pool: 20 } },
  { name: 'Apply', moves: false, plain: 'Applicants ask for what they actually need.', detail: 'One person needs 200 for exam fees, another 5,000 for tuition. Equal splits are not funding.', tech: 'program.apply(applicant, requested)', sq: { pool: 20 } },
  { name: 'Review', moves: false, plain: 'Each reviewer approves an amount, up to what was asked.', detail: 'A reviewer cannot approve more than the request.', tech: 'program.review(reviewer, applicant, amount) · ExceedsRequested (11)', sq: { pool: 20 } },
  { name: 'Finalize', moves: false, plain: 'The award is the middle vote.', detail: 'The median, so neither one cautious reviewer nor one generous outlier decides. The award is fixed; nothing is transferred yet.', tech: 'program.finalize(applicant) · median · quorum ≤ MAX_QUORUM (16)', sq: { locked: 14, pool: 6 } },
  { name: 'Attest', moves: false, plain: 'A trusted verifier confirms the condition was met.', detail: 'A signed claim about the recipient, under a schema the programme chose.', tech: 'attest.attest(attester, schema, subject, data)', sq: { locked: 14, pool: 6 }, ring: 5 },
  { name: 'Release', moves: true, plain: 'One confirmation unlocks one tranche.', detail: 'This is the milepost. A proof can be used once; the rest stays locked.', tech: 'program.release(recipient, attestation) · AttestationAlreadyUsed (22)', sq: { released: 5, locked: 9, pool: 6 } },
  { name: 'Spend', moves: true, plain: 'The money reaches a verified payee.', detail: 'Paid directly, chosen by the recipient from escrow, spent from their wallet under a policy, or paid to them with no restriction. Unawarded budget is refunded to funders in proportion once the window closes.', tech: 'Direct · Allocated · Restricted · Open · refund() · sweep()', sq: { released: 5, locked: 9, refund: 6 } },
];

export const MoneyPath: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = STEPS[stepIndex];

  // Roving tabindex: one tab stop for the list, arrows move between steps.
  const focusStep = (i: number) => {
    setStepIndex(i);
    tabRefs.current[i]?.focus();
  };
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = STEPS.length - 1;
    const next: Record<string, number> = {
      ArrowRight: stepIndex === last ? 0 : stepIndex + 1,
      ArrowDown: stepIndex === last ? 0 : stepIndex + 1,
      ArrowLeft: stepIndex === 0 ? last : stepIndex - 1,
      ArrowUp: stepIndex === 0 ? last : stepIndex - 1,
      Home: 0,
      End: last,
    };
    if (e.key in next) {
      e.preventDefault();
      focusStep(next[e.key]);
    }
  };
  
  const unit = FIXTURE_PATH_BUDGET / 20;
  const curFormat = (n: number) => n.toLocaleString() + ' USDC';

  const squares: { bg: string; ring: string }[] = [];
  const order = [
    { k: 'released', col: 'var(--accent)' },
    { k: 'locked', col: 'var(--locked)' },
    { k: 'pool', col: 'var(--accent-soft)' },
    { k: 'refund', col: 'var(--refund)' }
  ] as const;

  order.forEach(({ k, col }) => {
    const count = cur.sq[k] || 0;
    for (let j = 0; j < count; j++) squares.push({ bg: col, ring: 'none' });
  });

  if (cur.ring !== undefined && squares[cur.ring]) {
    squares[cur.ring].ring = '0 0 0 3px var(--bg), 0 0 0 5px var(--accent)';
  }

  const legendDef = [
    { k: 'pool', bg: 'var(--accent-soft)', label: 'Budget, not yet awarded' },
    { k: 'locked', bg: 'var(--locked)', label: 'Awarded, locked until a milepost' },
    { k: 'released', bg: 'var(--accent)', label: 'Released to the recipient' },
    { k: 'refund', bg: 'var(--refund)', label: 'Refundable to funders' }
  ] as const;

  const legend = legendDef.map(({ k, bg, label }) => {
    const count = cur.sq[k] || 0;
    return {
      bg,
      label,
      amt: curFormat(count * unit),
      op: count ? 1 : 0.4
    };
  });

  const nextLabel = stepIndex < STEPS.length - 1 ? 'Next step →' : 'Start again';

  return (
    <section id="how" aria-labelledby="h-how" className="money-path-section">
      <div className="money-path-header">
        <span className="eyebrow" style={{ color: 'var(--accent-strong)' }}>How it works</span>
        <h2 id="h-how">Seven steps. Money moves at three of them.</h2>
        <p>Step through a programme with an example budget of {curFormat(FIXTURE_PATH_BUDGET)}. Each square is {curFormat(unit)}.</p>
      </div>

      <div role="tablist" aria-label="Money path steps" className="money-path-tablist">
        {STEPS.map((s, i) => (
          <button
            key={s.name}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`money-path-tab-${i}`}
            aria-selected={i === stepIndex}
            aria-controls="money-path-panel"
            tabIndex={i === stepIndex ? 0 : -1}
            onClick={() => setStepIndex(i)}
            onKeyDown={onTabKeyDown}
            className="money-path-tab"
          >
            <span className="tab-header">
              <span className="tab-num">0{i + 1}</span>
              {s.moves && (
                <>
                  <span aria-hidden="true" className="tab-dot"></span>
                  <span className="visually-hidden">, money moves</span>
                </>
              )}
            </span>
            <span className="tab-name">{s.name}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="money-path-panel"
        aria-labelledby={`money-path-tab-${stepIndex}`}
        className="money-path-panel"
      >
        <div className="panel-content">
          <span className={`panel-badge ${cur.moves ? 'panel-badge--moves' : 'panel-badge--static'}`}>
            {cur.moves ? 'Money moves' : 'No money moves'}
          </span>
          <h3 className="panel-title">{stepIndex + 1}. {cur.name}</h3>
          <p className="panel-plain">{cur.plain}</p>
          <p className="panel-detail">{cur.detail}</p>
          <code className="panel-tech">{cur.tech}</code>
          
          <div className="panel-actions">
            <button 
              type="button" 
              onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} 
              disabled={stepIndex === 0} 
              className="btn-back"
            >
              ← Back
            </button>
            <button 
              type="button" 
              onClick={() => setStepIndex(stepIndex < STEPS.length - 1 ? stepIndex + 1 : 0)} 
              className="btn-next"
            >
              {nextLabel}
            </button>
          </div>
        </div>
        
        <div className="panel-visual">
          <div aria-hidden="true" className="grid-container">
            {squares.map((q, i) => (
              <span key={i} className="grid-square" style={{ background: q.bg, boxShadow: q.ring }}></span>
            ))}
          </div>
          <ul className="legend-list">
            {legend.map((l, i) => (
              <li key={i} className="legend-item" style={{ opacity: l.op }}>
                <span aria-hidden="true" className="legend-color" style={{ background: l.bg }}></span>
                <span className="legend-label">{l.label}</span>
                <span className="legend-amt">{l.amt}</span>
              </li>
            ))}
          </ul>
          <span className="legend-note">Example figures. The protocol fee is taken from contributions before they count as budget.</span>
        </div>
      </div>
    </section>
  );
};
