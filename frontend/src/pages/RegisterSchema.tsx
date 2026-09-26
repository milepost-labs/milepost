import { useState } from 'react';
import { Buffer } from 'buffer';
import { ShieldCheck } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useTransaction, phaseLabel } from '../hooks/useTransaction';
import { explain } from '../lib/errors';
import { Card, Button, Field, TextArea, Badge } from '../components/ui';
import { CopyButton } from '../components/ui/CopyButton';
import {
  FIXTURE_SCHEMAS,
  SCHEMA_NAME_ERROR,
  buildSchemaDefinition,
  isValidSchemaName,
  type FixtureSchema,
} from '../fixtures/schemaFixtures';
import './RegisterSchema.css';

const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Register an attestation schema (Screen 10, Schemas).
 *
 * The form collects a name (`lowercase-words/vN`, a UI convention validated
 * before signing), a fields description, and whether attestations under the
 * schema may later be revoked. Both are composed into the opaque `definition`
 * string the contract stores — the registry never parses it, so being precise
 * here is what lets a verifier years later agree on what a claim meant.
 *
 * Registered schemas are listed with their UID because the UID is what a
 * programme is configured with at deploy time. The list is `FIXTURE_SCHEMAS`
 * plus anything registered this session: the contract keeps no "all schemas"
 * list, so a real list would come from an indexer handler that does not exist
 * yet.
 */
