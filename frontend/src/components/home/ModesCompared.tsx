import React from 'react';
import './ModesCompared.css';

type ModeCard = {
  name: string;
  where: string;
  chooses: string;
  tradeOff: string;
  reliesOn: string;
  strongest?: boolean;
};

/**
 * The four `Mode` variants in `contracts/program/src/lib.rs`, in the order the
 * contract lists them: descending by how hard the restriction is to get round.
 * The mode is chosen per award at `finalize`, not per programme.
 */
const MODES: ModeCard[] = [
  {
    name: 'Direct',
    where: 'Straight to a verified payee named at award time: a school, clinic or supplier.',
    chooses: 'The programme, when the award is finalized.',
    tradeOff: 'The recipient never holds the money and has no say in where it goes.',
    reliesOn: 'The payee being verified by the programme.',
  },
  {
    name: 'Allocated',
    where: 'Into escrow held by the programme contract, for the recipient.',
    chooses: 'The recipient picks which verified payee is paid, and when.',
    tradeOff: 'Every payment waits on the recipient directing it.',
    reliesOn: 'Nothing outside the contract. Money cannot leave escrow except to a verified payee.',
    strongest: true,
  },
  {
    name: 'Restricted',
    where: 'Into the recipient’s smart wallet, where a policy signer limits onward spending.',
    chooses: 'The recipient, within the policy’s verified payees and cap.',
    tradeOff: 'A policy constrains one signer, not the wallet. An unrestricted admin signer can spend around it.',
    reliesOn: 'The wallet being configured so the funded signer is confined to the policy.',
  },
  {
    name: 'Open',
    where: 'Straight to the recipient, with no restriction.',
    chooses: 'The recipient, entirely.',
    tradeOff: 'Nothing checks where the money goes after release. It is the simplest path and gives up every spending guarantee.',
    reliesOn: 'Trust in the recipient.',
  },
];

export const ModesCompared: React.FC = () => (
  <section id="modes" aria-labelledby="h-modes" className="modes-section">
    <div className="modes-header">
      <span className="eyebrow modes-eyebrow">Modes</span>
      <h2 id="h-modes">Four ways a tranche can be paid.</h2>
      <p>Each award picks its mode when it is finalized. They differ in who chooses the payee and what the guarantee rests on.</p>
    </div>

    <ul className="modes-grid">
      {MODES.map((m) => (
        <li key={m.name} className={`mode-card${m.strongest ? ' mode-card--strongest' : ''}`}>
          <div className="mode-card__head">
            <h3 className="mode-card__name">{m.name}</h3>
            {m.strongest && <span className="mode-card__badge">Strongest guarantee</span>}
          </div>
          <dl className="mode-card__facts">
            <dt>Where the money goes</dt>
            <dd>{m.where}</dd>
            <dt>Who chooses the payee</dt>
            <dd>{m.chooses}</dd>
            <dt>Trade-off</dt>
            <dd>{m.tradeOff}</dd>
            <dt>Relies on</dt>
            <dd>{m.reliesOn}</dd>
          </dl>
        </li>
      ))}
    </ul>

    <p className="modes-note">
      Allocated beats Restricted because there is no wallet to misconfigure. A Restricted wallet set
      up wrongly quietly becomes Open; each release checks the policy is installed, which limits a
      mistake to one tranche rather than the whole award.
    </p>
  </section>
);
