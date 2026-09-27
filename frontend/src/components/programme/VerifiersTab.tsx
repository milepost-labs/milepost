import type { FC } from 'react';
import { FIXTURE_VERIFIERS, type VerifierFixture } from '../../fixtures/programmeFixtures';
import './VerifiersTab.css';

export interface VerifiersTabProps {
  verifiers?: VerifierFixture[];
}

export const VerifiersTab: FC<VerifiersTabProps> = ({
  verifiers = FIXTURE_VERIFIERS,
}) => {
  return (
    <div
      className="verifiers-tab"
      role="tabpanel"
      id="panel-verifiers"
      aria-labelledby="tab-verifiers"
      tabIndex={0}
    >
      <p className="verifiers-tab__intro">
        Verifiers whose attestations this programme accepts. Each attestation unlocks one tranche.
      </p>

      <div className="verifiers-tab__note-card" role="note">
        <div className="verifiers-tab__badge">Stand-in data</div>
        <p className="verifiers-tab__explanation">
          <strong>Verifier roster future source:</strong> The roster is not published by the indexer yet.
          Until it is, the verifiers below are examples, not this programme's real roster.
        </p>
        <p className="verifiers-tab__distinction">
          <strong>Reviewers vs Verifiers:</strong> Verifiers differ from reviewers — verifiers unlock payments
          by signing attestations when milestone conditions are met, while reviewers vote during the review phase
          to determine the award amount.
        </p>
      </div>

      <div className="verifiers-tab__list">
        {verifiers.map((vr) => (
          <div key={vr.address} className="verifiers-tab__card">
            <div className="verifiers-tab__card-info">
              <span className="verifiers-tab__label">{vr.label}</span>
              <span className="verifiers-tab__address numeric">{vr.address}</span>
            </div>
            <span className="verifiers-tab__schema">Schema · {vr.schema}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
