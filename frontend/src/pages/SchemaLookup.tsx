import React, { useState } from 'react';
import './SchemaLookup.css';
import { Search, Shield, AlertCircle, FileText, CheckCircle } from 'lucide-react';
import { useSoroban } from '../context/useSoroban';
import { Button, Field } from '../components/ui';
import { Buffer } from 'buffer';

const SEEDED_SCHEMA_UID = "7648441cc4224ab7f6956fbce0502020c9583bc62611626ba833e37e8d3e18cd";

interface SchemaData {
  uid: string;
  authority: string;
  definition: string;
  revocable: boolean;
  restricted: boolean;
}

export const SchemaLookup: React.FC = () => {
  const { attest } = useSoroban();
  const [uid, setUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async (uidToSearch: string) => {
    const cleanUid = uidToSearch.trim();
    if (!cleanUid) {
      setError('Please enter a schema UID.');
      setSchema(null);
      return;
    }

    if (!/^[0-9a-fA-F]{64}$/.test(cleanUid)) {
      setError('UID must be a 64-character hexadecimal string.');
      setSchema(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const bufferUid = Buffer.from(cleanUid, 'hex');
      const res = await attest.get_schema({ uid: bufferUid });
      const rawSchema = res.result.unwrap();

      setSchema({
        uid: cleanUid,
        authority: rawSchema.authority,
        definition: rawSchema.definition,
        revocable: rawSchema.revocable,
        restricted: rawSchema.restricted,
      });
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('SchemaNotFound') || err.message?.includes('Error(Contract, #1)')) {
        setError('Schema not found. The entered UID does not exist on the Stellar network.');
      } else {
        setError('Failed to fetch schema. Please verify the network connection and try again.');
      }
      setSchema(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup(uid);
  };

  const useSeeded = () => {
    setUid(SEEDED_SCHEMA_UID);
    handleLookup(SEEDED_SCHEMA_UID);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Schema Lookup</h1>
        <p className="typo-text text-muted">Verify the exact rules and definitions that govern on-chain verifier attestations.</p>
      </header>

      <div className="glass-panel animate-fade-up" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <Field
                label="Schema UID (32-byte Hex)"
                placeholder="Enter 64-character hex UID..."
                value={uid}
                onChange={(e) => {
                  setUid(e.target.value);
                  setError(null);
                }}
                error={error}
                required
              />
            </div>
            <Button type="submit" loading={loading} icon={<Search size={18} />}>
              Lookup Schema
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-muted" style={{ fontSize: '0.9rem' }}>Quick test:</span>
            <button
              type="button"
              onClick={useSeeded}
              className="btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: 'auto', minHeight: 'auto' }}
            >
              Seeded Testnet Schema
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="glass-panel animate-fade-up" style={{ padding: '3rem', textAlign: 'center' }}>
          <span className="ui-spinner" style={{ fontSize: '2rem', margin: '0 auto var(--space-4) auto', color: 'var(--color-primary-light)' }} />
          <h3>Fetching Schema...</h3>
          <p className="text-muted">Querying the Soroban contract for details.</p>
        </div>
      )}

      {!loading && schema && (
        <div className="glass-panel animate-fade-up schema-details-panel" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '1.5rem' }}>
            <FileText size={32} style={{ color: 'var(--color-primary-light)' }} />
            <div>
              <h2 style={{ margin: 0 }}>Schema Details</h2>
              <code style={{ fontSize: '0.85rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{schema.uid}</code>
            </div>
          </div>

          <div className="schema-properties" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Definition</h3>
              <div style={{ padding: '1.5rem', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: '1.1rem', whiteSpace: 'pre-wrap' }}>{schema.definition}</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Authority</h3>
                <code style={{ wordBreak: 'break-all', fontSize: '0.95rem', color: 'var(--text-main)' }}>{schema.authority}</code>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  The wallet or multisig account that registered this schema template on the ledger.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Attestation Rights</h3>
                {schema.restricted ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                      <Shield size={18} /> Restricted to Authority
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>
                      <strong>Only</strong> the schema authority (<code style={{ fontSize: '0.75rem' }}>{schema.authority.slice(0, 8)}...</code>) is permitted to write attestations under this template. Submissions from any other account will fail.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 600 }}>
                      <CheckCircle size={18} /> Public / Unrestricted
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>
                      <strong>Any</strong> public address or verifier is permitted to issue attestations under this schema. Integrations gating value are responsible for checking that they trust the specific attester's address.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Revocability</h3>
                {schema.revocable ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                      <AlertCircle size={18} /> Revocable Claims Allowed
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>
                      Attestations created under this schema **can be revoked** (cancelled) by the issuer in the future if claims are no longer valid (e.g. academic status changes or violations occur).
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 600 }}>
                      <CheckCircle size={18} /> Permanent / Irrevocable
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>
                      Attestations created under this schema are **immutable**. Once signed and recorded on the ledger, they cannot be undone or revoked under any circumstances.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
