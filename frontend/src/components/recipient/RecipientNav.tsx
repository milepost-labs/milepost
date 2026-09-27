import { Link } from 'react-router-dom';
import './RecipientNav.css';

export type RecipientSection = 'awards' | 'apply' | 'timeline' | 'standing';

interface RecipientNavProps {
  currentSection: RecipientSection;
}

const TABS: { id: RecipientSection; label: string; href: string }[] = [
  { id: 'awards', label: 'My awards', href: '/recipients/award-progress' },
  { id: 'apply', label: 'Apply', href: '/recipients?apply=1' },
  { id: 'timeline', label: 'Applications', href: '/recipients/application-timeline' },
  { id: 'standing', label: 'Standing', href: '/recipients/standing' },
];

export function RecipientNav({ currentSection }: RecipientNavProps) {
  return (
    <nav className="recipient-nav" aria-label="Recipient sections">
      {TABS.map((tab) => {
        const isActive = currentSection === tab.id;
        return (
          <Link
            key={tab.id}
            to={tab.href}
            className={`recipient-nav__pill ${isActive ? 'recipient-nav__pill--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
