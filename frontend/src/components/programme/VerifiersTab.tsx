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
    >
      <p className="verifiers-tab__intro">
        Verifiers are trusted signers who confirm a condition was met. Their signed confirmations, called attestations, can unlock one payment instalment, or tranche.
      </p>

      <div className="verifiers-tab__note-card" role="note">
        <div className="verifiers-tab__badge">Stand-in data</div>
        <p className="verifiers-tab__explanation">
          <strong>Verifier roster future source:</strong> The roster is not published by the indexer yet.
          Until it is, the verifiers below are examples, not this programme's real roster.
        </p>
        <p className="verifiers-tab__distinction">
          <strong>Reviewers vs verifiers:</strong> Reviewers decide the award amount. Verifiers confirm release
          conditions later by signing attestations when milestones are met.
        </p>
      </div>

      <div className="verifiers-tab__list">
        {verifiers.map((vr) => (
          <div key={vr.address} className="verifiers-tab__card">
            <div className="verifiers-tab__card-info">
              <span className="verifiers-tab__label">{vr.label}</span>
              <span className="verifiers-tab__address numeric">{vr.address}</span>
            </div>
            <span className="verifiers-tab__schema">Claim template · {vr.schema}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
