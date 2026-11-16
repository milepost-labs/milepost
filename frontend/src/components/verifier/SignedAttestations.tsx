import { useState } from 'react';
import { Buffer } from 'buffer';
import type { Attestation } from '@milepost/attest';
import { useSoroban } from '../../context/useSoroban';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { truncateAddress } from '../../lib/format';
import { shortId } from '../../lib/programmeView';
import { absoluteLink, replyPath, type SignedRecord } from '../../lib/verifyLinks';
import { FIXTURE_MY_ATTESTATIONS } from '../../fixtures/verifierFixtures';
import { CopyButton, SampleTag } from '../ui';
import { AttestationRevoke } from './AttestationRevoke';
import type { RoleProgramme } from './useMyRoles';

type Status = 'valid' | 'used' | 'revoked' | 'checking';

const STATUS_LABEL: Record<Status, string> = {
  valid: 'Not used yet',
  used: 'Released a tranche',
  revoked: 'Revoked',
  checking: 'Checking…',
};

function StatusPill({ status }: { status: Status }) {
  return <span className={`att-status att-status--${status}`}>{STATUS_LABEL[status]}</span>;
}

function shortUid(hex: string) {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

/**
 * A row for an attestation signed in this browser. Whether it is revoked
 * comes from `attest.get`, whether it has released a tranche from the
 * programme's `is_spent`. The reply link can be copied again from here.
 */
function SignedRow({ record, programmeName }: { record: SignedRecord; programmeName: string | null }) {
  const { attest, programmeAt } = useSoroban();
  const [revokedHere, setRevokedHere] = useState(false);
  const uid = Buffer.from(record.uid, 'hex');
  const programme = programmeAt(record.programmeId);
  const attestationRead = useContractResult<Attestation>(() => attest.get({ uid }), [attest, record.uid], {
    contract: 'attest',
  });
  const spentRead = useContractRead(() => programme.is_spent({ attestation: uid }), [programme, record.uid], {
    contract: 'program',
  });

  const revoked = revokedHere || Boolean(attestationRead.data?.revoked_at);
  const status: Status = revoked
    ? 'revoked'
    : spentRead.data
      ? 'used'
      : spentRead.loading || attestationRead.loading
        ? 'checking'
        : 'valid';
  const reply = absoluteLink(
    replyPath({ programmeId: record.programmeId, attestation: record.uid, attester: record.attester }),
  );

  return (
    <tr>
      <td data-label="Attestation" className="numeric" title={record.uid}>
        {shortUid(record.uid)}
      </td>
      <td data-label="For">
        <span className="signed__for">
          <span>
            <span className="numeric" title={record.recipient}>
              {truncateAddress(record.recipient)}
            </span>{' '}
            · tranche {record.tranche}
          </span>
          <span className="signed__programme">{programmeName ?? shortId(record.programmeId)}</span>
        </span>
      </td>
      <td data-label="Status">
        <StatusPill status={status} />
      </td>
      <td className="signed__actions">
        {status === 'valid' && (
          <>
            <CopyButton value={reply} label={`Copy reply link for ${truncateAddress(record.recipient)}`} />
            <AttestationRevoke
              uidHex={record.uid}
              label={shortUid(record.uid)}
              onRevoked={() => setRevokedHere(true)}
            />
          </>
        )}
      </td>
    </tr>
  );
}

/** A sample row: shaped like a real one, tagged, and revoking it stands in. */
function SampleRow({ sample }: { sample: (typeof FIXTURE_MY_ATTESTATIONS)[number] }) {
  const [revoked, setRevoked] = useState(Boolean(sample.revoked));
  const status: Status = revoked ? 'revoked' : sample.used ? 'used' : 'valid';
  const label = truncateAddress(sample.uid, 8, 6);
  return (
    <tr>
      <td data-label="Attestation" className="numeric" title={sample.uid}>
        {label}
      </td>
      <td data-label="For">
        <span className="signed__for">
          <span className="numeric" title={sample.subject}>
            {truncateAddress(sample.subject)}
          </span>
          <span className="signed__programme">
            {sample.programme} <SampleTag />
          </span>
        </span>
      </td>
      <td data-label="Status">
        <StatusPill status={status} />
      </td>
      <td className="signed__actions">
        {status === 'valid' && <AttestationRevoke uidHex={null} label={label} onRevoked={() => setRevoked(true)} />}
      </td>
    </tr>
  );
}

/**
 * Attestations this verifier signed. The index does not publish them yet, so
 * the real rows are the ones signed in this browser, and the rest are tagged
 * samples.
 */
export function SignedAttestations({
  records,
  allProgrammes,
}: {
  records: SignedRecord[];
  allProgrammes: RoleProgramme[] | null;
}) {
  return (
    <section className="verify__section" aria-labelledby="signed-attestations">
      <h2 id="signed-attestations" className="verify__h2">
        Attestations you’ve signed
      </h2>
        <table className="ui-table signed">
          <thead>
            <tr>
              <th scope="col">Attestation</th>
              <th scope="col">For</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <SignedRow
                key={r.uid}
                record={r}
                programmeName={allProgrammes?.find((p) => p.id === r.programmeId)?.name ?? null}
              />
            ))}
            {FIXTURE_MY_ATTESTATIONS.map((s) => (
              <SampleRow key={s.uid} sample={s} />
            ))}
          </tbody>
        </table>
      <p className="verify__fine">
        <SampleTag /> Rows stand in until the index publishes attestations. Ones you sign in this browser show their
        status read from the chain.
      </p>
    </section>
  );
}
