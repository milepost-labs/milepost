import { useState } from 'react';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { VERTICALS, checkDocumentText, type ProgrammeMetadata, type ResolvedMetadata } from '../../lib/metadata';
import { Button, Field, Notice } from '../ui';
import './ProgrammeDescription.css';

function sectorLabel(vertical: string): string {
  return VERTICALS.find((v) => v.value === vertical)?.label ?? vertical;
}

/** The creator's description under the programme's header, once verified. */
export function DescriptionBand({ doc }: { doc: ProgrammeMetadata }) {
  return (
    <section className="programme-description" aria-label="Description">
      <p className="programme-description__text">{doc.description}</p>
      <p className="programme-description__meta">
        <span className="programme-description__sector">{sectorLabel(doc.vertical)}</span>
        <span>
          <CheckCircle2 size={14} aria-hidden="true" /> Written by the creator, checked against the hash on the chain
        </span>
      </p>
    </section>
  );
}

function DocumentFields({ doc }: { doc: ProgrammeMetadata }) {
  return (
    <dl className="metadata-doc">
      <div className="metadata-doc__field">
        <dt>Name</dt>
        <dd>{doc.name}</dd>
      </div>
      <div className="metadata-doc__field">
        <dt>Sector</dt>
        <dd>{sectorLabel(doc.vertical)}</dd>
      </div>
      <div className="metadata-doc__field">
        <dt>Contact</dt>
        <dd>
          {doc.contact.name} · <a href={`mailto:${doc.contact.email}`}>{doc.contact.email}</a>
          {doc.contact.url && (
            <>
              {' '}
              ·{' '}
              <a href={doc.contact.url} target="_blank" rel="noopener noreferrer">
                {doc.contact.url}
              </a>
            </>
          )}
        </dd>
      </div>
      {doc.links && doc.links.length > 0 && (
        <div className="metadata-doc__field">
          <dt>Links</dt>
          <dd>
            <ul className="metadata-doc__links">
              {doc.links.map((link, i) => (
                <li key={i}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label} <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      {doc.labels && doc.labels.length > 0 && (
        <div className="metadata-doc__field">
          <dt>Names for addresses</dt>
          <dd>
            {doc.labels.length} reviewer and verifier name{doc.labels.length === 1 ? '' : 's'}, shown in the Verifiers tab
          </dd>
        </div>
      )}
      <div className="metadata-doc__field">
        <dt>Document version</dt>
        <dd className="numeric">{doc.schema_version}</dd>
      </div>
    </dl>
  );
}

/**
 * Fetch a document from a URL someone gives, for programmes whose document
 * isn't in the store. Held to the same commitment.
 */
function FromUrl({ committedHash }: { committedHash: string }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ResolvedMetadata | 'fetching' | null>(null);

  const fetchIt = async () => {
    const target = url.trim();
    if (!target) return;
    setState('fetching');
    try {
      const res = await fetch(target);
      if (!res.ok) {
        setState({ status: 'unavailable', reason: `The server answered ${res.status}.` });
        return;
      }
      setState(await checkDocumentText(await res.text(), committedHash));
    } catch {
      setState({ status: 'unavailable', reason: 'Could not fetch that address.' });
    }
  };

  return (
    <div className="metadata-url">
      <div className="metadata-url__row">
        <Field
          label="Document address"
          placeholder="https://…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setState(null);
          }}
          hint="If the creator hosts the description elsewhere, paste its address. It is checked against the hash first."
        />
        <Button
          variant="secondary"
          icon={<FileText size={16} aria-hidden="true" />}
          onClick={() => void fetchIt()}
          disabled={!url.trim() || state === 'fetching'}
          loading={state === 'fetching'}
          loadingLabel="Fetching…"
        >
          Fetch and check
        </Button>
      </div>
      {state && state !== 'fetching' && <Outcome result={state} committedHash={committedHash} />}
    </div>
  );
}

function Outcome({ result, committedHash }: { result: ResolvedMetadata; committedHash: string }) {
  switch (result.status) {
    case 'ok':
      return (
        <div className="metadata-ok">
          <Notice tone="ok">
            <span>
              <strong>Checked.</strong> This document hashes to the programme’s commitment.
            </span>
          </Notice>
          <DocumentFields doc={result.doc} />
        </div>
      );
    case 'mismatch':
      return (
        <Notice tone="risk" role="alert">
          <span>
            <strong>Refused: the document doesn’t match.</strong> It hashes to{' '}
            <span className="numeric">{result.fetchedHash.slice(0, 12)}…</span>, not the commitment{' '}
            <span className="numeric">{committedHash.slice(0, 12)}…</span>, so it isn’t shown.
          </span>
        </Notice>
      );
    case 'malformed':
      return (
        <Notice tone="warn" role="alert">
          <span>
            <strong>Not a valid description.</strong> {result.reason}
          </span>
        </Notice>
      );
    case 'unavailable':
      return (
        <Notice tone="warn" role="alert">
          <span>
            <strong>Description unavailable.</strong> {result.reason} The programme works without it; only the words are
            missing.
          </span>
        </Notice>
      );
    default:
      return null;
  }
}

/** The description's place in "On the chain": what was committed, and whether it could be checked. */
export function MetadataPanel({ committedHash, resolved }: { committedHash: string; resolved: ResolvedMetadata | null }) {
  if (resolved === null) return <p className="metadata-note">Looking up the description…</p>;
  if (resolved.status === 'none') {
    return (
      <p className="metadata-note">
        No description was committed: the programme was deployed with an empty metadata hash.
      </p>
    );
  }
  if (resolved.status === 'ok') return <Outcome result={resolved} committedHash={committedHash} />;
  return (
    <div className="metadata-fallback">
      {resolved.status === 'missing' ? (
        <p className="metadata-note">
          The Milepost description store has no document for this hash. The programme works without one.
        </p>
      ) : (
        <Outcome result={resolved} committedHash={committedHash} />
      )}
      {resolved.status !== 'mismatch' && <FromUrl committedHash={committedHash} />}
    </div>
  );
}
