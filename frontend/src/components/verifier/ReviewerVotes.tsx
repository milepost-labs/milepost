import { useId, useMemo, useState } from 'react';
import type { Application } from '@milepost/program';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { explain } from '../../lib/errors';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { formatIn } from '../../lib/funding';
import { validateAmount } from '../../lib/amount';
import { programmeAsset, shortId } from '../../lib/programmeView';
import { isProgrammeContractId } from '../../lib/registryVerification';
import { FIXTURE_REVIEW_APPLICANTS, type ApplicantFixture } from '../../fixtures/reviewFixtures';
import { Badge, Button, DisabledReason, Field, Modal, PhaseBadge, SampleTag, Select } from '../ui';
import { ErrorPanel } from '../state/AsyncStates';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import type { RoleProgramme } from './useMyRoles';

const OTHER = '__other';

interface VoteRowProps {
  programmeId: string;
  applicant: ApplicantFixture;
  /** Why voting is unavailable for the whole programme, or null. */
  gate: string | null;
}

/**
 * One applicant: what they asked for, how many votes are in, and the
 * reviewer's amount. The vote goes out in a sheet like every other write.
 * The contract keeps one vote per reviewer, so voting again replaces it.
 */
function VoteRow({ programmeId, applicant, gate }: VoteRowProps) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const inputId = useId();
  const errorId = useId();
  const asset = programmeAsset({ sample: false });
  const programme = programmeAt(programmeId);
  const [amount, setAmount] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const read = useContractResult<Application>(
    () => programme.get_application({ applicant: applicant.address }),
    [programme, applicant.address],
    { contract: 'program' },
  );
  const tx = useTransaction<void>({
    contract: 'program',
    onSuccess: () => read.refetch(),
    onError: (error) => announce(error.message, 'alert'),
  });
  const application = read.data;
  // "No application from this address" is an answer, not a failure.
  const readError = read.error ? explain(read.error, 'program') : null;
  const noApplication = readError?.kind === 'none';
  const closed = application ? application.finalized || application.withdrawn : false;

  const vote = async () => {
    setInputError(null);
    if (gate || !address || !application) return;
    const parsed = validateAmount(amount, { asset });
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    if (parsed.value > application.requested) {
      setInputError('The approved amount cannot exceed what the applicant requested.');
      return;
    }
    setSheetOpen(true);
    const result = await tx.send(async () => {
      const assembled = await programme.review({
        reviewer: address,
        applicant: applicant.address,
        approved: parsed.value,
      });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result !== null) announce(`Review vote submitted for ${truncateAddress(applicant.address)}.`);
  };

  const closeSheet = () => {
    if (tx.busy) return;
    setSheetOpen(false);
    if (tx.phase === 'success') setAmount('');
    tx.reset();
  };

  let status: string;
  if (read.loading) status = 'Reading the application…';
  else if (noApplication) status = 'No application from this address';
  else if (!application) status = '';
  else if (application.finalized) status = 'Finalized';
  else if (application.withdrawn) status = 'Withdrawn';
  else {
    const votes = application.votes.length;
    status = `Asked for ${formatIn(application.requested, asset)} · ${votes} ${votes === 1 ? 'vote' : 'votes'} in`;
  }

  return (
    <li className="vote-row">
      <div className="vote-row__who">
        <b>{applicant.label}</b>
        <span className="numeric" title={applicant.address}>
          {truncateAddress(applicant.address, 6, 4)}
        </span>
        {status && <span className="vote-row__status">{status}</span>}
      </div>
      {readError && !noApplication ? (
        <div className="vote-row__error">
          <ErrorPanel explained={readError} onRetry={read.refetch} live={false} />
        </div>
      ) : (
        <>
          <div className="vote-row__amount">
            <label className="visually-hidden" htmlFor={inputId}>
              Amount to approve for {truncateAddress(applicant.address)}
            </label>
            <div className={`ui-field__control${inputError ? ' ui-field__control--error' : ''}`}>
              <input
                id={inputId}
                className="numeric"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                disabled={closed || !application}
                aria-invalid={inputError ? true : undefined}
                aria-describedby={inputError ? errorId : undefined}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setInputError(null);
                }}
              />
              <span className="ui-field__suffix">{asset}</span>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(gate) || closed || !application}
            onClick={() => void vote()}
          >
            Vote
          </Button>
        </>
      )}
      {inputError && (
        <p id={errorId} className="vote-row__invalid" role="alert">
          {inputError}
        </p>
      )}

      <Modal
        open={sheetOpen}
        onClose={closeSheet}
        busy={tx.busy}
        eyebrow="Review"
        title={tx.phase === 'success' ? 'Vote recorded' : 'Cast your vote'}
      >
        {tx.phase === 'success' ? (
          <TxDone
            title="Review vote submitted"
            rows={[
              { label: 'Applicant', value: truncateAddress(applicant.address) },
              ...(application ? [{ label: 'Votes in', value: String(application.votes.length) }] : []),
            ]}
            actions={<Button onClick={closeSheet}>Done</Button>}
          >
            <p>You can change it by voting again until the award is finalized.</p>
          </TxDone>
        ) : tx.error && !tx.busy ? (
          <TxFailed
            title="Vote not recorded"
            explained={tx.error}
            onRetry={() => void vote()}
            actions={
              <Button variant="secondary" onClick={closeSheet}>
                Close
              </Button>
            }
          />
        ) : (
          <TxPending title={`Voting for ${truncateAddress(applicant.address)}`} phase={tx.phase} />
        )}
      </Modal>
    </li>
  );
}

