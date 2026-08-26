import { useState, type FormEvent } from 'react';
import { Client, networks, type Policy } from '@milepost/policy-spend';
import { useWallet } from '../../context/useWallet';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { TransactionOutcome } from '../state/AsyncStates';
import { Badge, Button, Card, Field } from '../ui';
import './AllowlistManager.css';

const policyClient = new Client({
  ...networks.testnet,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

export interface AllowlistManagerProps {
  walletAddress: string;
}

export function AllowlistManager({ walletAddress }: AllowlistManagerProps) {
  const wallet = useWallet();
  const tx = useTransaction({ contract: 'policy' });

  const [candidatePayee, setCandidatePayee] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch policy to know who the steward is
  const policyRead = useContractResult<Policy>(
    () => policyClient.get_policy({ wallet: walletAddress }),
    [walletAddress],
    { enabled: Boolean(walletAddress), contract: 'policy' }
  );

  const policy = policyRead.data;
  const isSteward = Boolean(
    wallet.address && policy?.steward && wallet.address.toLowerCase() === policy.steward.toLowerCase()
  );

  // Check if candidate is payee
  const isValidCandidate = looksLikeAddress(candidatePayee);
  const isPayeeRead = useContractRead<boolean>(
    () => policyClient.is_payee({ wallet: walletAddress, payee: candidatePayee }),
    [walletAddress, candidatePayee],
    { enabled: isValidCandidate && Boolean(walletAddress), contract: 'policy' }
  );

  const isAlreadyPayee = Boolean(isPayeeRead.data);

  const handleAllowPayee = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(candidatePayee)) {
      setValidationError('Enter a valid Stellar payee address.');
      return;
    }

    if (!policy?.steward) {
      setValidationError('Policy steward is unknown or not configured.');
      return;
    }

    if (isAlreadyPayee) {
      setValidationError('This address is already on the allowlist.');
      return;
    }

    await tx.send(async () => {
      return policyClient.allow_payee({
        steward: policy.steward,
        wallet: walletAddress,
        payee: candidatePayee,
      });
    });

    if (!tx.error) {
      setCandidatePayee('');
      isPayeeRead.refetch();
    }
  };

  const handleDenyPayee = async (payeeAddr: string) => {
    setValidationError(null);

    if (!looksLikeAddress(payeeAddr)) {
      setValidationError('Invalid payee address.');
      return;
    }

    if (!policy?.steward) {
      setValidationError('Policy steward is unknown.');
      return;
    }

    await tx.send(async () => {
      return policyClient.deny_payee({
        steward: policy.steward,
        wallet: walletAddress,
        payee: payeeAddr,
      });
    });

    if (!tx.error) {
      isPayeeRead.refetch();
    }
  };

  return (
    <Card className="allowlist-manager-card">
      <div className="allowlist-header">
        <div>
          <h3 className="allowlist-title">Wallet Spend Allowlist</h3>
          <p className="allowlist-subtitle">
            Governs approved recipient payees for wallet <span className="mono">{truncateAddress(walletAddress)}</span>
          </p>
        </div>
        <Badge tone={isSteward ? 'accent' : 'neutral'}>
          {isSteward ? 'Steward Controls' : 'Read-Only'}
        </Badge>
      </div>

      {!isSteward && (
        <div className="read-only-banner" role="note">
          <p>
            You are viewing this allowlist in read-only mode. Only the policy steward ({policy?.steward ? truncateAddress(policy.steward) : 'Steward'}) can add or remove payees.
          </p>
        </div>
      )}

      {isSteward && (
        <form onSubmit={handleAllowPayee} className="allowlist-form">
          <Field label="Add Verified Payee" hint="Address permitted to receive funds under this wallet's spend policy">
            <div className="allowlist-input-group">
              <input
                type="text"
                className="input-text"
                value={candidatePayee}
                onChange={(e) => setCandidatePayee(e.target.value.trim())}
                placeholder="G..."
                required
              />
              <Button type="submit" loading={tx.busy} disabled={isAlreadyPayee || !isValidCandidate}>
                Add Payee
              </Button>
            </div>
          </Field>

          {isValidCandidate && (
            <div className="check-payee-status">
              Status: {isAlreadyPayee ? <span className="text-success">Already on Allowlist</span> : <span>Not on Allowlist</span>}
            </div>
          )}
        </form>
      )}

      {validationError && (
        <div className="form-error" role="alert">
          {validationError}
        </div>
      )}

      <TransactionOutcome
        phase={tx.phase}
        error={tx.error}
        successTitle="Allowlist updated"
        successDescription="The payee allowlist state has been updated on-chain."
      />

      <div className="allowlist-preview">
        <h4>Payee Verification Check</h4>
        {isValidCandidate ? (
          <div className="payee-row">
            <span className="mono">{candidatePayee}</span>
            <div className="payee-actions">
              <Badge tone={isAlreadyPayee ? 'success' : 'neutral'}>
                {isAlreadyPayee ? 'Allowed' : 'Not Allowed'}
              </Badge>
              {isSteward && isAlreadyPayee && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDenyPayee(candidatePayee)}
                  loading={tx.busy}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="no-payees-text">Enter a valid Stellar address above to verify or manage its allowlist status.</p>
        )}
      </div>
    </Card>
  );
}
