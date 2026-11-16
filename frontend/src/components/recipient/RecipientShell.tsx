import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useWallet } from '../../context/useWallet';
import { usePageTitle } from '../../hooks/usePageTitle';
import { SignInSheet } from '../layout/SignInSheet';
import { Empty } from '../state/AsyncStates';
import { Button, PageHead } from '../ui';
import './RecipientShell.css';

export type RecipientSection = 'awards' | 'apply' | 'applications' | 'standing';

const TABS: { id: RecipientSection; label: string; to: string }[] = [
  { id: 'awards', label: 'My awards', to: '/recipients' },
  { id: 'apply', label: 'Apply', to: '/recipients?apply=1' },
  { id: 'applications', label: 'Applications', to: '/recipients/application-timeline' },
  { id: 'standing', label: 'Standing', to: '/recipients/standing' },
];

const TITLES: Record<RecipientSection, string> = {
  awards: 'Your awards',
  apply: 'Apply for funding',
  applications: 'Your applications',
  standing: 'Your standing',
};

/**
 * The recipient area's frame: one page head and the four sections as tabs,
 * shared by `/recipients` and its sub-routes so they read as one page.
 *
 * Signed out, it says what signing in would show instead of rendering empty
 * panels. `signedOut` content still renders below that, for a section with
 * something to offer without a wallet (Standing's lookup).
 */
export function RecipientShell({
  section,
  children,
  signedOut,
}: {
  section: RecipientSection;
  children: ReactNode;
  /** Shown under the sign-in prompt when no wallet is connected. */
  signedOut?: ReactNode;
}) {
  usePageTitle(TITLES[section]);
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="recipient">
      <PageHead eyebrow="Get funded" title={TITLES[section]}>
        <p>Each tranche unlocks when a verifier confirms its condition. Then you release it.</p>
      </PageHead>

      {address ? (
        <>
          <nav className="recipient__tabs" aria-label="Recipient sections">
            {TABS.map((tab) => (
              <Link
                key={tab.id}
                to={tab.to}
                className="recipient__tab"
                aria-current={tab.id === section ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          {children}
        </>
      ) : (
        <>
          <Empty
            title="Track your awards and release your money"
            description="Sign in to apply, follow each tranche, release money once a verifier has confirmed, and see your standing. You can browse every programme without signing in."
            action={
              <>
                <Button icon={<Wallet size={18} aria-hidden="true" />} onClick={() => setSignInOpen(true)}>
                  Sign in with Freighter
                </Button>
                <Link to="/directory" className="ui-button ui-button--ghost ui-button--md">
                  Find a programme
                </Link>
              </>
            }
          />
          {signedOut}
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
        </>
      )}
    </div>
  );
}
