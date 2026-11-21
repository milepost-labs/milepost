import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import type { Award, ProgrammeConfig } from '@milepost/program';
import { AddressChip, ModePill, Notice, PageHead, Receipt } from '../components/ui';
import { AsyncView, ErrorState } from '../components/state/AsyncStates';
import { useSoroban } from '../context/useSoroban';
import { useContractResult, useContractRead, useIndexedList } from '../hooks';
import { usePageTitle } from '../hooks/usePageTitle';
import { fetchProgrammes } from '../lib/indexer';
import { formatAmount, describeAmount } from '../lib/amount';
import { isSampleProgrammeId, programmeAsset, shortId } from '../lib/programmeView';
import './AwardDetail.css';

/** How a mode pays out, on the award's own page. */
const MODE_EXPLANATION: Record<string, string> = {
  Direct: 'Paid straight to a verified payee, chosen when the award was finalized. The recipient never holds the money.',
  Allocated: 'Held in escrow inside the programme. The recipient directs which verified payee receives it, and when.',
  Restricted: "Paid into the recipient's smart wallet, where a spending policy limits transfers to verified payees.",
  Open: 'Paid to the recipient with no restriction.',
};

/**
 * `/award/:programmeId/:recipient` — one award, linkable on its own.
 *
 * An award is the thing everyone cares about: the recipient, the funders and
 * the verifier all meet here. The figures are the chain's `get_award`
 * answer for this recipient on this programme, re-read live; the programme's
 * config supplies the context (tranches per award), and in Allocated mode
 * `allocation_of` shows what the recipient may still direct.
 */
