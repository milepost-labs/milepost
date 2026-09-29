import { useState, type FormEvent } from 'react';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { AddressChip, Badge, Button, Field } from '../ui';
import { Loading, TransactionOutcome } from '../state/AsyncStates';
import './StandingWriterAdmin.css';

/**
 * Which contracts may write standing (issue #341).
 *
 * `record.add_writer` / `remove_writer` gate who can credit a recipient's
 * track record; the registry is `record`'s admin, which is how a deployed
 * programme contract earns write access in the first place. This used to be
 * its own page (`AdminDashboard.tsx` at `/admin/standing`); it is now a
 * section of the same admin area as protocol config and deploy, reached from
 * the same nav — same `add_writer`/`remove_writer`/`is_writer` calls, same
 * checks, just built on the current UI kit instead of inline styles and a
 * component-owned `Client`.
 */
export function StandingWriterAdmin() {
  const { record } = useSoroban();
  const wallet = useWallet();

  const [writerInput, setWriterInput] = useState('');
  const [writerToCheck, setWriterToCheck] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const adminRead = useContractResult(() => record.get_admin(), [record], { contract: 'record' });
  const admin = adminRead.data;
  const isAdmin = Boolean(wallet.address && admin && wallet.address.toLowerCase() === admin.toLowerCase());

  const statusRead = useContractRead(
    () => {
      if (!writerToCheck || !looksLikeAddress(writerToCheck)) {
        return Promise.resolve({ result: false });
      }
      return record.is_writer({ addr: writerToCheck });
    },
    [record, writerToCheck],
    { contract: 'record' },
  );

  const addTx = useTransaction({ contract: 'record', onSuccess: () => statusRead.refetch() });
  const removeTx = useTransaction({ contract: 'record', onSuccess: () => statusRead.refetch() });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setInputError(null);
    if (!looksLikeAddress(writerInput)) {
      setInputError('Enter a valid contract address.');
      return;
    }
    const target = writerInput;
    const result = await addTx.send(() => record.add_writer({ writer: target }));
    if (result !== null) {
      setWriterInput('');
      setWriterToCheck(target);
    }
  };

  const handleRemove = async (e: FormEvent) => {
    e.preventDefault();
    setInputError(null);
    if (!looksLikeAddress(writerInput)) {
      setInputError('Enter a valid contract address.');
      return;
    }
    const target = writerInput;
    const result = await removeTx.send(() => record.remove_writer({ writer: target }));
    if (result !== null) {
      setWriterInput('');
      setWriterToCheck(target);
    }
  };

  return (
    <section className="standing-writers" aria-labelledby="standing-writers">
      <div className="standing-writers__head">
        <div>
          <h2 id="standing-writers">Standing writers</h2>
          <p className="standing-writers__subtitle">
            Contracts allowed to credit a recipient&rsquo;s standing.
          </p>
        </div>
        {admin && <Badge tone={isAdmin ? 'accent' : 'neutral'}>{isAdmin ? 'Record admin' : 'Read-only'}</Badge>}
      </div>

      <div
        className="standing-writers__note standing-writers__note--warning"
        role="note"
      >
        <strong>Critical permission.</strong> A writer contract can credit standing for any
        recipient. Only authorize a contract you control or fully trust — other funders rely
        on this track record when underwriting future applications.
      </div>

      {!isAdmin && wallet.address && admin && (
        <p className="standing-writers__note" role="note">
          You are viewing in read-only mode. Connected wallet (
          <AddressChip address={wallet.address} copyLabel="Copy your address" />) is not the
          record admin (<AddressChip address={admin} copyLabel="Copy record admin address" />).
        </p>
      )}

      {adminRead.loading && !admin ? (
        <Loading label="Loading record admin" rows={1} />
      ) : (
        admin && (
          <p className="standing-writers__admin">
            Record admin: <AddressChip address={admin} copyLabel="Copy record admin address" />
          </p>
        )
      )}

      <div className="standing-writers__check">
        <Field
          label="Check writer status"
          hint="Enter a contract address to check whether it can write standing."
          value={writerToCheck}
          onChange={(e) => setWriterToCheck(e.target.value.trim())}
          placeholder="C…"
        />
        {writerToCheck && looksLikeAddress(writerToCheck) && (
          <Badge tone={statusRead.loading ? 'neutral' : statusRead.data ? 'success' : 'neutral'}>
            {statusRead.loading ? 'Checking…' : statusRead.data ? 'Authorized writer' : 'Not a writer'}
          </Badge>
        )}
      </div>

      {inputError && (
        <p className="standing-writers__note standing-writers__note--error" role="alert">
          {inputError}
        </p>
      )}

      {isAdmin && (
        <div className="standing-writers__controls">
          <h3 className="standing-writers__controls-title">Admin controls</h3>

          <form onSubmit={handleAdd} className="standing-writers__form">
            <Field
              label="Add writer"
              hint="Grant standing-write permission to a contract."
              value={writerInput}
              onChange={(e) => setWriterInput(e.target.value.trim())}
              placeholder="C…"
            />
            <Button type="submit" loading={addTx.busy} className="standing-writers__submit">
              Add writer
            </Button>
            <TransactionOutcome phase={addTx.phase} error={addTx.error} successTitle="Writer added" />
          </form>

          <form onSubmit={handleRemove} className="standing-writers__form">
            <Field
              label="Remove writer"
              hint="Revoke standing-write permission from a contract."
              value={writerInput}
              onChange={(e) => setWriterInput(e.target.value.trim())}
              placeholder="C…"
            />
            <Button
              type="submit"
              variant="danger"
              loading={removeTx.busy}
              className="standing-writers__submit"
            >
              Remove writer
            </Button>
            <TransactionOutcome phase={removeTx.phase} error={removeTx.error} successTitle="Writer removed" />
          </form>
        </div>
      )}
      <p className="standing-writers__foot">
        Record admin: {admin ? truncateAddress(admin) : 'loading…'}. Only the record admin can
        add or remove writers.
      </p>
    </section>
  );
}
