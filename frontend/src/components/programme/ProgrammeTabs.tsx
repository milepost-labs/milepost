import { useRef, useState, type FC, type KeyboardEvent } from 'react';
import { AwardsTab } from './AwardsTab';
import { VerifiersTab } from './VerifiersTab';
import { TermsTab } from './TermsTab';
import type { VerifierFixture } from '../../fixtures/programmeFixtures';
import './ProgrammeTabs.css';

export type TabKey = 'awards' | 'verifiers' | 'terms';

export interface ProgrammeTabsProps {
  programmeId: string;
  phase?: string;
  quorum?: number;
  isSample?: boolean;
  asset?: string;
  verifiers?: VerifierFixture[];
  defaultTab?: TabKey;
}

export const ProgrammeTabs: FC<ProgrammeTabsProps> = ({
  programmeId,
  phase = 'Open',
  quorum = 1,
  isSample = false,
  asset = 'USDC',
  verifiers,
  defaultTab = 'awards',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  // Own refs rather than document.getElementById: the ids are only unique while
  // one ProgrammeTabs is mounted, and a lookup by id silently focuses the wrong
  // tab as soon as a second programme is on the page (the directory renders one
  // card per programme).
  const buttons = useRef<Record<TabKey, HTMLButtonElement | null>>({
    awards: null,
    verifiers: null,
    terms: null,
  });

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: 'awards', label: 'Awards' },
    { id: 'verifiers', label: 'Verifiers' },
    { id: 'terms', label: 'Terms' },
  ];

  const select = (id: TabKey) => {
    setActiveTab(id);
    buttons.current[id]?.focus();
  };

  // The APG tab pattern: arrows move and wrap, Home and End jump to the ends.
  // Activation follows focus here, which is the automatic pattern for a tab set
  // whose panels are cheap to render.
  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    let nextIndex: number;
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(tabs[nextIndex].id);
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
              ref={(node) => {
                buttons.current[tab.id] = node;
              }}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(tab.id)}
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
            quorum={quorum}
            asset={asset}
          />
        )}
      </div>
    </div>
  );
};
