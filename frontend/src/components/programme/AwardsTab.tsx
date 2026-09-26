import type { FC } from 'react';
import type { IndexedAward } from '../../lib/indexer';
import { fetchAwards } from '../../lib/indexer';
import { useIndexedList } from '../../hooks/useIndexedList';
import { formatAmount, parseAmount } from '../../lib/amount';
import { FIXTURE_AWARDS } from '../../fixtures/programmeFixtures';
import './AwardsTab.css';

export interface AwardsTabProps {
  programmeId: string;
  phase?: string;
  isSample?: boolean;
  asset?: string;
}

function parseAwardStroops(val: string | number | bigint | undefined | null): bigint {
  if (val === null || val === undefined) return 0n;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(Math.floor(val));
  const s = String(val).trim();
  if (!s) return 0n;
  try {
    if (s.includes('.')) {
      return parseAmount(s);
    }
    return BigInt(s);
  } catch {
    return 0n;
  }
}

function shortAddress(addr: string): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const AwardsTab: FC<AwardsTabProps> = ({
  programmeId,
  phase = 'Open',
  isSample = false,
  asset = 'USDC',
}) => {
  const {
    data: fetchedAwards,
    loading,
    error,
  } = useIndexedList<IndexedAward[]>(
    () => fetchAwards(programmeId),
    [programmeId],
    { enabled: Boolean(programmeId) && !isSample },
  );

  let awards: IndexedAward[] = [];
  if (isSample) {
    awards = phase === 'Settled' ? FIXTURE_AWARDS : [];
  } else if (fetchedAwards) {
    awards = fetchedAwards;
  }

  const advisoryNote = isSample
    ? 'Awards are the median of reviewer votes. Listed from the public index, advisory.'
    : 'From the public index (awards.json), advisory. Each award is re-read on-chain before it is acted on.';

  let emptyMsg = 'The index has no awards for this programme yet.';
  if (phase === 'Open') {
    emptyMsg = 'No awards yet. Applications are still open.';
  } else if (phase === 'Review') {
    emptyMsg = 'No awards are final yet. Each is set once it reaches quorum and someone finalizes it.';
  } else if (phase === 'Settled') {
    emptyMsg = 'No awards were made.';
  }

  return (
    <div className="awards-tab" role="tabpanel" id="panel-awards" aria-labelledby="tab-awards">
      <p className="awards-tab__note">{advisoryNote}</p>

      {loading && (
        <div className="awards-tab__status" role="status" aria-live="polite">
          <span>Reading awards…</span>
        </div>
      )}

      {!loading && Boolean(error) && (
        <div className="awards-tab__empty" role="alert">
          <p>
            Couldn&apos;t load awards from the index.{' '}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {!loading && !error && awards.length === 0 && (
        <div className="awards-tab__empty">
          <p>{emptyMsg}</p>
        </div>
      )}

      {!loading && !error && awards.length > 0 && (
        <div className="awards-tab__list">
          {awards.map((award, idx) => {
            const granted = parseAwardStroops(award.granted);
            const released = parseAwardStroops(award.released);
            const tranches = Number(award.tranches ?? 0);
            const tranchesReleased = Number(award.tranchesReleased ?? 0);
            const hasTranches = tranches > 0;

            const trancheLabel = `${tranchesReleased} of ${tranches} tranches released`;

            return (
              <div
                key={`${award.recipient}-${idx}`}
                className="awards-tab__row"
              >
                <div className="awards-tab__row-info">
                  <span
                    className="awards-tab__recipient numeric"
                    title={award.recipient}
                  >
                    {shortAddress(award.recipient)}
                  </span>
                  <span className="awards-tab__subtitle">
                    {hasTranches
                      ? `${tranchesReleased} of ${tranches} tranches · ${formatAmount(
                          released,
                          { asset },
                        )} released`
                      : 'Tranche status read on-chain'}
                  </span>
                </div>

                <div className="awards-tab__row-amount numeric">
                  {formatAmount(granted, { asset })}
                </div>

                {hasTranches && (
                  <div
                    className="awards-tab__tranches"
                    role="img"
                    aria-label={trancheLabel}
                  >
                    {Array.from({ length: tranches }, (_, i) => (
                      <span
                        key={i}
                        className="awards-tab__tranche-bar"
                        style={{
                          backgroundColor:
                            i < tranchesReleased
                              ? 'var(--accent)'
                              : 'var(--locked)',
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
