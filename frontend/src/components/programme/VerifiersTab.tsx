import { useState, type FC } from 'react';
import { FIXTURE_VERIFIERS, type VerifierFixture } from '../../fixtures/programmeFixtures';
import { useOptionalSoroban } from '../../context/useSoroban';
import { useContractRead } from '../../hooks/useContractRead';
import { Button, Field } from '../ui';
import './VerifiersTab.css';

export interface VerifiersTabProps {
  verifiers?: VerifierFixture[];
  /** Real program contract address; omitted for sample programmes. */
  programmeId?: string;
  isSample?: boolean;
}

export const VerifiersTab: FC<VerifiersTabProps> = ({
  verifiers = FIXTURE_VERIFIERS,
  programmeId,
  isSample = false,
}) => {
  const soroban = useOptionalSoroban();
  const [addrInput, setAddrInput] = useState('');
  const [checkAddr, setCheckAddr] = useState('');
  const programme = programmeId && soroban ? soroban.programmeAt(programmeId) : null;
  const enabled = checkAddr !== '' && programme !== null;
  const reviewer = useContractRead(() => programme!.is_reviewer({ addr: checkAddr }), [programme, checkAddr], { enabled });
  const verifier = useContractRead(() => programme!.is_verifier({ addr: checkAddr }), [programme, checkAddr], { enabled });
  const payee = useContractRead(() => programme!.is_payee({ payee: checkAddr }), [programme, checkAddr], { enabled });

  return (
    <div
      className="verifiers-tab"
      role="tabpanel"
      id="panel-verifiers"
      aria-labelledby="tab-verifiers"
      tabIndex={0}
    >
      <p className="verifiers-tab__intro">
        Verifiers are trusted signers who confirm a condition was met. Each signed confirmation, called an attestation, unlocks one tranche: one instalment of the award.
      </p>

      {!isSample && programmeId && (
        <div className="verifiers-tab__check" role="group" aria-label="Check an address">
          <Field
            label="Check an address"
            hint="Is this address a reviewer, verifier or payee on this programme?"
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value.trim())}
            placeholder="G… or C…"
          />
          <Button type="button" onClick={() => setCheckAddr(addrInput)} disabled={!addrInput}>
            Check
          </Button>
          {enabled && !reviewer.loading && !verifier.loading && !payee.loading && (
            <ul className="verifiers-tab__check-results">
              <li>Reviewer: {reviewer.data ? 'Yes' : 'No'}</li>
              <li>Verifier: {verifier.data ? 'Yes' : 'No'}</li>
              <li>Payee: {payee.data ? 'Yes' : 'No'}</li>
            </ul>
          )}
        </div>
      )}

      {isSample && (
        <div className="verifiers-tab__note-card" role="note">
          <div className="verifiers-tab__badge">Sample data</div>
          <p className="verifiers-tab__explanation">
            <strong>Verifier roster future source:</strong> The roster is not published by the indexer yet.
            These are example verifiers, not a real programme's roster.
          </p>
          <p className="verifiers-tab__distinction">
            <strong>Reviewers vs verifiers:</strong> Reviewers decide the award amount. Verifiers confirm release
            conditions later by signing attestations when milestones are met.
          </p>
        </div>
      )}

      {isSample && (
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
      )}
    </div>
  );
};
