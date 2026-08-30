import { useState } from 'react';
import { Buffer } from 'buffer';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useTransaction, phaseLabel } from '../hooks/useTransaction';
import { explain } from '../lib/errors';
import { Card, Button, TextArea } from '../components/ui';
import { CopyButton } from '../components/ui/CopyButton';
import './RegisterSchema.css';

export const RegisterSchema = () => {
  const { address } = useWallet();
  const { attest } = useSoroban();

  const [definition, setDefinition] = useState('');
  const [revocable, setRevocable] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);

  const tx = useTransaction<Buffer>({ contract: 'attest' });

  const handleRegister = async () => {
    const trimmed = definition.trim();
    if (!trimmed) {
      setDefinitionError('Definition cannot be empty.');
      return;
    }
    if (!address) return;
    setDefinitionError(null);

    await tx.send(async () => {
      const built = await attest.register_schema({
        authority: address,
        definition: trimmed,
        revocable,
        restricted,
        predecessor: undefined,
      });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() as Buffer };
        },
      };
    });
  };

  const isConflict = tx.error?.code === 2;
  const successUidHex = tx.result ? (tx.result as Buffer).toString('hex') : null;

  return (
    <div className="register-schema">
      <header className="register-schema__header">
        <h1>Register attestation schema</h1>
        <p className="typo-text text-muted">
          Every programme needs a schema before any verifier can attest under it. The schema defines what a claim means;
          the UID it returns is what you configure the programme with.
        </p>
      </header>

      <Card title="New schema">
        <div className="register-schema__form">
          <TextArea
            label="Definition"
            placeholder="e.g. Delivery of 50kg maize to co-op, verified by field officer"
            value={definition}
            onChange={(e) => {
              setDefinition(e.target.value);
              setDefinitionError(null);
            }}
            rows={4}
            error={definitionError ?? undefined}
            hint="Human-readable description of what the claim means and how data_hash should be interpreted. The registry never parses it — be precise for humans who will verify later."
          />

          <fieldset className="schema-flags">
            <legend className="schema-flags__legend">Permissions</legend>
            <p className="schema-flags__intro typo-text text-muted">
              Both flags are irreversible — they cannot be changed after registration. Choose based on what you want to prevent later.
            </p>

            <label className={`schema-flag ${revocable ? 'schema-flag--on' : ''}`}>
              <input
                type="checkbox"
                checked={revocable}
                onChange={(e) => setRevocable(e.target.checked)}
              />
              <span className="schema-flag__text">
                <span className="schema-flag__label">Allow revocation</span>
                <span className="schema-flag__desc">
                  {revocable
                    ? 'Attestations under this schema can later be revoked by the original attester. Useful if a claim may need to be withdrawn when circumstances change. This choice is permanent — a revocable schema can never be made irrevocable later.'
                    : 'Attestations under this schema can never be revoked — even you cannot withdraw a mistaken claim. Only choose this if the claim must be permanent by design. This cannot be changed later.'}
                </span>
              </span>
            </label>

            <label className={`schema-flag ${restricted ? 'schema-flag--on' : ''}`}>
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
              />
              <span className="schema-flag__text">
                <span className="schema-flag__label">Restrict to authority only</span>
                <span className="schema-flag__desc">
                  {restricted
                    ? 'Only you (the authority that registers the schema) may attest under it — no one else can sign claims even if they know the UID. This is an irreversible choice at registration.'
                    : 'Any attester may attest under this schema. If you enable restriction, only you may attest and that restriction can never be removed afterwards.'}
                </span>
              </span>
            </label>
          </fieldset>

          {!address && (
            <p className="ui-field__message ui-field__message--error" role="alert">
              Connect a wallet — the connected address becomes the schema authority.
            </p>
          )}

          <div className="register-schema__actions">
            <Button
              onClick={() => void handleRegister()}
              loading={tx.busy}
              loadingLabel={phaseLabel(tx.phase) || 'Registering…'}
              disabled={!definition.trim() || !address || tx.busy}
              icon={<ShieldCheck size={16} />}
            >
              Register schema
            </Button>
            {tx.result && (
              <Button variant="ghost" onClick={() => tx.reset()}>
                Register another
              </Button>
            )}
          </div>

          {tx.error && (
            <div className={`state-error state-error--${tx.error.kind}`} role="alert">
              <p className="state-error__message">{tx.error.message}</p>
              {tx.error.action && <p className="state-error__action">{tx.error.action}</p>}
              {isConflict && (
                <div className="schema-conflict">
                  <p className="typo-text" style={{ margin: 0 }}>
                    A schema with this definition and authority already exists — the registry derives the UID from
                    those two fields, so registering the same pair twice is a conflict rather than a new entry. No new
                    UID was created. If you need the existing UID, look it up by the deterministic pairing (authority + definition)
                    or check your recent transactions for the original <code>SchemaRegistered</code> event.
                  </p>
                </div>
              )}
              {!isConflict && tx.error.message && (
                <p className="typo-text text-muted" style={{ margin: '0.5rem 0 0', fontSize: 'var(--text-sm)' }}>
                  {explain(tx.error, 'attest').message}
                </p>
              )}
            </div>
          )}

          {tx.phase === 'success' && successUidHex && (
            <div className="schema-success" role="status" aria-live="polite">
              <div className="schema-success__header">
                <Check size={18} aria-hidden="true" />
                <strong>Schema registered</strong>
              </div>
              <p className="typo-text text-muted" style={{ margin: 0 }}>
                Copy this UID — it is what a programme is configured with. You will need it when deploying the programme.
              </p>
              <div className="schema-success__uid">
                <code className="numeric schema-success__value">{successUidHex}</code>
                <CopyButton value={successUidHex} label="Copy schema UID" />
              </div>
              <div className="schema-success__meta">
                <span className="schema-success__meta-item">
                  <Copy size={12} aria-hidden="true" /> Click the copy button to copy the full 32-byte hex.
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="How this is used">
        <ul className="typo-text text-muted" style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <li>The UID is deterministic from authority + definition — the same inputs always produce the same UID.</li>
          <li>A restricted schema guarantees only the authority can attest; an unrestricted schema lets any verifier attest.</li>
          <li>A revocable schema lets the attester withdraw a claim later; an irrevocable schema makes every attestation permanent.</li>
        </ul>
      </Card>
    </div>
  );
};
