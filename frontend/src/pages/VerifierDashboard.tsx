import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Wallet } from 'lucide-react';
import './VerifierDashboard.css';
import { useWallet } from '../context/useWallet';
import { useProgrammeParam } from '../hooks/useProgrammeParam';
import { usePageTitle } from '../hooks/usePageTitle';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { looksLikeAddress, truncateAddress } from '../lib/format';
import { formatAgo, shortId } from '../lib/programmeView';
import { isProgrammeContractId } from '../lib/registryVerification';
import {
  claimKey,
  forgetRequest,
  loadRequests,
  loadSigned,
  parseRequest,
  rememberRequest,
  rememberSigned,
  type SignedRecord,
  type StoredRequest,
} from '../lib/verifyLinks';
import { Button, Field, Notice, PageHead, Segmented, Select, StatTile } from '../components/ui';
import { Empty } from '../components/state/AsyncStates';
import { SignInSheet } from '../components/layout/SignInSheet';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { ClaimReview, type Claim } from '../components/verifier/ClaimReview';
import { ReviewerVotes } from '../components/verifier/ReviewerVotes';
import { SignedAttestations } from '../components/verifier/SignedAttestations';
import { useMyRoles, type RoleProgramme } from '../components/verifier/useMyRoles';

type ClaimSource = 'requests' | 'lookup';
const OTHER = '__other';
const REQUEST_PARAMS = ['programme', 'recipient', 'tranche', 'note'];