export const RegisterSchema = () => {
  const { address } = useWallet();
  const { attest } = useSoroban();
  const announce = useAnnouncer();

  const [name, setName] = useState('');
  const [fields, setFields] = useState('');
  const [revocable, setRevocable] = useState(false);
  const [predecessor, setPredecessor] = useState('');
  const [sessionSchemas, setSessionSchemas] = useState<FixtureSchema[]>([]);

  const tx = useTransaction<Buffer>({ contract: 'attest' });

  const trimmedName = name.trim();
  const nameError =
    name !== '' && !isValidSchemaName(name) ? SCHEMA_NAME_ERROR : null;
  const fieldsError =
    fields !== '' && fields.trim() === '' ? 'Describe the fields this schema covers.' : null;
  const predecessorError =
    predecessor.trim() !== '' && !HEX_32_BYTES.test(predecessor.trim())
      ? 'Enter a 32-byte hex UID (64 hex characters), or leave this empty.'
      : null;

  const valid =
    trimmedName !== '' &&
    nameError === null &&
    fields.trim() !== '' &&
    predecessorError === null &&
    address !== null &&
    address !== undefined;

  const handleRegister = async () => {
    if (!address || !valid) return;
    const definition = buildSchemaDefinition(trimmedName, fields);
    const predecessorBuf =
      predecessor.trim() === ''
        ? undefined
        : Buffer.from(predecessor.trim().replace(/^0x/i, ''), 'hex');

    const result = await tx.send(async () => {
      const built = await attest.register_schema({
        authority: address,
        definition,
        revocable,
        // Unrestricted: any verifier may attest under schemas registered here.
        // A restricted schema (authority-only) is a contract option this form
        // deliberately does not expose — programmes need open verifier sets.
        restricted: false,
        predecessor: predecessorBuf,
      });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() as Buffer };
        },
      };
    });

    if (result !== null) {
      setSessionSchemas((prev) => [
        {
          uid: result.toString('hex'),
          name: trimmedName,
          fields: fields.trim(),
          revocable,
        },
        ...prev,
      ]);
      announce('Schema registered.');
    } else if (tx.error) {
      announce('Schema registration failed.', 'alert');
    }
  };

  const explained = tx.error ? explain(tx.error, 'attest') : null;
  const isCycle = tx.error?.code === 9;
  const successUidHex = tx.result ? (tx.result as Buffer).toString('hex') : null;
  const schemas = [...sessionSchemas, ...FIXTURE_SCHEMAS];

  return (
    <div className="register-schema">
      <header className="register-schema__header">
        <h1>Register a schema</h1>
        <p className="typo-text text-muted">
          A programme cannot be deployed without a schema, so registering one comes first.
          Schemas describe what a verifier signs. They carry no protocol vocabulary.
        </p>
      </header>

      <div className="register-schema__grid">
        <Card title="New schema">
          <div className="register-schema__form">
            <Field
              label="Schema name"
              placeholder="shifts-confirmed/v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError ?? undefined}
              hint="Lowercase words and a version. Validated before signing."
            />

            <TextArea
              label="Fields"
              placeholder="programme: address, tranche: u32"
              value={fields}
              onChange={(e) => setFields(e.target.value)}
              rows={3}
              error={fieldsError ?? undefined}
              hint="What the claim carries. Kept as text — the registry never parses it."
            />

            <label className="schema-check">
              <input
                type="checkbox"
                checked={revocable}
                onChange={(e) => setRevocable(e.target.checked)}
              />
              <span className="schema-check__text">
                <span className="schema-check__label">Attesters can revoke attestations under this schema</span>
                <span className="schema-check__desc">
                  Revocation stops a claim being used again, but never claws back a tranche
                  that already released. This choice is permanent.
                </span>
              </span>
            </label>

            <Field
              label="Supersedes (optional)"
              placeholder="Predecessor schema UID, 32-byte hex"
              value={predecessor}
              onChange={(e) => setPredecessor(e.target.value)}
              error={predecessorError ?? undefined}
              hint="Only the schema authority may declare a predecessor. A cycle in the predecessor chain is rejected with CycleDetected (error 9)."
            />

            <p className="register-schema__opaque">
              The <span className="numeric">definition</span> the registry stores is opaque to it:
              name and fields are joined into one string the contract never interprets. Write
              them for the humans who will verify later, because no check will catch vagueness.
            </p>

            {!address && (
              <p className="ui-field__message ui-field__message--error" role="alert">
                Sign in — the connected address becomes the schema authority.
              </p>
            )}

            <div className="register-schema__actions">
              <Button
                onClick={() => void handleRegister()}
                loading={tx.busy}
                loadingLabel={phaseLabel(tx.phase) || 'Registering…'}
                disabled={!valid || tx.busy}
                icon={<ShieldCheck size={16} aria-hidden="true" />}
              >
                Register schema
              </Button>
              {tx.result && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    tx.reset();
                    setName('');
                    setFields('');
                    setRevocable(false);
                    setPredecessor('');
                  }}
                >
                  Register another
                </Button>
              )}
            </div>

            {tx.error && explained && (
              <div className={`state-error state-error--${explained.kind}`} role="alert">
                <p className="state-error__message">{explained.message}</p>
                {isCycle ? (
                  <p className="state-error__action">
                    A schema cannot supersede itself, directly or through its predecessors.
                    Pick a different predecessor or leave it empty. Nothing was registered.
                  </p>
                ) : (
                  explained.action && <p className="state-error__action">{explained.action}</p>
                )}
                <p className="state-error__action">Nothing was transferred · attest error {tx.error.code}</p>
              </div>
            )}

            {tx.phase === 'success' && successUidHex && (
              <div className="schema-success" role="status">
                <strong className="schema-success__title">Schema registered</strong>
                <p className="typo-text text-muted">
                  Copy this UID — it is what a programme is configured with at deploy time.
                </p>
                <div className="schema-success__uid">
                  <code className="numeric schema-success__value">{successUidHex}</code>
                  <CopyButton value={successUidHex} label="Copy schema UID" />
                </div>
              </div>
            )}
          </div>
        </Card>

        <section className="register-schema__list" aria-label="Registered schemas">
          <h2 className="register-schema__list-title">Registered schemas</h2>
          {schemas.length === 0 ? (
            <p className="typo-text text-muted">No schemas registered yet.</p>
          ) : (
            <ul className="schema-list">
              {schemas.map((schema) => (
                <li key={schema.uid} className="schema-list__item">
                  <div className="schema-list__row">
                    <span className="numeric schema-list__name">{schema.name}</span>
                    <Badge tone={schema.revocable ? 'warning' : 'neutral'}>
                      {schema.revocable ? 'Revocable' : 'Not revocable'}
                    </Badge>
                  </div>
                  <span className="numeric schema-list__fields">{schema.fields}</span>
                  <span className="numeric schema-list__uid" title={schema.uid}>
                    uid {schema.uid}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="register-schema__sample-note">Sample schemas for the design phase.</p>
        </section>
      </div>
    </div>
  );
};
