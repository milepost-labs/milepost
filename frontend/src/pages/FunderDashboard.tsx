import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, Wallet } from 'lucide-react';
import { ContributeSheet } from '../components/funder/ContributeSheet';
import { ContributionList } from '../components/funder/ContributionList';
import { SignInSheet } from '../components/layout/SignInSheet';
import { MoneyLegend } from '../components/programme/MoneyRow';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { Empty } from '../components/state/AsyncStates';
import { Button, PageHead, SampleTag, StatTile } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { FIXTURE_CONTRIBUTIONS } from '../fixtures/funding';
import { samplesEnabled } from '../lib/samples';
import { useIndexedList, useProgrammeParam } from '../hooks';
import { usePageTitle } from '../hooks/usePageTitle';
import { useReleaseDeadlines } from '../hooks/useReleaseDeadlines';
import { contributionsToCsv, downloadFile } from '../lib/csv';
import { contributionCard, fundingTotals } from '../lib/funding';
import { fetchProgrammes } from '../lib/indexer';
import { formatFigure, mergeProgrammes } from '../lib/programmeView';
import './FunderDashboard.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * `/funders`: what a funder has put in, where it went, and what they can take
 * back, with Contribute as the page's one action. Signed out, it says what
 * signing in would show instead of rendering empty panels.
 *
 * Contributions are stand-ins (`fixtures/funding.ts`) until the per-address
 * read is wired; the programme list is the public index merged with the
 * sample programmes, as on the directory. Arriving with `?programme=` (from a
 * programme's "Contribute") opens the contribute sheet with it chosen.
 */
export const FunderDashboard = () => {
  usePageTitle('Your funding');
  const { address } = useWallet();
  const programmeParam = useProgrammeParam();
  const linkedId = programmeParam.status === 'valid' ? programmeParam.programmeId : null;
  const [signInOpen, setSignInOpen] = useState(false);
  // The sheet opens by itself once a `?programme=` link from a programme's
  // "Contribute" checks out against the registry, and stays shut for that
  // link once the reader closes it.
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const contributeOpen = manualOpen || (linkedId !== null && dismissedFor !== linkedId);
  const closeContribute = () => {
    setManualOpen(false);
    setDismissedFor(linkedId);
  };
  const [refunded, setRefunded] = useState<ReadonlySet<string>>(() => new Set());

  const listRead = useIndexedList(() => fetchProgrammes(), []);
  const programmes = useMemo(() => mergeProgrammes(listRead.data), [listRead.data]);

  const cards = useMemo(() => {
    if (!samplesEnabled()) return [];
    const byId = new Map(programmes.map((p) => [p.id, p]));
    return FIXTURE_CONTRIBUTIONS.map((c) =>
      contributionCard(c, byId.get(c.programmeId), refunded.has(c.programmeId)),
    );
  }, [programmes, refunded]);
  const exportableCount = useMemo(() => cards.filter((c) => !c.sample).length, [cards]);
  const totals = fundingTotals(cards);
  // Every stand-in contribution is in its programme's asset; they share one.
  const asset = cards[0]?.asset ?? 'USDC';
  const sampleIds = useMemo(() => new Set(programmes.filter((p) => p.sample).map((p) => p.id)), [programmes]);

  const contributionProgrammeIds = useMemo(
    () => (samplesEnabled() ? FIXTURE_CONTRIBUTIONS.map((c) => c.programmeId) : []),
    [],
  );
  const releaseDeadlines = useReleaseDeadlines(contributionProgrammeIds, sampleIds);

  const markRefunded = (programmeId: string) => setRefunded((current) => new Set(current).add(programmeId));

  const handleDownloadCsv = useCallback(() => {
    const csv = contributionsToCsv(cards);
    const filename = `contributions-${Date.now()}.csv`;
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  }, [cards]);

  const lead = (
    <p>
      What you've put in, where it went, and what you can take back. Need a receipt from before?{' '}
      <Link to="/funders/receipt">Rebuild it from its transaction hash</Link>.
    </p>
  );

  if (!address) {
    return (
      <div className="funder">
        <PageHead eyebrow="Fund" title="Your funding">
          {lead}
        </PageHead>
        <Empty
          title="See and manage what you've funded"
          description="Sign in to see your contributions, what has been released from them, and any refund you can claim. You can browse every programme without signing in."
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

  return (
    <div className="funder">
      <PageHead
        eyebrow="Fund"
        title="Your funding"
        action={
          <div className="funder__actions">
            <Button
              variant="secondary"
              icon={<Download size={18} aria-hidden="true" />}
              onClick={handleDownloadCsv}
              disabled={exportableCount === 0}
              title={
                exportableCount === 0
                  ? 'Sample programmes are excluded from CSV exports'
                  : undefined
              }
            >
              Download CSV
            </Button>
            <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setManualOpen(true)}>
              Contribute
            </Button>
          </div>
        }
      >
        {lead}
      </PageHead>

      <ProgrammeParamNotice state={programmeParam} />

      {cards.length === 0 ? (
        <Empty
          title="You haven't funded a programme yet"
          description="Pick an Open programme to contribute to. You can follow every release, and you get your share of anything unspent back."
          action={
            <Link to="/directory" className="ui-button ui-button--primary ui-button--md">
              Find a programme
            </Link>
          }
        />
      ) : (
        <>
          <section className="ui-stat-tiles ui-stat-tiles--three" aria-label="Your funding">
            <StatTile
              label="Contributed"
              value={formatFigure(totals.contributed)}
              unit={asset}
              hint={`Across ${plural(totals.programmes, 'programme', 'programmes')}`}
            />
            <StatTile
              label="Released to people"
              value={formatFigure(totals.released)}
              unit={asset}
              hint="Your share of releases so far"
            />
            <StatTile
              label="Refundable now"
              value={formatFigure(totals.refundableNow)}
              unit={asset}
              hint={
                totals.refundablePrograms > 0
                  ? `From ${plural(totals.refundablePrograms, 'programme', 'programmes')}`
                  : 'Nothing to claim yet'
              }
              highlight
            />
          </section>

          <div className="funder__legend">
            <SampleTag>Sample contributions</SampleTag>
            <MoneyLegend />
          </div>

          <ContributionList cards={cards} onRefunded={markRefunded} releaseDeadlines={releaseDeadlines} />

          <p className="funder__note">
            Refunds are proportional: you get back your share of whatever wasn't paid out, never more than you
            put in.
          </p>
        </>
      )}

      <ContributeSheet
        open={contributeOpen}
        onClose={closeContribute}
        programmes={programmes}
        linkedProgrammeId={linkedId}
      />
    </div>
  );
};
