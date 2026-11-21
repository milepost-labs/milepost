import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Buffer } from 'buffer';
import { Search, ShieldCheck, Wallet } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { useIndexedList } from '../hooks';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useTransaction } from '../hooks/useTransaction';
import { usePageTitle } from '../hooks/usePageTitle';
import { truncateAddress } from '../lib/format';
import { Badge, Button, CopyButton, DisabledReason, Field, PageHead, Receipt, TextArea } from '../components/ui';
import { Empty, ErrorState, Loading } from '../components/state/AsyncStates';
import { TxSheet } from '../components/state/TxSheet';
import { SignInSheet } from '../components/layout/SignInSheet';
import { lookupSchemaChain, parseSchemaUid, type SchemaRecord } from '../lib/schemaLookup';
import { SCHEMA_NAME_ERROR, buildSchemaDefinition, isValidSchemaName, type FixtureSchema } from '../fixtures/schemaFixtures';
import { restoreFromAssembled } from '../lib/restore';
import './RegisterSchema.css';

const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * `/schemas/register`: register what verifiers sign, and look any schema up.
 *
 * A schema on the chain is one `definition` string, a `revocable` flag, a
 * `restricted` flag and an optional predecessor. The form composes the
 * definition from a name (`lowercase-words/vN`, a convention checked before
 * signing) and a description of what signing means; the preview shows the
 * exact string that will be stored. Schemas registered here stay unrestricted:
 * any verifier may attest under them.
 *
 * Lookup by id works signed out and shows the replacement history; the id
 * lives in `?schema=` so each lookup has a link. The contract keeps no list of
 * schemas, so the only list here is the ones registered in this tab.
 */
