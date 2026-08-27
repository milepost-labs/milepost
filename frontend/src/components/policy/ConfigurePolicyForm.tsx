import { useState, type FormEvent } from 'react';
import { Client, networks, type Policy } from '@milepost/policy-spend';
import { useWallet } from '../../context/useWallet';
import { useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { formatAmount, formatExact, tryParseAmount } from '../../lib/amount';
import { looksLikeAddress } from '../../lib/format';
import { TransactionOutcome } from '../state/AsyncStates';
import { Badge, Button, Card, Field } from '../ui';
import './ConfigurePolicyForm.css';

const policyClient = new Client({
  ...networks.testnet,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Default native XLM SAC address on testnet if none provided
const DEFAULT_TOKEN_ADDRESS = 'CDLZFC3SYJYDVR72C5YAVZ2VFL3B4QYKL5M3P5B32E7ZTR2ZFL6G2G3Y';

export interface ConfigurePolicyFormProps {
  initialWallet?: string;
  onSuccess?: () => void;
}

export function ConfigurePolicyForm({ initialWallet = '', onSuccess }: ConfigurePolicyFormProps) {
  const wallet = useWallet();
  const tx = useTransaction({ contract: 'policy', onSuccess });

  const [walletInput, setWalletInput] = useState(initialWallet || (wallet.address ?? ''));
  const [stewardInput, setStewardInput] = useState(wallet.address ?? '');
  const [tokenInput, setTokenInput] = useState(DEFAULT_TOKEN_ADDRESS);
  const [capInput, setCapInput] = useState('100');
  const [periodInput, setPeriodInput] = useState('86400'); // Default 1 day (86400s)

  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch existing policy for the entered wallet address
  const isValidWalletAddr = looksLikeAddress(walletInput);
  const existingPolicyRead = useContractResult<Policy>(
    () => policyClient.get_policy({ wallet: walletInput }),
    [walletInput],
    { enabled: isValidWalletAddr, contract: 'policy' }
  );

  const existingPolicy = existingPolicyRead.data;
  const isFirstConfiguration = !existingPolicyRead.loading && !existingPolicy;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(walletInput)) {
      setValidationError('Enter a valid wallet address.');
      return;
    }
    if (!looksLikeAddress(stewardInput)) {
      setValidationError('Enter a valid steward address.');
      return;
    }
    if (!looksLikeAddress(tokenInput)) {
      setValidationError('Enter a valid token address.');
      return;
    }

    const capParsed = tryParseAmount(capInput);
    if (!capParsed.ok) {
      setValidationError(`Invalid cap amount: ${capParsed.error}`);
      return;
    }

    const periodSeconds = Number(periodInput);
    if (isNaN(periodSeconds) || periodSeconds <= 0) {
      setValidationError('Period must be greater than zero seconds.');
      return;
    }

    await tx.send(async () => {
      return policyClient.configure({
        steward: stewardInput,
        wallet: walletInput,
        token: tokenInput,
        cap: capParsed.value,
        period: BigInt(periodSeconds),
      });
    });
  };

  return (
    <Card className="configure-policy-card">
      <div className="configure-policy-header">
        <h2 className="configure-policy-title">Configure Spend Policy</h2>
        {existingPolicy ? (
          <Badge tone="success">Policy Active</Badge>
        ) : (
          <Badge tone="accent">First Configuration</Badge>
        )}
      </div>

      {existingPolicy && (
        <div className="existing-policy-callout">
          <h4>Existing Policy Found</h4>
          <p>
            <strong>Cap:</strong> {formatAmount(existingPolicy.cap, { asset: 'XLM' })} ({formatExact(existingPolicy.cap)} stroops)
          </p>
          <p>
            <strong>Period:</strong> {Number(existingPolicy.period)} seconds ({Math.round(Number(existingPolicy.period) / 3600)} hours)
          </p>
          <p>
            <strong>Steward:</strong> <span className="mono">{existingPolicy.steward}</span>
          </p>
          <p className="policy-note">Re-configuring will update parameters and requires steward authorization.</p>
        </div>
      )}

      {isFirstConfiguration && isValidWalletAddr && (
        <div className="dual-auth-warning" role="note">
          <p>
            <strong>First-Time Dual Authorization Required:</strong>
          </p>
          <p>
            The initial policy configuration requires signatures from <strong>both</strong> the steward and the target wallet address before any spending occurs. A single-signer request will fail.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="configure-policy-form">
        <Field label="Target Wallet Address" hint="The smart wallet receiving the spend policy">
          <input
            type="text"
            className="input-text"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value.trim())}
            placeholder="G..."
            required
          />
        </Field>

        <Field label="Steward Address" hint="Account permitted to edit allowlist & policy rules">
          <input
            type="text"
            className="input-text"
            value={stewardInput}
            onChange={(e) => setStewardInput(e.target.value.trim())}
            placeholder="G..."
            required
          />
        </Field>

        <Field label="Token Address" hint="Asset address governing this spend policy">
          <input
            type="text"
            className="input-text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value.trim())}
            placeholder="C..."
            required
          />
        </Field>

        <div className="form-row">
          <Field label="Spending Cap (in XLM)" hint="Maximum spend allowed within one period">
            <input
              type="text"
              className="input-text"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              placeholder="e.g. 100"
              required
            />
          </Field>

          <Field label="Period (in seconds)" hint="Window length (e.g. 86400 for 1 day)">
            <input
              type="number"
              className="input-text"
              value={periodInput}
              onChange={(e) => setPeriodInput(e.target.value)}
              placeholder="86400"
              min="1"
              required
            />
          </Field>
        </div>

        {validationError && (
          <div className="form-error" role="alert">
            {validationError}
          </div>
        )}

        <TransactionOutcome
          phase={tx.phase}
          error={tx.error}
          successTitle="Spend policy configured successfully"
          successDescription="The policy rules have been set on-chain."
        />

        <Button type="submit" loading={tx.busy}>
          {existingPolicy ? 'Update Policy' : 'Configure Policy (Dual Sign)'}
        </Button>
      </form>
    </Card>
  );
}