export const AwardDetail = () => {
  usePageTitle('Award detail');
  const { programmeId = '', recipient = '' } = useParams<{ programmeId?: string; recipient?: string }>();
  const { programmeAt } = useSoroban();

  const isSample = isSampleProgrammeId(programmeId);
  const client = useMemo(
    () => (!isSample && programmeId && recipient ? programmeAt(programmeId) : null),
    [programmeAt, programmeId, recipient, isSample],
  );

  const awardRead = useContractResult<Award>(
    () => client!.get_award({ recipient }),
    [client],
    { enabled: client !== null, contract: 'program' },
  );

  const configRead = useContractResult<ProgrammeConfig>(
    () => client!.get_config(),
    [client],
    { enabled: client !== null, contract: 'program' },
  );

  // The programme's name lives only in the index.
  const indexRead = useIndexedList(() => fetchProgrammes(), []);
  const programmeName = useMemo(
    () => indexRead.data?.find((entry) => entry.id === programmeId)?.name ?? null,
    [indexRead.data, programmeId],
  );

  const award = awardRead.data ?? null;
  const modeTag = award?.mode?.tag ?? null;
  const allocated = modeTag === 'Allocated';

  // Escrowed funds the recipient may still direct; only meaningful in Allocated.
  const allocationRead = useContractRead(
    () => client!.allocation_of({ recipient }),
    [client],
    { enabled: client !== null && allocated, contract: 'program' },
  );

  const asset = programmeAsset({ sample: false });

  return (
    <div className="award-detail">
      <PageHead eyebrow="Award" title={programmeName ? `Award · ${programmeName}` : 'Award detail'}>
        <p>
          One award, read live from the programme&apos;s contract: what was granted, how much has
          released, and where the money may still go.
        </p>
      </PageHead>

      <Link to={`/programme/${encodeURIComponent(programmeId)}`} className="award-detail__back">
        <ArrowLeft aria-hidden="true" />
        Back to the programme
      </Link>

      {isSample && (
        <Notice tone="info" role="status">
          <span>
            This is a sample programme. Its awards are stand-in data with no contract behind
            them — open the programme page to see the sample set.
          </span>
        </Notice>
      )}

      {!isSample && client === null && (
        <ErrorState
          error={new Error('A programme id and a recipient address are both needed.')}
          contract="program"
        />
      )}

      {!isSample && client !== null && (
        <AsyncView
          data={award}
          loading={awardRead.loading}
          error={awardRead.error}
          onRetry={awardRead.refetch}
          contract="program"
        >
          {(value) => {
            const tranches = Number(value.tranches);
            const released = Number(value.tranches_released);
            const remaining = Math.max(0, BigInt(value.granted) - BigInt(value.released));
            return (
              <>
                <section className="award-detail__card" aria-labelledby="award-summary-title">
                  <div className="award-detail__card-head">
                    <div>
                      <p className="award-detail__eyebrow">Award · rebuilt from the chain just now</p>
                      <h2 id="award-summary-title" className="award-detail__figure">
                        {formatAmount(BigInt(value.granted), { asset })}
                      </h2>
                    </div>
                    {modeTag && <ModePill mode={modeTag} />}
                  </div>

                  <Receipt
                    rows={[
                      {
                        label: 'Recipient',
                        value: (
                          <span className="award-detail__party">
                            <AddressChip
                              address={recipient}
                              showExplorerLink
                              copyLabel="Copy recipient address"
                            />
                          </span>
                        ),
                      },
                      {
                        label: 'Programme',
                        value: (
                          <Link to={`/programme/${encodeURIComponent(programmeId)}`}>
                            {programmeName ?? shortId(programmeId)}
                          </Link>
                        ),
                        text: true,
                      },
                      {
                        label: 'Granted',
                        value: formatAmount(BigInt(value.granted), { asset }),
                      },
                      {
                        label: 'Released',
                        value: (
                          <span
                            className="numeric"
                            aria-label={describeAmount(BigInt(value.released), asset)}
                          >
                            {formatAmount(BigInt(value.released), { asset })}
                          </span>
                        ),
                      },
                      {
                        label: 'Still to release',
                        value: formatAmount(remaining, { asset }),
                      },
                      {
                        label: 'Tranches',
                        value: `${released} of ${tranches} released`,
                        text: true,
                      },
                      {
                        label: 'Payee',
                        value: value.payee ? (
                          <AddressChip
                            address={value.payee}
                            showExplorerLink
                            copyLabel="Copy payee address"
                          />
                        ) : (
                          'Not set'
                        ),
                        text: true,
                      },
                      ...(allocated
                        ? [
                            {
                              label: 'In escrow',
                              value:
                                allocationRead.data != null
                                  ? formatAmount(BigInt(allocationRead.data), { asset })
                                  : allocationRead.error
                                    ? '—'
                                    : '…',
                              text: true,
                            },
                          ]
                        : []),
                    ]}
                  />

                  <div className="award-detail__tranches" role="img" aria-label={`${released} of ${tranches} tranches released`}>
                    {Array.from({ length: tranches }, (_, i) => (
                      <span
                        key={i}
                        className="award-detail__tranche"
                        data-money-state={i < released ? 'released' : 'locked'}
                      />
                    ))}
                  </div>
                </section>

                {modeTag && (
                  <section className="award-detail__mode" aria-labelledby="award-mode-title">
                    <h2 id="award-mode-title" className="award-detail__mode-title">
                      How this award pays out
                    </h2>
                    <p className="award-detail__mode-body">{MODE_EXPLANATION[modeTag] ?? MODE_EXPLANATION.Open}</p>
                    {allocated && allocationRead.data != null && BigInt(allocationRead.data) > 0n && (
                      <p className="award-detail__mode-note">
                        <CircleCheck aria-hidden="true" /> Escrow holds{' '}
                        {formatAmount(BigInt(allocationRead.data), { asset })} this recipient may
                        still direct to a verified payee.
                      </p>
                    )}
                  </section>
                )}

                <p className="award-detail__fine">
                  The figures come from the programme&apos;s contract, re-read for this page. The
                  tranches are released as verifiers confirm conditions; a programme&apos;s page
                  shows its full activity.
                </p>
              </>
            );
          }}
        </AsyncView>
      )}

      {configRead.error && (
        <Notice tone="warn" role="status">
          <span>The programme&apos;s configuration could not be read; the figures above still stand.</span>
        </Notice>
      )}

      <div aria-hidden="true" className="award-detail__spacer" />
    </div>
  );
};
