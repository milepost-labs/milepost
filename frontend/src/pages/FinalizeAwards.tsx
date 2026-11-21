import { useMemo, useState } from 'react';
import type { ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useContractRead, useContractResult } from '../hooks/useContractRead';
import { useIndexedList } from '../hooks/useIndexedList';
import { useProgrammeParam } from '../hooks/useProgrammeParam';
import { usePageTitle } from '../hooks/usePageTitle';
import { fetchAwards, fetchProgrammes } from '../lib/indexer';
import { explain } from '../lib/errors';
import { formatDate, looksLikeAddress } from '../lib/format';
import { formatFigure, programmeAsset, shortId } from '../lib/programmeView';
import { FIXTURE_PROGRAMMES, chainFor, isSampleProgrammeId } from '../fixtures/programmes';
import { samplesEnabled } from '../lib/samples';
import { FIXTURE_REVIEW_APPLICATIONS } from '../fixtures/finalizeFixtures';
import { awardFromVotes } from '../lib/awardRule';
import { Button, Field, Notice, PageHead, PhaseBadge, SampleTag, Select } from '../components/ui';
import { ErrorPanel } from '../components/state/AsyncStates';
import { PausedBanner } from '../components/programme/PausedBanner';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { ChainRow, SampleRow, type RowContext, type RowFacts } from '../components/finalize/FinalizeRows';
import { FinalizeSheet, type FinalizeTarget } from '../components/finalize/FinalizeSheet';
import './FinalizeAwards.css';

/** The sample programme whose applications stand in for the unwired list. */
const SAMPLE_REVIEW_ID = 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C';

interface ProgrammeOption {
  id: string;
  name: string | null;
  sample: boolean;
}

function sampleFacts(): Map<string, RowFacts> {
  return new Map(
    FIXTURE_REVIEW_APPLICATIONS.map((a) => [
      a.applicant,
      { requested: BigInt(a.requested), votes: a.votes.map(BigInt), finalized: false, withdrawn: false, award: null },
    ]),
  );
}

/**
 * `/finalize`: turn reviewers' votes into awards.
 *
 * Finalizing is permissionless on purpose, so no one can strand an applicant
 * by not pressing a button, and the page says so first. When the programme
 * is oversubscribed, whoever finalizes first decides who is funded: the
 * contract protects the budget (`InsufficientBudget`) but not the order, and
 * the page says that before anyone acts, with the figures when it can.
 *
 * The contracts keep no list of applications and the index does not publish
 * them yet, so the rows are the programme's indexed awards (already
 * finalized) plus applicants added here, each read on the chain. Sample
 * programmes show tagged stand-in applications. Each award is finalized in a
 * sheet that asks for the payment mode and the payee that mode needs.
 */
