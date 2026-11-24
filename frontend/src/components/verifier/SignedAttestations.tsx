import { useState } from 'react';
import { Buffer } from 'buffer';
import type { Attestation } from '@milepost/attest';
import { useSoroban } from '../../context/useSoroban';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useIndexedList } from '../../hooks/useIndexedList';
import { truncateAddress } from '../../lib/format';
import { shortId } from '../../lib/programmeView';
import { absoluteLink, replyPath, type SignedRecord } from '../../lib/verifyLinks';
import { searchAttestations } from '../../lib/attestationSearch';
import { describeWindow } from '../../lib/contractEvents';
import { explain } from '../../lib/errors';
import { mergeSigned, type SignedEntry } from '../../lib/signedAttestations';
import { rpcServer } from '../../lib/txLookup';
import { FIXTURE_MY_ATTESTATIONS } from '../../fixtures/verifierFixtures';
import { samplesEnabled } from '../../lib/samples';
import { Button, CopyButton, SampleTag } from '../ui';
import { AttestationRevoke } from './AttestationRevoke';
import type { RoleProgramme } from './useMyRoles';

type Status = 'valid' | 'used' | 'revoked' | 'checking' | 'unchecked';

const STATUS_LABEL: Record<Status, string> = {
  valid: 'Not used yet',
  used: 'Released a tranche',
  revoked: 'Revoked',
  checking: 'Checking…',
  unchecked: 'Not revoked',
};

function StatusPill({ status }: { status: Status }) {
  return <span className={`att-status att-status--${status}`}>{STATUS_LABEL[status]}</span>;
}

function shortUid(hex: string) {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

/**
 * A row for an attestation this verifier signed. Whether it is revoked comes
 * from `attest.get`. When this browser signed it, it also knows the
 * programme, so whether it has released a tranche comes from that
 * programme's `is_spent`, and the reply link can be copied again. One found
 * only in the events says it was signed on another device.
 */
function SignedRow({ entry, programmeName }: { entry: SignedEntry; programmeName: string | null }) {
  const { attest, programmeAt } = useSoroban();
  const [revokedHere, setRevokedHere] = useState(false);
  const uid = Buffer.from(entry.uid, 'hex');
  const programme = entry.programmeId ? programmeAt(entry.programmeId) : null;
  const attestationRead = useContractResult<Attestation>(() => attest.get({ uid }), [attest, entry.uid], {
    contract: 'attest',
  });
  const spentRead = useContractRead(() => programme!.is_spent({ attestation: uid }), [programme, entry.uid], {
    contract: 'program',
    enabled: Boolean(programme),
  });

  const revoked = revokedHere || Boolean(attestationRead.data?.revoked_at);
  const status: Status = revoked
    ? 'revoked'
    : spentRead.data
      ? 'used'
      : spentRead.loading || attestationRead.loading
        ? 'checking'
        : programme
          ? 'valid'
          : 'unchecked';
  const reply =
    entry.programmeId && entry.attester
      ? absoluteLink(replyPath({ programmeId: entry.programmeId, attestation: entry.uid, attester: entry.attester }))
      : null;

  return (
    <tr>
      <td data-label="Attestation" className="numeric" title={entry.uid}>
        {shortUid(entry.uid)}
      </td>
      <td data-label="For">
        <span className="signed__for">
          <span>
            <span className="numeric" title={entry.subject}>
              {truncateAddress(entry.subject)}
            </span>
            {entry.tranche !== null && <> · tranche {entry.tranche}</>}
          </span>
          <span className="signed__programme">
            {entry.programmeId
              ? (programmeName ?? shortId(entry.programmeId))
              : 'Signed on another device, so its programme is not known here'}
          </span>
        </span>
      </td>
      <td data-label="Status">
        <StatusPill status={status} />
      </td>
      <td className="signed__actions">
        {(status === 'valid' || status === 'unchecked') && (
          <>
            {reply && <CopyButton value={reply} label={`Copy reply link for ${truncateAddress(entry.subject)}`} />}
            <AttestationRevoke
              uidHex={entry.uid}
              label={shortUid(entry.uid)}
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
 * Attestations this verifier signed: the ones signed in this browser, merged
 * by uid with the `attest` events that name this address as attester within
 * the RPC's window, so signing on one device shows on another. Older events
 * are out of reach, and the section says how far back it looked.
 */
export function SignedAttestations({
  attester,
  records,
  allProgrammes,
}: {
  attester: string | null;
  records: SignedRecord[];
  allProgrammes: RoleProgramme[] | null;
}) {
  const { attest, rpcUrl } = useSoroban();
  const events = useIndexedList(
    () => searchAttestations(rpcServer(rpcUrl), attest, attester ?? ''),
    [rpcUrl, attest, attester],
    { enabled: Boolean(attester && rpcUrl) },
  );
  const entries = mergeSigned(records, events.data?.matches ?? []);
  const showTable = entries.length > 0 || samplesEnabled();

  return (
    <section className="verify__section" aria-labelledby="signed-attestations">
      <h2 id="signed-attestations" className="verify__h2">
        Attestations you’ve signed
      </h2>
      {showTable && (
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
            {entries.map((entry) => (
              <SignedRow
                key={entry.uid}
                entry={entry}
                programmeName={allProgrammes?.find((p) => p.id === entry.programmeId)?.name ?? null}
              />
            ))}
            {samplesEnabled() &&
              FIXTURE_MY_ATTESTATIONS.map((s) => <SampleRow key={s.uid} sample={s} />)}
          </tbody>
        </table>
      )}
      {attester && events.loading && (
        <p className="verify__fine">Looking for attestations you signed on other devices in the network’s recent events…</p>
      )}
      {events.data && (
        <p className="verify__fine">
          {entries.length === 0
            ? `You have not signed any attestations in the network’s recent events, which cover ${describeWindow(events.data.window)}.`
            : `Includes attestations you signed on any device in the network’s recent events, which cover ${describeWindow(events.data.window)}.`}{' '}
          Older ones show only on the device that signed them.
          {events.data.truncated && ' The newest events filled the page limit, so some in that window may be missing.'}
        </p>
      )}
      {Boolean(events.error) && !events.data && (
        <div className="verify__fine signed__events-error">
          <span>
            Couldn’t read the network’s recent events, so only attestations signed in this browser are listed.{' '}
            {explain(events.error, 'attest').message}
          </span>
          <Button variant="ghost" size="sm" onClick={events.refetch}>
            Try again
          </Button>
        </div>
      )}
      {samplesEnabled() && (
        <p className="verify__fine">
          <SampleTag /> Rows stand in until the index publishes attestations. Ones you sign in this browser show their
          status read from the chain.
        </p>
      )}
    </section>
  );
}
