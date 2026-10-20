import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Buffer } from 'buffer';
import { ShieldCheck } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { useIndexedList } from '../hooks';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useTransaction, phaseLabel } from '../hooks/useTransaction';
import { explain } from '../lib/errors';
import { Card, Button, Field, TextArea, Badge } from '../components/ui';
import { CopyButton } from '../components/ui/CopyButton';
import { AddressChip } from '../components/ui/AddressChip';
import { Empty, ErrorState, Loading } from '../components/state/AsyncStates';
import { lookupSchemaChain, parseSchemaUid, type SchemaRecord } from '../lib/schemaLookup';
import {
  SCHEMA_NAME_ERROR,
  buildSchemaDefinition,
  isValidSchemaName,
  type FixtureSchema,
} from '../fixtures/schemaFixtures';
import './RegisterSchema.css';

const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Register a schema (Screen 10, Schemas).
 *
 * The form collects a name (`lowercase-words/vN`, a UI convention validated
 * before signing), a fields description, and whether attestations under the
 * schema may later be revoked. Both are composed into the opaque `definition`
 * string the contract stores — the registry never parses it, so being precise
 * here is what lets a verifier years later agree on what a claim meant.
 *
 * Any schema can be looked up on-chain by UID (`attest.get_schema`), with its
 * predecessor history; the UID lives in `?schema=` so each lookup has a link.
 * Schemas registered from this page are listed as "registered in this
 * browser": the contract keeps no "all schemas" list, so a full list would
 * need an indexer handler that does not exist yet.
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

  const [searchParams, setSearchParams] = useSearchParams();
  const lookupUid = parseSchemaUid(searchParams.get('schema') ?? '');
  const [lookupInput, setLookupInput] = useState(lookupUid ?? '');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookup = useIndexedList(
    () => lookupSchemaChain((args) => attest.get_schema(args), lookupUid ?? ''),
    [attest, lookupUid],
    { enabled: lookupUid !== null },
  );

  const handleLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseSchemaUid(lookupInput);
    if (!parsed) {
      setLookupError('Enter a 32-byte hex UID (64 hex characters).');
      return;
    }
    setLookupError(null);
    const next = new URLSearchParams(searchParams);
    next.set('schema', parsed);
    setSearchParams(next);
  };

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
  const schemas = sessionSchemas;

  return (
    <div className="register-schema">
      <header className="register-schema__header">
        <h2>Register a schema</h2>
        <p className="typo-text text-muted">
          A programme cannot be deployed without a schema: the short checklist a verifier signs against. Register it first so every attestation uses the same words.
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
                  Revocation stops a proof being used again, but never claws back a tranche
                  that already released. This choice is permanent.
                </span>
              </span>
            </label>

            <Field
              label="Supersedes (optional)"
              placeholder="Earlier schema UID, 32-byte hex"
              value={predecessor}
              onChange={(e) => setPredecessor(e.target.value)}
              error={predecessorError ?? undefined}
              hint="Only the schema owner may link to an earlier template. The network refuses loops in that replacement history."
            />

            <p className="register-schema__opaque">
              The name and fields are stored as one text description. Write them for the humans who will verify later, because the network cannot tell whether a vague checklist is useful.
            </p>

            <div className="register-schema__actions">
              <Button
                onClick={() => void handleRegister()}
                loading={tx.busy}
                loadingLabel={phaseLabel(tx.phase) || 'Registering…'}
                disabled={!valid || tx.busy}
                aria-describedby={!address ? 'register-schema-requirement' : undefined}
                icon={<ShieldCheck size={16} aria-hidden="true" />}
              >
                Register schema
              </Button>
              {/* Not an error: nothing has gone wrong, the action just needs an
                  address. A neutral note beside the disabled button says so
                  without announcing itself as an alert. */}
              {!address && (
                <p id="register-schema-requirement" className="register-schema__requirement">
                  Sign in — the connected address becomes the schema owner.
                </p>
              )}
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
                    A schema cannot replace itself, directly or through earlier templates.
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

        <section className="register-schema__list" aria-label="Registered in this browser">
          <h2 className="register-schema__list-title">Registered in this browser</h2>
          {schemas.length === 0 ? (
            <p className="typo-text text-muted">
              Nothing registered from this browser yet. Look up any schema by UID below.
            </p>
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
                  <Link className="numeric schema-list__uid" title={schema.uid} to={`?schema=${schema.uid}`}>
                    uid {schema.uid}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="register-schema__sample-note">
            Kept in this tab only. The network keeps no list of every schema.
          </p>
        </section>
      </div>

      <Card title="Look up a schema" className="register-schema__lookup">
        <form className="register-schema__lookup-form" onSubmit={handleLookup} noValidate>
          <Field
            label="Schema UID"
            placeholder="32-byte hex"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            error={lookupError ?? undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="secondary">
            Look up
          </Button>
        </form>

        {lookupUid && lookup.loading && <Loading label="Reading the schema" rows={2} />}
        {lookupUid && Boolean(lookup.error) && !lookup.loading && (
          <ErrorState error={lookup.error} contract="attest" onRetry={lookup.refetch} />
        )}
        {lookupUid && !lookup.loading && !lookup.error && lookup.data === null && (
          <Empty
            title="No schema with that UID"
            description="Nothing is registered under it on this network. Check the UID."
          />
        )}
        {lookupUid && lookup.data && (
          <SchemaDetails
            schema={lookup.data.chain[0]}
            history={lookup.data.chain.slice(1)}
            missingPredecessor={lookup.data.missingPredecessor}
            truncated={lookup.data.truncated}
          />
        )}
      </Card>
    </div>
  );
};

function SchemaDetails({
  schema,
  history,
  missingPredecessor,
  truncated,
}: {
  schema: SchemaRecord;
  history: SchemaRecord[];
  missingPredecessor: string | null;
  truncated: boolean;
}) {
  return (
    <div className="schema-details" role="status">
      <dl className="schema-details__fields">
        <dt>UID</dt>
        <dd className="numeric schema-details__uid">
          {schema.uid} <CopyButton value={schema.uid} label="Copy schema UID" />
        </dd>
        <dt>Definition</dt>
        <dd className="numeric">{schema.definition}</dd>
        <dt>Authority</dt>
        <dd>
          <AddressChip address={schema.authority} />
        </dd>
        <dt>Revocation</dt>
        <dd>
          <Badge tone={schema.revocable ? 'warning' : 'neutral'}>
            {schema.revocable ? 'Revocable' : 'Not revocable'}
          </Badge>{' '}
          {schema.revocable
            ? 'Attesters can revoke attestations under this schema.'
            : 'Attestations under this schema can never be revoked.'}
        </dd>
        <dt>Who may attest</dt>
        <dd>{schema.restricted ? 'Only the authority' : 'Any verifier'}</dd>
        <dt>Supersedes</dt>
        <dd className="numeric">
          {schema.predecessorUid ? (
            <Link to={`?schema=${schema.predecessorUid}`}>{schema.predecessorUid}</Link>
          ) : (
            'Nothing, this is an original schema'
          )}
        </dd>
      </dl>

      {(history.length > 0 || missingPredecessor) && (
        <>
          <h3 className="schema-details__history-title">Replacement history</h3>
          <ol className="schema-details__history">
            {history.map((earlier) => (
              <li key={earlier.uid}>
                <Link className="numeric" to={`?schema=${earlier.uid}`}>
                  {earlier.uid}
                </Link>
                <span className="numeric schema-details__history-definition">{earlier.definition}</span>
              </li>
            ))}
            {missingPredecessor && (
              <li>
                <span className="numeric">{missingPredecessor}</span>
                <span className="schema-details__history-definition">Not registered on this network</span>
              </li>
            )}
          </ol>
          {truncated && <p className="typo-text text-muted">Older schemas are not shown.</p>}
        </>
      )}
    </div>
  );
}
