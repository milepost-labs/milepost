import { useState } from 'react';
import { Mail } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { MODE_INFO, type ModeName } from '../lib/modes';
import { absoluteLink } from '../lib/verifyLinks';
import { proposalParam, type DeployMode } from '../fixtures/adminFixtures';
import { CopyButton, Field, Notice, PageHead, Select, TextArea } from '../components/ui';
import './ProposeProgramme.css';

const SECTORS = [
  'Health worker stipends',
  'Education',
  'Agricultural inputs',
  'Vocational training',
  'Humanitarian cash',
  'SME microgrants',
  'Other',
];

interface Draft {
  name: string;
  sector: string;
  purpose: string;
  condition: string;
  verifier: string;
  payee: string;
  amount: string;
  tranches: string;
  mode: ModeName;
  timeline: string;
  funder: string;
  contact: string;
}

const EMPTY: Draft = {
  name: '',
  sector: SECTORS[0],
  purpose: '',
  condition: '',
  verifier: '',
  payee: '',
  amount: '',
  tranches: '3',
  mode: 'Allocated',
  timeline: '',
  funder: '',
  contact: '',
};

function summaryText(d: Draft): string {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : null);
  return [
    `Programme proposal: ${d.name.trim() || '(untitled)'}`,
    '',
    line('Sector', d.sector),
    line('What it pays for', d.purpose),
    line('Condition', d.condition),
    line('Who confirms it', d.verifier),
    line('Who gets paid', d.payee),
    line('Rough budget', d.amount),
    line('Tranches per award', d.tranches),
    line('Preferred payment mode', `${d.mode} (${MODE_INFO[d.mode].rank.toLowerCase()})`),
    line('Timeline', d.timeline),
    line('From', d.funder),
    line('Contact', d.contact),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * `/funders/propose`: describe a programme you want to exist without deploying
 * it yourself. Nothing goes on the chain and no wallet is needed. It makes a
 * summary to copy or email, and a deploy link that opens the deploy wizard
 * pre-filled (`/admin?proposal=…`) for whoever will deploy it.
 */
export const ProposeProgramme = () => {
  usePageTitle('Propose a programme');
  const [d, setD] = useState<Draft>(EMPTY);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const tranches = Number(d.tranches);
  const tranchesOk = Number.isInteger(tranches) && tranches >= 1 && tranches <= 32;
  const summary = summaryText(d);
  const deployLink = absoluteLink(
    `/admin?proposal=${proposalParam({
      name: d.name.trim(),
      mode: d.mode as DeployMode,
      tranches: tranchesOk ? tranches : 3,
      contact: d.contact.trim(),
      funder: d.funder.trim(),
      purpose: [d.purpose.trim(), d.payee.trim() && `Paid to: ${d.payee.trim()}`].filter(Boolean).join('. '),
      condition: d.condition.trim(),
      verifier: d.verifier.trim(),
      amount: d.amount.trim(),
    })}`,
  );
  const mailto = `mailto:?subject=${encodeURIComponent(`Programme proposal: ${d.name.trim() || 'untitled'}`)}&body=${encodeURIComponent(
    `${summary}\n\nOpen it in the deploy wizard, pre-filled:\n${deployLink}`,
  )}`;
  const ready = d.name.trim() !== '';

  return (
    <div className="propose">
      <PageHead eyebrow="Fund" title="Propose a programme">
        <p>Want a programme to exist but don’t want to deploy it yourself? Describe it here and send it to someone who can.</p>
      </PageHead>

      <Notice tone="info">
        <span>
          <strong>Nothing goes on the chain.</strong> This makes a summary to copy or email, and a link that opens the
          deploy wizard pre-filled. No wallet needed.
        </span>
      </Notice>

      <div className="propose__grid">
        <form className="propose__form" onSubmit={(event) => event.preventDefault()}>
          <Field
            label="Programme name"
            placeholder="e.g. Kano clinic nurse stipends"
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <div className="propose__two">
            <Select
              label="Sector"
              value={d.sector}
              onChange={(e) => set({ sector: e.target.value })}
              options={SECTORS.map((s) => ({ value: s, label: s }))}
            />
            <Field
              label="Rough budget"
              placeholder="e.g. 25,000 XLM"
              value={d.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </div>
          <TextArea
            label="What it pays for"
            rows={2}
            placeholder="e.g. Monthly stipends for community nurses"
            value={d.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
          />
          <Field
            label="What has to happen before money moves?"
            placeholder="e.g. Shifts worked this month"
            value={d.condition}
            onChange={(e) => set({ condition: e.target.value })}
            hint="This becomes the condition a verifier confirms."
          />
          <div className="propose__two">
            <Field
              label="Who can confirm it?"
              placeholder="e.g. The district clinic lead"
              value={d.verifier}
              onChange={(e) => set({ verifier: e.target.value })}
            />
            <Field
              label="Who gets paid?"
              placeholder="e.g. The nurse"
              value={d.payee}
              onChange={(e) => set({ payee: e.target.value })}
            />
          </div>
          <div className="propose__two">
            <Select
              label="Preferred payment mode"
              value={d.mode}
              onChange={(e) => set({ mode: e.target.value as ModeName })}
              options={(Object.keys(MODE_INFO) as ModeName[]).map((m) => ({
                value: m,
                label: `${m} (${MODE_INFO[m].rank.toLowerCase()})`,
              }))}
              hint="A preference: each award’s mode is chosen when it’s finalized."
            />
            <Field
              label="Tranches per award"
              inputMode="numeric"
              value={d.tranches}
              onChange={(e) => set({ tranches: e.target.value })}
              error={d.tranches.trim() !== '' && !tranchesOk ? 'A whole number from 1 to 32.' : undefined}
            />
          </div>
          <Field
            label="Timeline"
            placeholder="e.g. Applications in Jan 2027, payments Feb to Dec 2027"
            value={d.timeline}
            onChange={(e) => set({ timeline: e.target.value })}
          />
          <div className="propose__two">
            <Field
              label="You or your organisation (optional)"
              value={d.funder}
              onChange={(e) => set({ funder: e.target.value })}
            />
            <Field
              label="Your contact (optional)"
              value={d.contact}
              onChange={(e) => set({ contact: e.target.value })}
              hint="Only included in what you send."
            />
          </div>
        </form>

        <aside className="propose__aside" aria-labelledby="propose-summary">
          <h2 id="propose-summary">Your summary</h2>
          <pre className="propose__summary numeric">{summary}</pre>
          <div className="propose__actions">
            <CopyButton value={summary} label="Copy summary" showLabel />
            {ready ? (
              <CopyButton value={deployLink} label="Copy deploy link" showLabel />
            ) : (
              <p className="propose__wait">Name the programme to make a deploy link.</p>
            )}
            <a className="ui-button ui-button--ghost ui-button--md" href={mailto}>
              <Mail size={18} aria-hidden="true" /> Email it
            </a>
          </div>
          <p className="propose__fine">
            The deploy link opens the deploy wizard with the name, tranches and these notes filled in, for whoever will
            deploy it. Email opens your mail app with the summary and the link; you choose who it goes to.
          </p>
        </aside>
      </div>
    </div>
  );
};