/** The left-hand form for the verifier's own lookup: a programme and a recipient. */
function LookupForm({ verifierOf, onOpen }: { verifierOf: RoleProgramme[]; onOpen: (claim: Claim) => void }) {
  const [pick, setPick] = useState<string>('');
  const [other, setOther] = useState('');
  const [recipient, setRecipient] = useState('');
  const [errors, setErrors] = useState<{ programme?: string; recipient?: string }>({});
  const usingOther = verifierOf.length === 0 || pick === OTHER;
  const selected = usingOther ? other.trim() : pick || verifierOf[0]?.id || '';

  const open = () => {
    const next: typeof errors = {};
    if (!isProgrammeContractId(selected)) next.programme = 'Enter a valid programme contract address.';
    if (!looksLikeAddress(recipient.trim())) next.recipient = 'Enter the recipient’s Stellar address (starts with G).';
    setErrors(next);
    if (next.programme || next.recipient) return;
    onOpen({ programmeId: selected, recipient: recipient.trim(), tranche: null, note: '', source: 'lookup' });
  };

  return (
    <form
      className="verify-lookup"
      onSubmit={(event) => {
        event.preventDefault();
        open();
      }}
    >
      {verifierOf.length > 0 && (
        <Select
          label="Programme"
          options={[
            ...verifierOf.map((p) => ({ value: p.id, label: p.name ?? shortId(p.id) })),
            { value: OTHER, label: 'Another programme…' },
          ]}
          value={pick || verifierOf[0].id}
          onChange={(event) => setPick(event.target.value)}
          hint="Programmes where this address is a verifier, checked on the chain."
        />
      )}
      {usingOther && (
        <Field
          label="Programme address"
          placeholder="C…"
          value={other}
          onChange={(event) => setOther(event.target.value)}
          error={errors.programme}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <Field
        label="Recipient address"
        placeholder="G…"
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
        error={errors.recipient}
        hint="The person whose condition you checked."
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" variant="secondary" icon={<Search size={18} aria-hidden="true" />}>
        Open claim
      </Button>
    </form>
  );
}

/**
 * `/verifiers`: where a verifier confirms conditions, and where reviewers vote.
 *
 * Claims reach the review panel two ways, both live so they can be compared:
 *
 * - **Requests.** A recipient copies a request link from their award and sends
 *   it. Opening it puts the claim in this browser's list and opens it.
 * - **Look up.** The verifier picks a programme and pastes a recipient.
 *
 * Either way the panel reads everything from the chain before anything can be
 * signed. There is no server and no on-chain queue.
 */
export const VerifierDashboard = () => {
  usePageTitle('Verifier Dashboard');
  const { address } = useWallet();
  const programmeParam = useProgrammeParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const roles = useMyRoles(address);
  const [signInOpen, setSignInOpen] = useState(false);

  const linkRequest = parseRequest(searchParams);
  const linkKey = linkRequest ? claimKey(linkRequest) : null;
  const [mountedAt] = useState(() => Date.now());
  const [stored, setStored] = useState<StoredRequest[]>(() => loadRequests());

  // Remember a request link in this browser. The list shown merges it in
  // directly, so nothing waits on the write.
  useEffect(() => {
    if (linkRequest) rememberRequest(linkRequest);
    // Keyed on the claim, not the parsed object, which is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey, linkRequest?.tranche, linkRequest?.note]);

  const requests: StoredRequest[] =
    linkRequest && !stored.some((r) => claimKey(r) === linkKey)
      ? [{ ...linkRequest, openedAt: mountedAt }, ...stored]
      : stored.map((r) => (linkRequest && claimKey(r) === linkKey ? { ...r, ...linkRequest } : r));

  const [source, setSource] = useState<ClaimSource>('requests');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lookupClaim, setLookupClaim] = useState<Claim | null>(null);

  const selectedRequest =
    requests.find((r) => claimKey(r) === selectedKey) ??
    requests.find((r) => claimKey(r) === linkKey) ??
    requests[0] ??
    null;
  const claim: Claim | null =
    source === 'lookup' ? lookupClaim : selectedRequest ? { ...selectedRequest, source: 'request' } : null;

  // Attestations signed in this browser, for this address.
  const [signed, setSigned] = useState<{ address: string | null; list: SignedRecord[] }>(() => ({
    address,
    list: address ? loadSigned(address) : [],
  }));
  if (signed.address !== address) setSigned({ address, list: address ? loadSigned(address) : [] });

  const dropRequest = (target: { programmeId: string; recipient: string }) => {
    setStored(forgetRequest(target));
    if (claimKey(target) === linkKey) {
      const next = new URLSearchParams(searchParams);
      for (const key of REQUEST_PARAMS) next.delete(key);
      setSearchParams(next, { replace: true });
    }
    if (claimKey(target) === selectedKey) setSelectedKey(null);
  };

  const onDismiss = () => {
    if (!claim) return;
    if (claim.source === 'request') dropRequest(claim);
    else setLookupClaim(null);
  };

  const programmeName = (id: string) => roles.all?.find((p) => p.id === id)?.name ?? null;

  // The reviewer section starts on a `?programme=` link that isn't a request,
  // then a programme in Review where this address reviews, then the seeded one.
  const reviewerStart =
    !linkRequest && programmeParam.status === 'valid' && programmeParam.programmeId
      ? programmeParam.programmeId
      : (roles.reviewerOf[0]?.id ?? DEMO_PROGRAMME_ID);

  const head = (
    <PageHead
      eyebrow="Verify"
      title="Waiting for your confirmation"
      action={
        <Link to="/attestations" className="ui-button ui-button--ghost ui-button--md">
          Look up an attestation
        </Link>
      }
    >
      <p>Each signature unlocks exactly one tranche for one person. Only sign what you checked yourself.</p>
    </PageHead>
  );

  if (!address) {
    return (
      <div className="verify">
        {head}
        {linkRequest && (
          <Notice tone="info">
            A recipient sent you a claim to confirm for{' '}
            <b className="numeric">{truncateAddress(linkRequest.recipient)}</b>. Sign in with your verifier address
            to review it.
          </Notice>
        )}
        <Empty
          title="Confirm conditions and unlock payments"
          description="Sign in with the address a programme trusts as its verifier to review claims. Anyone can look up an attestation without signing in."
          action={
            <>
              <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={() => setSignInOpen(true)}>
                Sign in with Freighter
              </Button>
              <Link to="/directory" className="ui-button ui-button--ghost ui-button--md">
                Browse programmes
              </Link>
            </>
          }
        />
        <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
      </div>
    );
  }

  const inReview = roles.reviewerOf.filter((p) => p.phase === 'Review').length;

  return (
    <div className="verify">
      {head}
      <ProgrammeParamNotice state={programmeParam} />

      <div className="ui-stat-tiles" role="list" aria-label="Verification summary">
        <div role="listitem">
          <StatTile label="Requests waiting" value={requests.length} hint="Opened in this browser" highlight />
        </div>
        <div role="listitem">
          <StatTile
            label="Verifier in"
            value={roles.mine ? roles.verifierOf.length : '—'}
            hint={roles.mine ? 'Programmes, checked on the chain' : 'Checking your roles…'}
          />
        </div>
        <div role="listitem">
          <StatTile
            label="Reviewer in"
            value={roles.mine ? roles.reviewerOf.length : '—'}
            hint={roles.mine ? `${inReview} in Review now` : 'Checking your roles…'}
          />
        </div>
        <div role="listitem">
          <StatTile label="Signed here" value={signed.list.length} hint="Attestations from this browser" />
        </div>
      </div>

      <div className="verify__grid">
        <section className="verify__section verify__claims" aria-labelledby="claims-title">
          <div className="verify__claims-head">
            <h2 id="claims-title" className="verify__h2">
              Claims to confirm
            </h2>
            <Segmented
              label="Where claims come from"
              value={source}
              onChange={setSource}
              options={[
                { value: 'requests', label: 'Requests', count: requests.length },
                { value: 'lookup', label: 'Look up a recipient' },
              ]}
            />
          </div>

          {source === 'requests' ? (
            requests.length === 0 ? (
              <Empty
                title="No requests yet"
                description="A recipient can copy a request link from their award and send it to you. Opening it puts the claim here, in this browser only. You can also look up a recipient yourself."
                action={
                  <Button variant="secondary" onClick={() => setSource('lookup')}>
                    Look up a recipient
                  </Button>
                }
              />
            ) : (
              <ul className="claims" aria-label="Requests">
                {requests.map((r) => {
                  const key = claimKey(r);
                  const current = selectedRequest !== null && claimKey(selectedRequest) === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="claim"
                        aria-current={current ? 'true' : undefined}
                        onClick={() => setSelectedKey(key)}
                      >
                        <span className="claim__sign numeric" aria-hidden="true">
                          {r.tranche !== null ? String(r.tranche).padStart(2, '0') : '··'}
                        </span>
                        <span className="claim__text">
                          <b>{programmeName(r.programmeId) ?? shortId(r.programmeId)}</b>
                          <span>
                            <span className="numeric">{truncateAddress(r.recipient)}</span>
                            {r.tranche !== null && ` · tranche ${r.tranche}`}
                          </span>
                          {r.note && <span className="claim__note">“{r.note}”</span>}
                        </span>
                        <span className="claim__age numeric">{formatAgo(Math.max(0, mountedAt - r.openedAt))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <LookupForm
              verifierOf={roles.verifierOf}
              onOpen={(next) => {
                setLookupClaim(next);
              }}
            />
          )}
        </section>

        <aside className="verify__aside" aria-label="Review">
          {claim ? (
            <ClaimReview
              key={`${claim.source}:${claimKey(claim)}`}
              claim={claim}
              programmeName={programmeName(claim.programmeId)}
              onSigned={(record) => setSigned({ address, list: rememberSigned(record) })}
              onFinished={() => {
                if (claim.source === 'request') dropRequest(claim);
              }}
              onDismiss={onDismiss}
            />
          ) : (
            <div className="claim-review claim-review--idle">
              <p className="claim-review__eyebrow">Review claim</p>
              <p>
                {source === 'lookup'
                  ? 'Choose a programme and a recipient to open their claim here.'
                  : 'Choose a request to review it here.'}{' '}
                Every fact is read from the chain before you can sign.
              </p>
            </div>
          )}
        </aside>

        <div className="verify__votes">
          <ReviewerVotes
            reviewerOf={roles.reviewerOf}
            allProgrammes={roles.all}
            initialProgrammeId={reviewerStart}
          />
        </div>

        <div className="verify__signed">
          <SignedAttestations attester={address} records={signed.list} allProgrammes={roles.all} />
        </div>
      </div>
    </div>
  );
};
