import { useState, type FC, type KeyboardEvent } from 'react';
import { AwardsTab } from './AwardsTab';
import { VerifiersTab } from './VerifiersTab';
import { TermsTab } from './TermsTab';
import type { VerifierFixture } from '../../fixtures/programmeFixtures';
import './ProgrammeTabs.css';

export type TabKey = 'awards' | 'verifiers' | 'terms';

export interface ProgrammeTabsProps {
  programmeId: string;
  phase?: string;
  mode?: string;
  quorum?: number;
  isSample?: boolean;
  asset?: string;
  verifiers?: VerifierFixture[];
  defaultTab?: TabKey;
}

export const ProgrammeTabs: FC<ProgrammeTabsProps> = ({
  programmeId,
  phase = 'Open',
  mode = 'Direct',
  quorum = 1,
  isSample = false,
  asset = 'USDC',
  verifiers,
  defaultTab = 'awards',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: 'awards', label: 'Awards' },
    { id: 'verifiers', label: 'Verifiers' },
    { id: 'terms', label: 'Terms' },
  ];

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nextIndex =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
    const btn = document.getElementById(`tab-${nextTab}`);
    btn?.focus();
  };

  return (
    <div className="programme-tabs-card">
      <div
        role="tablist"
        aria-label="Programme details"
        className="programme-tabs__list"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`programme-tabs__button ${
                isActive ? 'programme-tabs__button--active' : ''
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="programme-tabs__content">
        {activeTab === 'awards' && (
          <AwardsTab
            programmeId={programmeId}
            phase={phase}
            isSample={isSample}
            asset={asset}
          />
        )}
        {activeTab === 'verifiers' && (
          <VerifiersTab verifiers={verifiers} />
        )}
        {activeTab === 'terms' && (
          <TermsTab
            programmeId={programmeId}
            mode={mode}
            quorum={quorum}
            asset={asset}
          />
        )}
      </div>
    </div>
  );
};