export const RegisterSchema = () => {
  usePageTitle('Register a schema');
  const { address } = useWallet();
  const { attest } = useSoroban();
  const announce = useAnnouncer();
  const [signInOpen, setSignInOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [name, setName] = useState('');
  const [fields, setFields] = useState('');
  const [revocable, setRevocable] = useState(true);
  const [predecessor, setPredecessor] = useState('');
  const [sessionSchemas, setSessionSchemas] = useState<FixtureSchema[]>([]);

  const tx = useTransaction<Buffer>({
    contract: 'attest',
    onError: (error) => announce(`Schema not registered. ${error.message}`, 'alert'),
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const lookupUid = parseSchemaUid(searchParams.get('schema') ?? '');
  const [lookupInput, setLookupInput] = useState(lookupUid ?? '');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookup = useIndexedList(() => lookupSchemaChain((args) => attest.get_schema(args), lookupUid ?? ''), [attest, lookupUid], {
    enabled: lookupUid !== null,
  });

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
  const nameError = name !== '' && !isValidSchemaName(name) ? SCHEMA_NAME_ERROR : null;
  const predecessorError =
    predecessor.trim() !== '' && !HEX_32_BYTES.test(predecessor.trim())
      ? 'Enter a 32-byte hex UID (64 hex characters), or leave this empty.'
      : null;
  const reason =
    trimmedName === '' || nameError
      ? 'Name the schema, like shifts-confirmed/v1.'
      : fields.trim() === ''
        ? 'Say what signing means.'
        : predecessorError;
  const definition = buildSchemaDefinition(trimmedName || 'name/v1', fields.trim() || '…');

  const register = async () => {
    if (!address || reason || tx.busy) return;
    setSheetOpen(true);
    const def = buildSchemaDefinition(trimmedName, fields);
    const predecessorBuf =
      predecessor.trim() === '' ? undefined : Buffer.from(predecessor.trim().replace(/^0x/i, ''), 'hex');
    await tx.prepare(async () => {
      const built = await attest.register_schema({
        authority: address,
        definition: def,
        revocable,
        // Unrestricted: any verifier may attest under schemas registered here.
        restricted: false,
        predecessor: predecessorBuf,
      });
      const rawFee = (
        built as unknown as { simulationResponse?: { minResourceFee?: string | number | bigint } }
      ).simulationResponse?.minResourceFee;
      return {
        restore: restoreFromAssembled(built),
        estimatedFee: rawFee !== undefined ? BigInt(rawFee) : undefined,
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() as Buffer };
        },
      };
    });
  };

  const confirmRegister = async () => {
    const result = await tx.confirm();
    if (result !== null) {
      setSessionSchemas((prev) => [
        { uid: result.toString('hex'), name: trimmedName, fields: fields.trim(), revocable },
        ...prev,
      ]);
      announce('Schema registered.');
    }
  };

  const closeSheet = () => {
    setSheetOpen(false);
    if (tx.phase === 'success') {
      setName('');
      setFields('');
      setRevocable(true);
      setPredecessor('');
    }
    tx.reset();
  };

  const successUid = tx.result ? Buffer.from(tx.result).toString('hex') : null;

  return (
    <div className="register-schema">
      <PageHead eyebrow="Admin" title="Register a schema">
        <p>
          A schema is what a verifier signs: its name, what signing means, and whether it can be revoked. A programme
          can’t be deployed without one.
        </p>
      </PageHead>

      {address ? (
        <div className="register-schema__grid">
          <section className="register-schema__panel" aria-labelledby="schema-new">
            <h2 id="schema-new">New schema</h2>
            <Field
              label="Schema name"
              placeholder="shifts-confirmed/v1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError ?? undefined}
              hint="Lowercase words and a version. It can’t be changed later; register v2 instead."
              className="register-schema__mono"
              spellCheck={false}
            />
            <TextArea
              label="What does signing mean?"
              placeholder="The signer confirms the health worker completed the shifts listed for this month."
              value={fields}
              onChange={(e) => setFields(e.target.value)}
              rows={3}
              hint="Shown to verifiers beside “I checked this myself”. Write it for the person checking, years from now."
            />
            <label className="register-schema__check">
              <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} />
              <span>
                <b>Revocable</b>
                <span>
                  The signer can withdraw an attestation, which stops it being used again. It never claws back a tranche
                  already released. Recommended: mistakes happen. This choice is permanent.
                </span>
              </span>
            </label>
            <Field
              label="Supersedes (optional)"
              placeholder="Earlier schema id, 64 hex characters"
              value={predecessor}
              onChange={(e) => setPredecessor(e.target.value)}
              error={predecessorError ?? undefined}
              hint="Only that schema’s owner can link to it. The network refuses loops in the replacement history."
              className="register-schema__mono"
              spellCheck={false}
            />
            <div className="register-schema__actions">
              <Button
                icon={<ShieldCheck size={18} aria-hidden="true" />}
                disabled={Boolean(reason) || tx.busy}
                onClick={() => void register()}
              >
                Register schema
              </Button>
              {reason && <DisabledReason>{reason}</DisabledReason>}
              <p className="register-schema__fine">
                You become its owner, <span className="numeric">{truncateAddress(address)}</span>. Registering costs a
                network fee in XLM.
              </p>
            </div>
          </section>

          <aside className="register-schema__aside">
            <section className="register-schema__panel register-schema__panel--sunk" aria-labelledby="schema-preview">
              <h2 id="schema-preview">What will be stored</h2>
              <pre className="register-schema__preview numeric">{definition}</pre>
              <p className="register-schema__fine">
                {revocable ? 'Revocable' : 'Not revocable'} · any verifier may sign under it
                {predecessor.trim() && !predecessorError ? ' · supersedes an earlier schema' : ''}
              </p>
            </section>
            <section className="register-schema__panel" aria-labelledby="schema-session">
              <h2 id="schema-session">Registered in this tab</h2>
              {sessionSchemas.length === 0 ? (
                <p className="register-schema__fine">None yet. The network keeps no list of schemas; look any up by id below.</p>
              ) : (
                <ul className="register-schema__list">
                  {sessionSchemas.map((s) => (
                    <li key={s.uid}>
                      <b className="numeric">{s.name}</b>
                      <Badge tone={s.revocable ? 'warning' : 'neutral'}>{s.revocable ? 'Revocable' : 'Not revocable'}</Badge>
                      <Link className="numeric" title={s.uid} to={`?schema=${s.uid}`}>
                        {s.uid.slice(0, 10)}…{s.uid.slice(-6)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      ) : (
        <>
          <Empty
            title="Define what verifiers sign"
            description="Sign in to register a schema. Anyone can register one, and the connected address becomes the schema owner. Looking one up needs no sign-in."
            action={
              <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={() => setSignInOpen(true)}>
                Sign in with Freighter
              </Button>
            }
          />
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
        </>
      )}

      <section className="register-schema__panel" aria-labelledby="schema-lookup">
        <h2 id="schema-lookup">Look up a schema</h2>
        <form className="register-schema__row" onSubmit={handleLookup} noValidate>
          <Field
            label="Schema UID"
            placeholder="64 hex characters"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            error={lookupError ?? undefined}
            className="register-schema__mono"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="secondary" icon={<Search size={18} aria-hidden="true" />}>
            Look up
          </Button>
        </form>
        {lookupUid && lookup.loading && <Loading label="Reading the schema" rows={2} />}
        {lookupUid && Boolean(lookup.error) && !lookup.loading && (
          <ErrorState error={lookup.error} contract="attest" onRetry={lookup.refetch} />
        )}
        {lookupUid && !lookup.loading && !lookup.error && lookup.data === null && (
          <Empty title="No schema with that UID" description="Nothing is registered under it on this network. Check the UID." />
        )}
        {lookupUid && lookup.data && (
          <SchemaDetails
            schema={lookup.data.chain[0]}
            history={lookup.data.chain.slice(1)}
            missingPredecessor={lookup.data.missingPredecessor}
            truncated={lookup.data.truncated}
          />
        )}
      </section>

      <TxSheet
        open={sheetOpen}
        onClose={closeSheet}
        tx={tx}
        eyebrow="Schemas"
        pendingTitle="Registering the schema"
        doneTitle="Schema registered"
        doneText="Copy its id: it is what a programme is set up with when it’s deployed."
        doneRows={
          successUid
            ? [
                {
                  label: 'Schema id',
                  value: (
                    <span className="register-schema__uid">
                      <span title={successUid}>{successUid}</span>
                      <CopyButton value={successUid} label="Copy schema UID" />
                    </span>
                  ),
                },
              ]
            : undefined
        }
        onConfirm={() => void confirmRegister()}
        failTitle="Schema not registered"
        onRetry={() => void register()}
      />
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
      <Receipt
        rows={[
          {
            label: 'UID',
            value: (
              <span className="register-schema__uid">
                <span title={schema.uid}>
                  {schema.uid.slice(0, 12)}…{schema.uid.slice(-8)}
                </span>
                <CopyButton value={schema.uid} label="Copy schema UID" />
              </span>
            ),
          },
          { label: 'Definition', value: schema.definition },
          { label: 'Owner', value: <span title={schema.authority}>{truncateAddress(schema.authority, 6, 6)}</span> },
          {
            label: 'Revocation',
            value: schema.revocable ? 'Attesters can revoke under it' : 'Can never be revoked',
            text: true,
          },
          { label: 'Who may sign', value: schema.restricted ? 'Only the owner' : 'Any verifier', text: true },
          {
            label: 'Supersedes',
            value: schema.predecessorUid ? (
              <Link to={`?schema=${schema.predecessorUid}`} title={schema.predecessorUid}>
                {schema.predecessorUid.slice(0, 12)}…
              </Link>
            ) : (
              'Nothing: an original schema'
            ),
            text: !schema.predecessorUid,
          },
        ]}
      />
      {(history.length > 0 || missingPredecessor) && (
        <>
          <h3 className="schema-details__history-title">Replacement history</h3>
          <ol className="schema-details__history">
            {history.map((earlier) => (
              <li key={earlier.uid}>
                <Link className="numeric" to={`?schema=${earlier.uid}`} title={earlier.uid}>
                  {earlier.uid.slice(0, 12)}…
                </Link>
                <span className="numeric">{earlier.definition}</span>
              </li>
            ))}
            {missingPredecessor && (
              <li>
                <span className="numeric">{missingPredecessor.slice(0, 12)}…</span>
                <span>Not registered on this network</span>
              </li>
            )}
          </ol>
          {truncated && <p className="register-schema__fine">Older schemas are not shown.</p>}
        </>
      )}
    </div>
  );
}
