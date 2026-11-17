import type { ReactNode } from 'react';
import type { Application, Award } from '@milepost/program';
import { Check } from 'lucide-react';
import { useSoroban } from '../../context/useSoroban';
import { useContractResult } from '../../hooks/useContractRead';
import { explain } from '../../lib/errors';
import { truncateAddress } from '../../lib/format';
import { formatFigure } from '../../lib/programmeView';
import { awardFromVotes } from '../../lib/awardRule';
import { Button, DisabledReason, SampleTag } from '../ui';
import { ErrorPanel } from '../state/AsyncStates';

/** What a row needs to know about one application. */
export interface RowFacts {
  requested: bigint;
  /** Ascending, as the contract stores them. */
  votes: bigint[];
  finalized: boolean;
  withdrawn: boolean;
  /** The award it produced, once finalized. */
  award: { granted: bigint; mode: string } | null;
}

export interface RowContext {
  quorum: number;
  asset: string;
  left: bigint;
  minimum: bigint;
  /** Why nothing on this programme can be finalized right now, or null. */
  gate: string | null;
  onFinalize: (applicant: string, award: bigint) => void;
}

/**
 * One application as a row: who, what they asked, the votes (the one the
 * contract will use marked, empty slots up to quorum), the award, and either
 * the Finalize button or why not.
 */
function RowView({
  applicant,
  facts,
  ctx,
  sample,
  label,
}: {
  applicant: string;
  facts: RowFacts;
  ctx: RowContext;
  sample?: boolean;
  label?: string;
}) {
  const { quorum, asset, left, minimum } = ctx;
  const award = awardFromVotes(facts.votes, quorum);
  const usedIndex = quorum > 0 ? Math.floor((quorum - 1) / 2) : -1;
  const missing = Math.max(0, quorum - facts.votes.length);

  let action: ReactNode;
  if (facts.finalized && facts.award) {
    action = (
      <span className="fin-row__done">
        <Check size={16} aria-hidden="true" /> Finalized · {facts.award.mode}
      </span>
    );
  } else if (facts.finalized) {
    action = <span className="fin-row__done">Finalized</span>;
  } else if (facts.withdrawn) {
    action = <span className="fin-row__muted">Withdrawn</span>;
  } else if (award === null) {
    action = (
      <span className="fin-row__muted">
        Needs {missing} more vote{missing === 1 ? '' : 's'}
      </span>
    );
  } else {
    const why =
      ctx.gate ??
      (award > left
        ? `Only ${formatFigure(left > 0n ? left : 0n)} ${asset} left`
        : minimum > 0n && award < minimum
          ? `Below the ${formatFigure(minimum)} ${asset} minimum`
          : null);
    action = (
      <span className="fin-row__act">
        <Button size="sm" disabled={Boolean(why)} onClick={() => ctx.onFinalize(applicant, award)}>
          Finalize
        </Button>
        {why && <DisabledReason>{why}</DisabledReason>}
      </span>
    );
  }

  return (
    <tr className={facts.finalized ? 'fin-row fin-row--done' : 'fin-row'}>
      <td data-label="Applicant">
        <span className="fin-row__who">
          {label && <b>{label}</b>}
          <span className="numeric" title={applicant}>
            {truncateAddress(applicant, 6, 4)}
          </span>
          {sample && <SampleTag />}
        </span>
      </td>
      <td data-label="Asked" className="numeric numeric-col">
        {formatFigure(facts.requested)}
      </td>
      <td data-label={`Votes (quorum ${quorum})`}>
        <span className="fin-votes" aria-label={`Votes: ${facts.votes.map((v) => formatFigure(v)).join(', ') || 'none'}`}>
          {facts.votes.map((v, i) => (
            <span key={i} className={i === usedIndex && award !== null ? 'fin-vote fin-vote--used' : 'fin-vote'}>
              {formatFigure(v)}
            </span>
          ))}
          {Array.from({ length: missing }, (_, i) => (
            <span key={`m${i}`} className="fin-vote fin-vote--missing">
              —
            </span>
          ))}
        </span>
      </td>
      <td data-label="Award" className="numeric numeric-col">
        <b>{facts.award ? formatFigure(facts.award.granted) : award !== null ? formatFigure(award) : '—'}</b>
      </td>
      <td className="fin-row__action">{action}</td>
    </tr>
  );
}

/** A real application: read from the chain, with its award once finalized. */
export function ChainRow({
  programmeId,
  applicant,
  label,
  ctx,
  version,
}: {
  programmeId: string;
  applicant: string;
  label?: string;
  ctx: RowContext;
  /** Bumped after a finalize, so the row re-reads. */
  version: number;
}) {
  const { programmeAt } = useSoroban();
  const programme = programmeAt(programmeId);
  const app = useContractResult<Application>(
    () => programme.get_application({ applicant }),
    [programme, applicant, version],
    { contract: 'program' },
  );
  const finalized = app.data?.finalized === true;
  const award = useContractResult<Award>(
    () => programme.get_award({ recipient: applicant }),
    [programme, applicant, version],
    { contract: 'program', enabled: finalized },
  );

  if (app.error) {
    const explained = explain(app.error, 'program');
    return (
      <tr className="fin-row">
        <td data-label="Applicant">
          <span className="numeric" title={applicant}>
            {truncateAddress(applicant, 6, 4)}
          </span>
        </td>
        <td colSpan={4} className="fin-row__error">
          {explained.kind === 'none' ? (
            <span className="fin-row__muted">No application from this address.</span>
          ) : (
            <ErrorPanel explained={explained} onRetry={app.refetch} live={false} />
          )}
        </td>
      </tr>
    );
  }
  if (!app.data) {
    return (
      <tr className="fin-row">
        <td data-label="Applicant">
          <span className="numeric">{truncateAddress(applicant, 6, 4)}</span>
        </td>
        <td colSpan={4} className="fin-row__muted">
          Reading the application…
        </td>
      </tr>
    );
  }
  const facts: RowFacts = {
    requested: app.data.requested,
    votes: [...app.data.votes],
    finalized,
    withdrawn: app.data.withdrawn,
    award: award.data ? { granted: award.data.granted, mode: award.data.mode.tag } : null,
  };
  return <RowView applicant={applicant} facts={facts} ctx={ctx} label={label} />;
}

/** A sample application: fixture facts, finalized locally. */
export function SampleRow({ applicant, facts, ctx }: { applicant: string; facts: RowFacts; ctx: RowContext }) {
  return <RowView applicant={applicant} facts={facts} ctx={ctx} sample />;
}
