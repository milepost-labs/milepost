import { useState } from 'react';
import { useSoroban } from '../../context/useSoroban';
import { useContractRead, useContractResult, useAnnounceTransaction, useTransaction } from '../../hooks';
import { explain, type CodeOverrides } from '../../lib/errors';
import { creatorSendable } from '../../lib/creatorTx';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { Badge, Button, DisabledReason, Field } from '../ui';
import { TxSheet } from '../state/TxSheet';
import { CreatorActionRow } from './CreatorActionRow';
import type { CreatorContext } from './CreatorActions';

/**
 * The contract reuses its payee errors for verifiers, so the shared table says
 * "payee". For this action: 31 is an add of an existing verifier, 32 a removal
 * of someone who is not one.
 */
const VERIFIER_ERRORS: CodeOverrides = {
  31: {
    kind: 'conflict',
    message: 'That address is already a verifier.',
    action: 'Nothing was changed.',
  },
  32: {
    kind: 'conflict',
    message: 'That address is not a verifier.',
    action: 'Nothing was removed. Check the address and try again.',
  },
};

type Change = { kind: 'add' | 'remove'; address: string };

/**
 * Add or remove a verifier. The contract keeps no list, so the creator pastes
 * an address, the programme says whether it is a verifier now, and only the
 * change that makes sense is offered.
 */
