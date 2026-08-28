import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { useContractResult } from '../hooks';
import { useSoroban } from '../context/useSoroban';
import { AsyncView } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field } from '../components/ui';
import './AttestationLookup.css';

const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

const formatDate = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleString();

function CheckRow({
  pass,
  label,
  detail,
}: {
  pass: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="attest-check">
      <span
        className={`attest-check__icon ${pass ? 'attest-check__icon--pass' : 'attest-check__icon--fail'}`}
        aria-hidden="true"
      >
        {pass ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
      <div className="attest-check__body">
        <p className="attest-check__title">{label}</p>
        <p className="attest-check__detail">{detail}</p>
      </div>
      <Badge tone={pass ? 'success' : 'danger'}>{pass ? 'Pass' : 'Fail'}</Badge>
    </div>
  );
}

/**
 * Attestation lookup and verification.
 *
 * Paste a uid to see the full attestation record and its schema, then
 * optionally provide subject, schema uid and attester to run all four checks
 * that verify() combines — each reported independently so a refusal is
 * actionable.
 */
export const AttestationLookup = () => {
  const { attest } = useSoroban();

  // --- uid lookup ---
  const [uidInput, setUidInput] = useState('');
  const [uid, setUid] = useState<Buffer | null>(null);
  const [uidError, setUidError] = useState<string | null>(null);

  // --- optional verify inputs ---
  const [subjectInput, setSubjectInput] = useState('');
  const [schemaInput, setSchemaInput] = useState('');
  const [attesterInput, setAttesterInput] = useState('');
  const [verifyTriggered, setVerifyTriggered] = useState(false);

  const attestation = useContractResult(
    () => attest.get({ uid: uid! }),
    [attest, uid],
    { enabled: uid !== null },
  );

  const schema = useContractResult(
    () =>
      attestation.data
        ? attest.get_schema({ uid: attestation.data.schema })
        : Promise.reject(new Error('no attestation')),
    [attest, attestation.data],
    { enabled: attestation.data !== null },
  );

  const handleLookup = () => {
    const raw = uidInput.trim().replace(/^0x/i, '');
    if (!HEX_32_BYTES.test(uidInput.trim())) {
      setUidError('Enter a 32-byte hex UID (64 hex characters).');
      return;
    }
    setUidError(null);
    setUid(Buffer.from(raw, 'hex'));
    setVerifyTriggered(false);
  };

  // --- derived check results ---
  // Reading the clock during render is impure — two renders would disagree.
  // Ticking it as state matches ProgrammeDetail and keeps expiry honest
  // without a refresh.
  const [nowSeconds, setNowSeconds] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const interval = window.setInterval(
      () => setNowSeconds(BigInt(Math.floor(Date.now() / 1000))),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);
  const a = attestation.data;

  const checkLive = a
    ? a.revoked_at === null || a.revoked_at === undefined
    : null;

  const checkNotExpired = a
    ? a.expires_at === null || a.expires_at === undefined || a.expires_at > nowSeconds
    : null;

  const verifySubject = subjectInput.trim();
  const verifySchema = schemaInput.trim().replace(/^0x/i, '');
  const verifyAttester = attesterInput.trim();

  const canVerify =
    STELLAR_ADDRESS.test(verifySubject) &&
    HEX_32_BYTES.test(schemaInput.trim()) &&
    STELLAR_ADDRESS.test(verifyAttester);

  const checkSubject = verifyTriggered && a ? a.subject === verifySubject : null;
  const checkSchema =
    verifyTriggered && a
      ? a.schema.toString('hex') === verifySchema
      : null;
  const checkAttester =
    verifyTriggered && a ? a.attester === verifyAttester : null;

  return (
    <div className="attest-lookup">
      <header className="attest-lookup__header">
        <h1>Attestation Lookup</h1>
        <p className="typo-text text-muted">
          Look up an attestation by UID, see its schema, and verify each of the
          four checks separately — validity, expiry, subject, schema, and
          attester. A refusal that tells you which check failed tells you what
          to fix.
        </p>
      </header>

      <Card title="Look up by UID">
        <div className="attest-search">
          <Field
            label="Attestation UID"
            placeholder="32-byte hex (64 characters)"
            value={uidInput}
            onChange={(e) => {
              setUidInput(e.target.value);
              setUidError(null);
            }}
            error={uidError ?? undefined}
          />
          <div className="attest-search__actions">
            <Button onClick={handleLookup} disabled={!uidInput.trim()}>
              Look up
            </Button>
          </div>
        </div>
      </Card>

      {uid !== null && (
        <AsyncView
          {...attestation}
          onRetry={attestation.refetch}
          contract="attest"
          empty={{ title: 'Attestation not found', description: 'No attestation exists for this UID.' }}
        >
          {(a) => {
            const isRevoked =
              a.revoked_at !== null && a.revoked_at !== undefined;
            const isExpired =
              !isRevoked &&
              a.expires_at !== null &&
              a.expires_at !== undefined &&
              a.expires_at <= nowSeconds;

            return (
              <>
                <Card
                  title="Attestation"
                  aside={
                    isRevoked ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : isExpired ? (
                      <Badge tone="neutral">Expired</Badge>
                    ) : (
                      <Badge tone="success">Live</Badge>
                    )
                  }
                >
                  <div className="attest-detail-grid">
                    <div className="attest-field">
                      <span className="attest-field__label">UID</span>
                      <span className="attest-field__value attest-field__value--mono">
                        {a.uid.toString('hex')}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Attester</span>
                      <span className="attest-field__value attest-field__value--mono">
                        {a.attester}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Subject</span>
                      <span className="attest-field__value attest-field__value--mono">
                        {a.subject}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Schema UID</span>
                      <span className="attest-field__value attest-field__value--mono">
                        {a.schema.toString('hex')}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Data hash</span>
                      <span className="attest-field__value attest-field__value--mono">
                        {a.data_hash.toString('hex')}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Created</span>
                      <span className="attest-field__value">
                        {formatDate(a.created_at)}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Expires</span>
                      <span className="attest-field__value">
                        {a.expires_at !== null && a.expires_at !== undefined
                          ? formatDate(a.expires_at)
                          : 'Never'}
                      </span>
                    </div>
                    <div className="attest-field">
                      <span className="attest-field__label">Revoked at</span>
                      <span className="attest-field__value">
                        {a.revoked_at !== null && a.revoked_at !== undefined
                          ? formatDate(a.revoked_at)
                          : '—'}
                      </span>
                    </div>
                  </div>
                </Card>

                <AsyncView
                  {...schema}
                  onRetry={schema.refetch}
                  contract="attest"
                  empty={{ title: 'Schema not found', description: 'The schema this attestation was made under could not be resolved.' }}
                >
                  {(s) => (
                    <Card title="Schema">
                      <div className="attest-detail-grid">
                        <div className="attest-field">
                          <span className="attest-field__label">UID</span>
                          <span className="attest-field__value attest-field__value--mono">
                            {s.uid.toString('hex')}
                          </span>
                        </div>
                        <div className="attest-field">
                          <span className="attest-field__label">Authority</span>
                          <span className="attest-field__value attest-field__value--mono">
                            {s.authority}
                          </span>
                        </div>
                        <div className="attest-field">
                          <span className="attest-field__label">Revocable</span>
                          <span className="attest-field__value">
                            {s.revocable ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="attest-field">
                          <span className="attest-field__label">Restricted</span>
                          <span className="attest-field__value">
                            {s.restricted ? 'Yes — only authority may attest' : 'No — open to any attester'}
                          </span>
                        </div>
                      </div>
                      {s.definition && (
                        <div className="attest-schema-def">
                          <h3>Definition</h3>
                          <p className="attest-schema-def__text">{s.definition}</p>
                        </div>
                      )}
                    </Card>
                  )}
                </AsyncView>

                <Card title="Validity checks">
                  <p className="attest-verify-intro">
                    These are the four checks <code>verify(uid, subject, schema,
                    attester)</code> combines. Each is reported separately because
                    "invalid" alone does not say what to fix.
                  </p>

                  <div className="attest-checks">
                    <CheckRow
                      pass={checkLive === true}
                      label="Not revoked"
                      detail={
                        isRevoked
                          ? `Revoked at ${formatDate(a.revoked_at!)}`
                          : 'No revocation on record.'
                      }
                    />
                    <CheckRow
                      pass={checkNotExpired === true}
                      label="Not expired"
                      detail={
                        isExpired
                          ? `Expired at ${formatDate(a.expires_at!)}`
                          : a.expires_at !== null && a.expires_at !== undefined
                          ? `Expires ${formatDate(a.expires_at)}`
                          : 'No expiry set — does not expire on its own.'
                      }
                    />
                  </div>

                  <div className="attest-verify-grid" style={{ marginTop: 'var(--space-5)' }}>
                    <p className="attest-verify-intro" style={{ marginBottom: 0 }}>
                      To check the remaining two conditions — that this attestation
                      is about the right subject, under the right schema, from the
                      right attester — provide the expected values and run the check.
                    </p>
                    <Field
                      label="Expected subject (Stellar address)"
                      placeholder="G..."
                      value={subjectInput}
                      onChange={(e) => {
                        setSubjectInput(e.target.value);
                        setVerifyTriggered(false);
                      }}
                      hint="The recipient this attestation should be about."
                    />
                    <Field
                      label="Expected schema UID"
                      placeholder="32-byte hex (64 characters)"
                      value={schemaInput}
                      onChange={(e) => {
                        setSchemaInput(e.target.value);
                        setVerifyTriggered(false);
                      }}
                      hint="The claim template this attestation must be under."
                    />
                    <Field
                      label="Expected attester (Stellar address)"
                      placeholder="G..."
                      value={attesterInput}
                      onChange={(e) => {
                        setAttesterInput(e.target.value);
                        setVerifyTriggered(false);
                      }}
                      hint="The verifier who must have signed this attestation."
                    />
                    <div>
                      <Button
                        icon={<ShieldCheck size={16} />}
                        onClick={() => setVerifyTriggered(true)}
                        disabled={!canVerify}
                      >
                        Check subject, schema &amp; attester
                      </Button>
                    </div>
                  </div>

                  {verifyTriggered && (
                    <div className="attest-checks" style={{ marginTop: 'var(--space-4)' }}>
                      <CheckRow
                        pass={checkSubject === true}
                        label="Correct subject"
                        detail={
                          checkSubject
                            ? `Subject matches: ${a.subject}`
                            : `Expected ${verifySubject}, got ${a.subject}`
                        }
                      />
                      <CheckRow
                        pass={checkSchema === true}
                        label="Correct schema"
                        detail={
                          checkSchema
                            ? `Schema matches: ${a.schema.toString('hex')}`
                            : `Expected ${verifySchema}, got ${a.schema.toString('hex')}`
                        }
                      />
                      <CheckRow
                        pass={checkAttester === true}
                        label="Correct attester"
                        detail={
                          checkAttester
                            ? `Attester matches: ${a.attester}`
                            : `Expected ${verifyAttester}, got ${a.attester}`
                        }
                      />

                      <div
                        style={{
                          marginTop: 'var(--space-3)',
                          padding: 'var(--space-3) var(--space-4)',
                          borderRadius: 'var(--radius-md)',
                          background:
                            checkSubject && checkSchema && checkAttester && checkLive && checkNotExpired
                              ? 'rgba(34,197,94,0.08)'
                              : 'rgba(239,68,68,0.08)',
                          border: `1px solid ${checkSubject && checkSchema && checkAttester && checkLive && checkNotExpired ? 'var(--color-success, #22c55e)' : 'var(--color-error, #ef4444)'}`,
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 600 }}>
                          {checkSubject &&
                          checkSchema &&
                          checkAttester &&
                          checkLive &&
                          checkNotExpired
                            ? 'verify() would return true — all four conditions pass.'
                            : 'verify() would return false — one or more conditions fail.'}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              </>
            );
          }}
        </AsyncView>
      )}
    </div>
  );
};
