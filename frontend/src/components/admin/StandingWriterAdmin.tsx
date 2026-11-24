import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress } from '../../lib/format';
import { AddressChip, Badge, Button, Field, Notice } from '../ui';
import { Loading } from '../state/AsyncStates';
import { TxSheet } from '../state/TxSheet';
import './StandingWriterAdmin.css';

/**
 * Which contracts may write standing.
 *
 * `record.add_writer` / `remove_writer` need the record's admin. On this
 * deployment that admin is the registry contract, which makes every programme
 * it deploys a writer, so no person adds or removes one, and the page says so.
 * Anyone can check whether a contract is a writer. The add and remove controls
 * only appear if the record's admin is a wallet and that wallet is signed in.
 */
export function StandingWriterAdmin() {
  const { record, registry } = useSoroban();
  const wallet = useWallet();

  const [writerInput, setWriterInput] = useState('');
  const [writerToCheck, setWriterToCheck] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: 'add' | 'remove'; writer: string } | null>(null);

  const adminRead = useContractResult(() => record.get_admin(), [record], { contract: 'record' });
  const admin = adminRead.data;
  const adminIsRegistry = Boolean(admin && registry?.options?.contractId && admin === registry.options.contractId);
  const isAdmin = Boolean(wallet.address && admin && wallet.address.toLowerCase() === admin.toLowerCase());

  const statusRead = useContractRead(
    () => (writerToCheck && looksLikeAddress(writerToCheck) ? record.is_writer({ addr: writerToCheck }) : Promise.resolve({ result: false })),
    [record, writerToCheck],
    { contract: 'record' },
  );

  const tx = useTransaction({ contract: 'record', onSuccess: () => statusRead.refetch() });

  const run = async (kind: 'add' | 'remove', e?: FormEvent) => {
    e?.preventDefault();
    setInputError(null);
    if (!looksLikeAddress(writerInput)) {
      setInputError('Enter a valid contract address.');
      return;
    }
    const target = writerInput;
    setAction({ kind, writer: target });
    const result = await tx.send(() =>
      kind === 'add' ? record.add_writer({ writer: target }) : record.remove_writer({ writer: target }),
    );
    if (result !== null) {
      setWriterInput('');
      setWriterToCheck(target);
    }
  };

  return (
    <div className="standing-writers">
      <div className="standing-writers__grid">
        <section className="standing-writers__panel" aria-labelledby="writers-how">
          <div className="standing-writers__head">
            <h2 id="writers-how">How a contract becomes a writer</h2>
            {admin && <Badge tone={isAdmin ? 'accent' : 'neutral'}>{isAdmin ? 'Record admin' : 'Read-only'}</Badge>}
          </div>
          {adminRead.loading && !admin ? (
            <Loading label="Loading record admin" rows={1} />
          ) : (
            admin && (
              <p className="standing-writers__admin">
                Record admin <AddressChip address={admin} copyLabel="Copy record admin address" />
                {adminIsRegistry && <span className="standing-writers__tag">the registry</span>}
              </p>
            )
          )}
          <p className="standing-writers__text">
            {adminIsRegistry
              ? 'The registry is the record’s admin, so it makes every programme it deploys a writer. That is the whole trust chain: a programme can credit standing because the registry deployed it, never by asking. No person adds or removes writers on this deployment.'
              : 'Only the record admin can add or remove writers. A writer can credit standing for any recipient, and other funders rely on that record.'}
          </p>
          {!isAdmin && wallet.address && admin && !adminIsRegistry && (
            <p className="standing-writers__text" role="note">
              You are viewing in read-only mode: the connected wallet is not the record admin.
            </p>
          )}
          <Link to="/recipients/standing" className="standing-writers__link">
            Look up a recipient’s standing →
          </Link>
        </section>

        <section className="standing-writers__panel standing-writers__panel--sunk" aria-labelledby="writers-check">
          <h2 id="writers-check">Check a contract</h2>
          <Field
            label="Check writer status"
            hint="Is this contract allowed to credit standing?"
            value={writerToCheck}
            onChange={(e) => setWriterToCheck(e.target.value.trim())}
            placeholder="C…"
            autoComplete="off"
            spellCheck={false}
          />
          {writerToCheck && looksLikeAddress(writerToCheck) && (
            <p className="standing-writers__result" role="status">
              <Badge tone={statusRead.loading ? 'neutral' : statusRead.data ? 'success' : 'neutral'}>
                {statusRead.loading ? 'Checking…' : statusRead.data ? 'Authorized writer' : 'Not a writer'}
              </Badge>
            </p>
          )}
        </section>
      </div>

      {isAdmin && (
        <section className="standing-writers__panel" aria-labelledby="writers-admin">
          <h2 id="writers-admin">Admin controls</h2>
          <Notice tone="risk" role="note">
            <span>
              <strong>Critical permission.</strong> A writer can credit standing for any recipient. Only authorise a
              contract you control or fully trust. Removing one leaves the standing it already credited in place.
            </span>
          </Notice>
          {inputError && (
            <p className="standing-writers__error" role="alert">
              {inputError}
            </p>
          )}
          <div className="standing-writers__forms">
            <form onSubmit={(e) => void run('add', e)} className="standing-writers__form">
              <Field
                label="Add writer"
                hint="Grant standing-write permission to a contract."
                value={writerInput}
                onChange={(e) => setWriterInput(e.target.value.trim())}
                placeholder="C…"
                spellCheck={false}
              />
              <Button type="submit" disabled={tx.busy}>
                Add writer
              </Button>
            </form>
            <form onSubmit={(e) => void run('remove', e)} className="standing-writers__form">
              <Field
                label="Remove writer"
                hint="Revoke standing-write permission from a contract."
                value={writerInput}
                onChange={(e) => setWriterInput(e.target.value.trim())}
                placeholder="C…"
                spellCheck={false}
              />
              <Button type="submit" variant="danger" disabled={tx.busy}>
                Remove writer
              </Button>
            </form>
          </div>
        </section>
      )}

      <TxSheet
        open={action !== null}
        onClose={() => {
          setAction(null);
          tx.reset();
        }}
        tx={tx}
        eyebrow="Standing writers"
        pendingTitle={action?.kind === 'remove' ? 'Removing the writer' : 'Adding the writer'}
        doneTitle={action?.kind === 'remove' ? 'Writer removed' : 'Writer added'}
        doneText={
          action?.kind === 'remove'
            ? 'It can no longer credit standing. What it already credited stays.'
            : 'It can now credit standing for any recipient.'
        }
        failTitle={action?.kind === 'remove' ? 'Writer not removed' : 'Writer not added'}
        onRetry={action ? () => void run(action.kind) : undefined}
      />
    </div>
  );
}
