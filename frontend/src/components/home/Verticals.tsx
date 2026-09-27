import React from 'react';
import './Verticals.css';

type Vertical = {
  name: string;
  verifier: string;
  condition: string;
  paid: string;
};

/** Example copy only. None of these is a preset or a configuration the app offers. */
const VERTICALS: Vertical[] = [
  { name: 'Education', verifier: 'The school', condition: 'Enrolled for the term', paid: 'The school, for tuition' },
  { name: 'Health worker stipends', verifier: 'The district clinic', condition: 'Shifts worked this month', paid: 'The health worker' },
  { name: 'Agricultural inputs', verifier: 'An extension officer', condition: 'Land prepared for planting', paid: 'An approved seed and fertiliser supplier' },
  { name: 'Vocational training', verifier: 'The training centre', condition: 'Module completed', paid: 'The training centre' },
  { name: 'Humanitarian cash', verifier: 'A field partner', condition: 'Household registered and reached', paid: 'The household' },
  { name: 'SME microgrants', verifier: 'A business mentor', condition: 'Milestone in the business plan met', paid: 'The business or its suppliers' },
];

export const Verticals: React.FC = () => (
  <section id="verticals" aria-labelledby="h-verticals" className="verticals-section">
    <div className="verticals-header">
      <span className="eyebrow verticals-eyebrow">Examples</span>
      <h2 id="h-verticals">The same mechanism, different mileposts.</h2>
      <p>
        Illustrations of how a programme could be set up. They are examples, not presets: each
        programme picks its own verifiers, conditions and payees.
      </p>
    </div>

    <table className="verticals-table">
      <caption className="visually-hidden">Example programmes by sector</caption>
      <thead>
        <tr>
          <th scope="col">Sector</th>
          <th scope="col">Verifier</th>
          <th scope="col">Condition</th>
          <th scope="col">Who gets paid</th>
        </tr>
      </thead>
      <tbody>
        {VERTICALS.map((v) => (
          <tr key={v.name}>
            <th scope="row">{v.name}</th>
            <td data-label="Verifier">{v.verifier}</td>
            <td data-label="Condition">{v.condition}</td>
            <td data-label="Who gets paid">{v.paid}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