export function VerifiersAction({ client, phase, verified, onChanged }: CreatorContext) {
  const { attest } = useSoroban();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<string | null>(null);
  const [change, setChange] = useState<Change | null>(null);

  const config = useContractResult(() => client.get_config(), [client]);
  // A restricted schema's authority has to stay a verifier or no tranche could
  // ever be released. The contract only checks that at deployment, so the page
  // guards removal itself.
  const schema = useContractResult(
    () => attest.get_schema({ uid: Buffer.from(config.data!.schema) }),
    [attest, config.data],
    { enabled: config.data !== null },
  );
  const status = useContractRead(() => client.is_verifier({ addr: checked! }), [client, checked], {
    enabled: checked !== null,
  });

  const tx = useTransaction<true>({
    contract: 'program',
    overrides: VERIFIER_ERRORS,
    onSuccess: () => {
      status.refetch();
      onChanged();
    },
  });

  useAnnounceTransaction({
    phase: tx.phase,
    error: tx.error,
    pending: change?.kind === 'remove' ? 'Removing the verifier…' : 'Adding the verifier…',
    success: change?.kind === 'remove' ? 'Verifier removed.' : 'Verifier added.',
  });

  let reason: string | null = null;
  if (verified !== true) {
    reason = 'Writes are blocked until this programme is confirmed as deployed by the Milepost registry.';
  } else if (phase === 'Cancelled') {
    reason = 'This programme is cancelled, so no tranche can be released and verifiers no longer matter.';
  }
  const enabled = reason === null;

  const trimmed = input.trim();
  const invalid = trimmed !== '' && !looksLikeAddress(trimmed);
  const isVerifier = checked !== null && status.data === true;
  const isNotVerifier = checked !== null && status.data === false;
  const isAuthority =
    checked !== null && schema.data !== null && schema.data.restricted && schema.data.authority === checked;

  let removeBlocked: string | null = null;
  if (isNotVerifier) removeBlocked = 'This address is not a verifier, so there is nothing to remove.';
  else if (isAuthority) {
    removeBlocked =
      'This address is the authority of this programme’s restricted schema. It must stay a verifier, or no tranche could ever be released.';
  }
  const addBlocked = isVerifier ? 'This address is already a verifier.' : null;

  const check = () => {
    if (!looksLikeAddress(trimmed)) return;
    if (trimmed === checked) status.refetch();
    setChecked(trimmed);
  };

  const build = (next: Change) => async () =>
    creatorSendable(
      next.kind === 'add'
        ? await client.add_verifier({ verifier: next.address })
        : await client.remove_verifier({ verifier: next.address }),
    );

  const start = (next: Change) => {
    setChange(next);
    void tx.prepare(build(next));
  };

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setChange(null);
  };

  const removing = change?.kind === 'remove';
  const who = change ? truncateAddress(change.address, 6, 6) : '';

  return (
    <>
      <CreatorActionRow
        id="verifiers"
        label="Verifiers"
        summary="Add a verifier, or remove one who has left or lost their key."
        button={editing ? 'Close' : 'Manage'}
        enabled={enabled}
        reason={reason ?? undefined}
        onClick={() => setEditing((value) => !value)}
      >
        {enabled && editing && (
          <div className="programme-action__form">
            <Field
              label="Verifier address"
              placeholder="G… or C…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              error={invalid ? 'That does not look like a Stellar address.' : null}
              hint="Paste an address to check it against this programme."
              autoComplete="off"
              spellCheck={false}
            />
            <Button size="sm" variant="secondary" onClick={check} disabled={!looksLikeAddress(trimmed)}>
              Check address
            </Button>

            {checked !== null && (
              <div className="programme-action__result" role="status">
                {status.loading || status.fetching ? (
                  <Badge>Checking…</Badge>
                ) : status.error ? (
                  <p className="programme-action__current">
                    Could not check this address. {explain(status.error).message}
                  </p>
                ) : (
                  <>
                    <p className="programme-action__current">
                      <span className="numeric" title={checked}>
                        {truncateAddress(checked, 6, 6)}
                      </span>{' '}
                      <Badge tone={isVerifier ? 'success' : 'neutral'}>
                        {isVerifier ? 'Is a verifier' : 'Not a verifier'}
                      </Badge>
                    </p>
                    <div className="programme-action__buttons">
                      <Button
                        size="sm"
                        onClick={() => start({ kind: 'add', address: checked })}
                        disabled={addBlocked !== null}
                      >
                        Add verifier
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => start({ kind: 'remove', address: checked })}
                        disabled={removeBlocked !== null}
                      >
                        Remove verifier
                      </Button>
                    </div>
                    {(addBlocked ?? removeBlocked) && (
                      <DisabledReason>{removeBlocked ?? addBlocked}</DisabledReason>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CreatorActionRow>
      <TxSheet
        open={change !== null}
        onClose={close}
        tx={tx}
        eyebrow="Creator"
        confirmTitle={removing ? 'Remove this verifier?' : 'Add this verifier?'}
        confirmText={
          removing ? (
            <>
              <p>
                <span className="numeric">{who}</span> will no longer be a verifier on this programme.
              </p>
              <p>
                Attestations they have already signed stay valid in the attestation registry, but future releases can no
                longer rely on them. A recipient who was waiting on this verifier needs a confirmation from a current one.
              </p>
              <p>
                If this programme’s schema is restricted, its authority has to stay a verifier, so that address cannot be
                removed.
              </p>
            </>
          ) : (
            <p>
              <span className="numeric">{who}</span> will be able to sign confirmations that unlock tranches for this
              programme’s recipients. Only add someone you trust to confirm the programme’s conditions.
            </p>
          )
        }
        confirmLabel={removing ? 'Sign and remove' : 'Sign and add'}
        pendingTitle={removing ? 'Removing the verifier' : 'Adding the verifier'}
        doneTitle={removing ? 'Verifier removed' : 'Verifier added'}
        doneText={
          removing
            ? 'Future releases can no longer rely on this address. Attestations it already signed remain valid in the registry.'
            : 'The address can now sign confirmations for this programme.'
        }
        doneRows={change ? [{ label: 'Address', value: truncateAddress(change.address, 6, 6) }] : undefined}
        failTitle={removing ? 'Verifier not removed' : 'Verifier not added'}
        onRetry={() => {
          if (change) void tx.prepare(build(change));
        }}
      />
    </>
  );
}