export const FinalizeAwards = () => {
  usePageTitle('Finalize awards');
  const { programmeAt } = useSoroban();
  const { address } = useWallet();
  const programmeParam = useProgrammeParam();
  const listRead = useIndexedList(() => fetchProgrammes(), []);

  // A sample address is not a programme on mainnet, even if a link names it.
  const linkedProgrammeId =
    programmeParam.status === 'valid' &&
    programmeParam.programmeId &&
    (samplesEnabled() || !isSampleProgrammeId(programmeParam.programmeId))
      ? programmeParam.programmeId
      : null;

  const programmes: ProgrammeOption[] = useMemo(() => {
    const seen = new Set<string>();
    const list: ProgrammeOption[] = [];
    const push = (p: ProgrammeOption) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      list.push(p);
    };
    for (const p of listRead.data ?? []) push({ id: p.id, name: p.name, sample: false });
    if (linkedProgrammeId) {
      push({ id: linkedProgrammeId, name: null, sample: samplesEnabled() && isSampleProgrammeId(linkedProgrammeId) });
    }
    if (samplesEnabled()) {
      for (const f of FIXTURE_PROGRAMMES) push({ id: f.id, name: f.name, sample: true });
    }
    return list;
  }, [linkedProgrammeId, listRead.data]);

  const [chosen, setChosen] = useState<string | null>(null);
  const selectedId =
    chosen ??
    linkedProgrammeId ??
    programmes.find((p) => !p.sample)?.id ??
    (samplesEnabled() ? SAMPLE_REVIEW_ID : null);
  const selected = programmes.find((p) => p.id === selectedId) ?? {
    id: selectedId ?? '',
    name: null,
    sample: selectedId !== null && samplesEnabled() && isSampleProgrammeId(selectedId),
  };
  const sample = selected.sample;
  const asset = programmeAsset({ sample });
  const programme = useMemo(() => programmeAt(selected.id), [programmeAt, selected.id]);

  // Real programme reads. Sample programmes read nothing.
  const configRead = useContractResult<ProgrammeConfig>(() => programme.get_config(), [programme], {
    contract: 'program',
    enabled: !sample,
  });
  const phaseRead = useContractResult(() => programme.get_phase(), [programme], { contract: 'program', enabled: !sample });
  const budgetRead = useContractResult(() => programme.budget(), [programme], { contract: 'program', enabled: !sample });
  const grantedRead = useContractRead(() => programme.total_granted(), [programme], {
    contract: 'program',
    enabled: !sample,
  });
  const pausedRead = useContractRead(() => programme.is_paused(), [programme], { contract: 'program', enabled: !sample });
  const awardsRead = useIndexedList(() => fetchAwards(selected.id), [selected.id], { enabled: !sample });

  // Sample figures and rows, finalized locally.
  const chain = chainFor(selected.id);
  const [sampleRows, setSampleRows] = useState(sampleFacts);

  // Applicants added on this page, per programme, and a counter that makes
  // rows re-read after a finalize.
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [applicantInput, setApplicantInput] = useState('');
  const [applicantError, setApplicantError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [target, setTarget] = useState<FinalizeTarget | null>(null);

  const quorum = sample ? chain.quorum : (configRead.data?.quorum ?? 0);
  const minimum = sample ? 0n : (configRead.data?.minimum_award ?? 0n);
  const phase = sample ? chain.phase : (phaseRead.data?.tag ?? null);
  const sampleAwarded = [...sampleRows.values()].reduce((s, r) => s + (r.award?.granted ?? 0n), 0n);
  const budget = sample ? BigInt(chain.contributed) - BigInt(chain.fee) : (budgetRead.data ?? null);
  const awarded = sample ? BigInt(chain.awarded) + sampleAwarded : (grantedRead.data ?? null);
  const left = budget !== null && awarded !== null ? budget - awarded : null;

  const sampleList = sample && selected.id === SAMPLE_REVIEW_ID ? [...sampleRows.entries()] : [];
  const pendingSampleTotal = sampleList.reduce((sum, [, facts]) => {
    const a = !facts.finalized ? awardFromVotes(facts.votes, quorum) : null;
    return sum + (a ?? 0n);
  }, 0n);
  const oversubscribed = sample && left !== null && pendingSampleTotal > left;

  const gate = (() => {
    if (!address) return 'Sign in to finalize. Anyone can.';
    if (!sample && pausedRead.data) return 'Paused by the creator.';
    if (phase === 'Open') {
      return configRead.data
        ? `Finalizing opens when review starts, on ${formatDate(configRead.data.apply_deadline)}.`
        : 'Finalizing opens when review starts.';
    }
    if (phase === 'Cancelled') return 'The programme was cancelled.';
    if (phase === null) return 'Reading the programme…';
    return null;
  })();

  const ctx: RowContext = {
    quorum,
    asset,
    left: left ?? 0n,
    minimum,
    gate: gate ?? (left === null ? 'Reading the budget…' : null),
    onFinalize: (applicant, award) =>
      setTarget({
        programmeId: selected.id,
        applicant,
        award,
        asset,
        left: left ?? 0n,
        sample,
        policy: configRead.data?.policy ?? null,
      }),
  };

  const indexed = (awardsRead.data ?? []).map((a) => a.recipient);
  const extra = (added[selected.id] ?? []).filter((a) => !indexed.includes(a));
  const realRows = [...extra, ...indexed];

  const addApplicant = () => {
    const value = applicantInput.trim();
    if (!looksLikeAddress(value)) {
      setApplicantError('Enter the applicant’s Stellar address.');
      return;
    }
    setApplicantError(null);
    setApplicantInput('');
    if (realRows.includes(value)) return;
    setAdded((prev) => ({ ...prev, [selected.id]: [value, ...(prev[selected.id] ?? [])] }));
  };

  const onFinalized = (award: { granted: bigint; mode: string }) => {
    if (!target) return;
    if (target.sample) {
      setSampleRows((prev) => {
        const next = new Map(prev);
        const row = next.get(target.applicant);
        if (row) next.set(target.applicant, { ...row, finalized: true, award });
        return next;
      });
    } else {
      setVersion((v) => v + 1);
      budgetRead.refetch();
      grantedRead.refetch();
    }
  };

  const awardedPct = budget && budget > 0n && awarded !== null ? Number((awarded * 1000n) / budget) / 10 : 0;
  const readError = !sample ? (configRead.error ?? budgetRead.error ?? phaseRead.error) : null;

  return (
    <div className="finalize">
      <PageHead eyebrow="Admin" title="Finalize awards">
        <p>
          <b>Anyone can do this</b>, with or without a role. Finalizing turns the reviewers’ votes into an award, so no
          applicant waits on one person pressing a button.
        </p>
      </PageHead>
      <ProgrammeParamNotice state={programmeParam} />
      {!sample && <PausedBanner client={programme} />}

      <div className="finalize__top">
        <section className="finalize__budget" aria-label="Programme and budget">
          <Select
            label="Programme"
            value={selected.id}
            onChange={(event) => {
              setChosen(event.target.value);
              setApplicantError(null);
            }}
            options={programmes.map((p) => ({
              value: p.id,
              label: `${p.name ?? shortId(p.id)}${p.sample ? ' · sample' : ''}`,
            }))}
          />
          <div className="finalize__status">
            {phase && <PhaseBadge phase={phase} />}
            {quorum > 0 && <span className="finalize__quorum">Quorum {quorum}</span>}
            {minimum > 0n && (
              <span className="finalize__quorum">
                Minimum award {formatFigure(minimum)} {asset}
              </span>
            )}
            {sample && <SampleTag />}
          </div>
          <div
            className="finalize__bar"
            role="img"
            aria-label={
              budget !== null && awarded !== null
                ? `${formatFigure(awarded)} of ${formatFigure(budget)} ${asset} awarded`
                : 'Budget not read yet'
            }
          >
            <i style={{ width: `${Math.min(100, awardedPct)}%` }} />
          </div>
          <div className="finalize__figures">
            <span>
              <b className="numeric">{awarded !== null ? formatFigure(awarded) : '—'}</b> awarded
            </span>
            <span>
              <b className="numeric">{left !== null ? formatFigure(left) : '—'}</b> of{' '}
              <span className="numeric">{budget !== null ? formatFigure(budget) : '—'}</span> {asset} left
            </span>
          </div>
        </section>

        {oversubscribed && left !== null ? (
          <Notice tone="risk" role="note">
            <span>
              <b>This programme is oversubscribed.</b> The awards ready to finalize total{' '}
              {formatFigure(pendingSampleTotal)} {asset} against {formatFigure(left)} left. The budget is protected and
              can’t be exceeded, but <b>whoever finalizes first decides who gets funded</b>. Once the money runs out, the
              rest can’t be finalized.
            </span>
          </Notice>
        ) : (
          <Notice tone="info" role="note">
            <span>
              <b>Order matters when money is short.</b> If the ready awards add up to more than is left, whoever
              finalizes first decides who gets funded. The budget itself can’t be exceeded.
            </span>
          </Notice>
        )}
      </div>

      {readError ? <ErrorPanel explained={explain(readError, 'program')} /> : null}

      <section className="finalize__list" aria-labelledby="fin-applications">
        <h2 id="fin-applications" className="finalize__h2">
          Applications
        </h2>
        <table className="ui-table fin-table">
          <thead>
            <tr>
              <th scope="col">Applicant</th>
              <th scope="col" className="numeric-col">
                Asked
              </th>
              <th scope="col">Votes (quorum {quorum || '—'})</th>
              <th scope="col" className="numeric-col">
                Award
              </th>
              <th scope="col">
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sample
              ? sampleList.map(([applicant, facts]) => (
                  <SampleRow key={applicant} applicant={applicant} facts={facts} ctx={ctx} />
                ))
              : realRows.map((applicant) => (
                  <ChainRow
                    key={applicant}
                    programmeId={selected.id}
                    applicant={applicant}
                    label={indexed.includes(applicant) ? undefined : 'Added here'}
                    ctx={ctx}
                    version={version}
                  />
                ))}
          </tbody>
        </table>
        {(sample ? sampleList.length === 0 : realRows.length === 0) && (
          <p className="finalize__empty">
            {sample
              ? 'This sample programme has no applications to show.'
              : 'No applications listed yet. Add an applicant below to read their application.'}
          </p>
        )}

        {!sample && (
          <div className="finalize__add">
            <Field
              label="Applicant address"
              placeholder="G…"
              value={applicantInput}
              onChange={(event) => {
                setApplicantInput(event.target.value);
                setApplicantError(null);
              }}
              error={applicantError ?? undefined}
              hint="The contract keeps no list of applications, and the index lists only finalized awards. Add an applicant to read theirs."
              autoComplete="off"
              spellCheck={false}
            />
            <Button variant="secondary" onClick={addApplicant}>
              Add applicant
            </Button>
          </div>
        )}

        <p className="finalize__fine">
          The award is the middle vote once the quorum is in, never an average: the contract sorts the votes from lowest
          and takes the middle of the first {quorum || 'quorum'}, so votes beyond the quorum can only lower it. It is never
          more than was asked. The payment mode is chosen per award when you finalize.
          {sample && (
            <>
              {' '}
              <SampleTag /> Sample applications stand in until the index publishes them.
            </>
          )}
        </p>
      </section>

      {target && (
        <FinalizeSheet target={target} onClose={() => setTarget(null)} onFinalized={onFinalized} />
      )}
    </div>
  );
};