interface ReviewerVotesProps {
  /** Programmes where this address is a reviewer, Review-phase first. */
  reviewerOf: RoleProgramme[];
  /** Every indexed programme, for names. Null while loading. */
  allProgrammes: RoleProgramme[] | null;
  /** The programme to start on: a `?programme=` link, or the seeded one. */
  initialProgrammeId: string;
}

/**
 * Reviewers approve an amount up to each applicant's request. The contract
 * keeps no list of applications, so the applicants here are ones remembered
 * in this session (plus the sample shortcuts), each re-read on the chain.
 */
export function ReviewerVotes({ reviewerOf, allProgrammes, initialProgrammeId }: ReviewerVotesProps) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const reasonId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherInput, setOtherInput] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);
  const [applicantInput, setApplicantInput] = useState('');
  const [applicantError, setApplicantError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, ApplicantFixture[]>>({});

  const programmeId = chosen ?? initialProgrammeId;
  const programme = useMemo(() => programmeAt(programmeId), [programmeAt, programmeId]);
  const name = allProgrammes?.find((p) => p.id === programmeId)?.name ?? null;

  const isReviewerRead = useContractRead(
    () => programme.is_reviewer({ addr: address ?? '' }),
    [programme, address],
    { contract: 'program', enabled: Boolean(address) },
  );
  const phaseRead = useContractResult(() => programme.get_phase(), [programme], { contract: 'program' });
  const phase = phaseRead.data?.tag ?? null;

  const samples = FIXTURE_REVIEW_APPLICANTS[programmeId] ?? [];
  const applicants = [...(added[programmeId] ?? []), ...samples];

  const gate = !address
    ? 'Connect a reviewer wallet first.'
    : phaseRead.loading && !phaseRead.data
      ? 'Reading the programme phase…'
      : phaseRead.error
        ? explain(phaseRead.error, 'program').message
        : phase !== 'Review'
          ? `Voting is available only during Review. This programme is ${phase ?? 'not readable'}.`
          : isReviewerRead.loading
            ? 'Checking whether this wallet is a reviewer for the programme…'
            : !isReviewerRead.data
              ? 'The connected wallet is not a registered reviewer for this programme.'
              : null;

  const options = [
    ...reviewerOf.map((p) => ({ value: p.id, label: `${p.name ?? shortId(p.id)} · ${p.phase ?? 'phase unknown'}` })),
    ...(reviewerOf.some((p) => p.id === programmeId) ? [] : [{ value: programmeId, label: name ?? shortId(programmeId) }]),
    { value: OTHER, label: 'Another programme…' },
  ];

  const pickProgramme = (id: string) => {
    setChosen(id);
    setApplicantError(null);
  };

  const chooseOther = () => {
    const value = otherInput.trim();
    if (!isProgrammeContractId(value)) {
      setOtherError('Enter a valid programme contract address.');
      return;
    }
    setOtherError(null);
    setOtherOpen(false);
    setOtherInput('');
    pickProgramme(value);
  };

  const addApplicant = () => {
    const value = applicantInput.trim();
    if (!looksLikeAddress(value)) {
      setApplicantError('Enter a valid applicant address.');
      return;
    }
    setApplicantError(null);
    setApplicantInput('');
    if (applicants.some((a) => a.address === value)) return;
    setAdded((prev) => ({
      ...prev,
      [programmeId]: [{ address: value, label: 'Added by you' }, ...(prev[programmeId] ?? [])],
    }));
  };

  return (
    <section className="verify__section" aria-labelledby="reviewer-votes">
      <h2 id="reviewer-votes" className="verify__h2">
        As a reviewer: set amounts
      </h2>
      <p className="verify__lead">
        You approve up to what each applicant asked, and the award is the median of the votes. This is separate from
        verifying: reviewers set amounts, verifiers unlock payments.
      </p>

      <div className="reviewer-pick">
        <Select
          label="Programme"
          options={options}
          value={otherOpen ? OTHER : programmeId}
          onChange={(event) => {
            if (event.target.value === OTHER) {
              setOtherOpen(true);
            } else {
              setOtherOpen(false);
              pickProgramme(event.target.value);
            }
          }}
        />
        <div className="reviewer-pick__status">
          {phaseRead.loading ? <Badge>Reading phase</Badge> : phase ? <PhaseBadge phase={phase} /> : <Badge>Phase unavailable</Badge>}
          <Badge tone={isReviewerRead.loading ? 'neutral' : isReviewerRead.data ? 'success' : 'danger'}>
            {isReviewerRead.loading ? 'Checking reviewer status' : isReviewerRead.data ? 'Reviewer wallet' : 'Not a reviewer'}
          </Badge>
        </div>
      </div>

      {otherOpen && (
        <div className="reviewer-pick__other">
          <Field
            label="Programme address"
            placeholder="C…"
            value={otherInput}
            onChange={(event) => {
              setOtherInput(event.target.value);
              setOtherError(null);
            }}
            error={otherError}
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="secondary" onClick={chooseOther}>
            Use programme
          </Button>
        </div>
      )}

      {gate && <DisabledReason id={reasonId}>{gate}</DisabledReason>}

      {applicants.length > 0 && (
        <ul className="vote-rows" aria-label="Applicants">
          {applicants.map((a) => (
            <VoteRow key={`${programmeId}:${a.address}`} programmeId={programmeId} applicant={a} gate={gate} />
          ))}
        </ul>
      )}

      <div className="reviewer-pick__other">
        <Field
          label="Applicant address"
          hint="The contract keeps no list of applications. Add an applicant to read their request and vote."
          placeholder="G…"
          value={applicantInput}
          onChange={(event) => {
            setApplicantInput(event.target.value.trim());
            setApplicantError(null);
          }}
          error={applicantError}
          autoComplete="off"
          spellCheck={false}
        />
        <Button variant="secondary" onClick={addApplicant}>
          Add applicant
        </Button>
      </div>

      {samples.length > 0 && (
        <p className="verify__fine">
          <SampleTag /> The named applicants are shortcuts until the index publishes applications.
        </p>
      )}
    </section>
  );
}
