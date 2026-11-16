import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { DeployProgramme } from '../components/admin/DeployProgramme';
import { ProtocolConfigCard } from '../components/admin/ProtocolConfigCard';
import { SignInSheet } from '../components/layout/SignInSheet';
import { Empty } from '../components/state/AsyncStates';
import { Button, PageHead } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { usePageTitle } from '../hooks/usePageTitle';
import './RegistryAdmin.css';

/**
 * `/admin`: deploy a programme through the registry. The wizard carries the
 * constructor's rules; the side column shows the protocol config read from
 * the registry, which is also where the registry admin changes it.
 *
 * Anyone can deploy: no permission from the registry is needed.
 */
export const RegistryAdmin = () => {
  usePageTitle('Deploy a programme');
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="registry-admin">
      <PageHead eyebrow="Admin" title="Deploy a programme">
        <p>
          Set the rules once. After deploying, the clock runs the phases. Reviewers, quorum, tranches and the schema
          can’t be changed.
        </p>
      </PageHead>
      {address ? (
        <DeployProgramme aside={<ProtocolConfigCard />} />
      ) : (
        <>
          <Empty
            title="Deploy your own programme"
            description="Anyone can deploy a programme. No permission from the registry is needed. Sign in to set it up; you pay the network fees for deploying."
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
        </>
      )}
    </div>
  );
};
