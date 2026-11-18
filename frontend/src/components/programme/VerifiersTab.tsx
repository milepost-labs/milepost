import { useState, type FC } from 'react';
import { FIXTURE_VERIFIERS, type VerifierFixture } from '../../fixtures/programmeFixtures';
import { useOptionalSoroban } from '../../context/useSoroban';
import { useContractRead } from '../../hooks/useContractRead';
import { Badge, Button, Field, SampleTag } from '../ui';
import { truncateAddress } from '../../lib/format';
import type { AddressLabel } from '../../lib/metadata';
import './VerifiersTab.css';

export interface VerifiersTabProps {
  verifiers?: VerifierFixture[];
  /** Real program contract address; omitted for sample programmes. */
  programmeId?: string;
  isSample?: boolean;
  /** The creator's names for addresses, from the programme's verified description. */
  labels?: AddressLabel[];
}

const ROLE_NAME: Record<AddressLabel['role'], string> = { reviewer: 'Reviewer', verifier: 'Verifier', payee: 'Payee' };

/**
 * One named address. The name is the creator's claim; whether the address
 * still holds the role is read from the programme now.
 */
const NamedRow: FC<{ entry: AddressLabel; programmeId: string }> = ({ entry, programmeId }) => {
  const soroban = useOptionalSoroban();
  const programme = soroban ? soroban.programmeAt(programmeId) : null;
  const read = useContractRead<boolean>(
    () =>
      entry.role === 'verifier'
        ? programme!.is_verifier({ addr: entry.address })
        : entry.role === 'reviewer'
          ? programme!.is_reviewer({ addr: entry.address })
          : programme!.is_payee({ payee: entry.address }),
    [programme, entry.address, entry.role],
    { enabled: programme !== null },
  );
  return (
    <li className="verifiers-tab__card">
      <div className="verifiers-tab__card-info">
        <span className="verifiers-tab__label">{entry.label}</span>
        <span className="verifiers-tab__address numeric" title={entry.address}>
          {truncateAddress(entry.address, 8, 6)}
        </span>
      </div>
      <span className="verifiers-tab__role">
        {ROLE_NAME[entry.role]}
        {read.loading ? (
          <Badge>Checking…</Badge>
        ) : read.error ? (
          <Badge tone="warning">Couldn’t check</Badge>
        ) : read.data ? (
          <Badge tone="success">Holds the role now</Badge>
        ) : (
          <Badge tone="danger">No longer holds it</Badge>
        )}
      </span>
    </li>
  );
};

export const VerifiersTab: FC<VerifiersTabProps> = ({
  verifiers = FIXTURE_VERIFIERS,
  programmeId,
  isSample = false,
  labels,
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

      {!isSample && programmeId && labels && labels.length > 0 && (
        <section className="verifiers-tab__named" aria-labelledby="verifiers-named">
          <h3 id="verifiers-named" className="verifiers-tab__named-title">
            Named by the creator
          </h3>
          <p className="verifiers-tab__explanation">
            The names come from the programme’s description, which the creator wrote and committed by hash. They are the
            creator’s claim; each address’s role is read from the programme now.
          </p>
          <ul className="verifiers-tab__list">
            {labels.map((entry) => (
              <NamedRow key={`${entry.role}:${entry.address}`} entry={entry} programmeId={programmeId} />
            ))}
          </ul>
        </section>
      )}

      {isSample && (
        <div className="verifiers-tab__note-card" role="note">
          <SampleTag />
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
        <ul className="verifiers-tab__list">
          {verifiers.map((vr) => (
            <li key={vr.address} className="verifiers-tab__card">
              <div className="verifiers-tab__card-info">
                <span className="verifiers-tab__label">{vr.label}</span>
                <span className="verifiers-tab__address numeric">{vr.address}</span>
              </div>
              <span className="verifiers-tab__schema">Schema · {vr.schema}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
