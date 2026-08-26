import { useState, type FormEvent } from 'react';
import { Client, networks, type Config } from '@milepost/registry';
import { useWallet } from '../../context/useWallet';
import { useContractResult } from '../../hooks/useContractRead';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { TransactionOutcome } from '../state/AsyncStates';
import { Badge, Button, Card, Field, Modal } from '../ui';
import './RegistryAdminConsole.css';

const registryClient = new Client({
  ...networks.testnet,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

const MAX_FEE_BPS = 1000; // 10%

export function RegistryAdminConsole() {
  const wallet = useWallet();

  const configRead = useContractResult<Config>(
    () => registryClient.get_config(),
    [],
    { contract: 'registry' }
  );

  const config = configRead.data;
  const isAdmin = Boolean(
    wallet.address && config?.admin && wallet.address.toLowerCase() === config.admin.toLowerCase()
  );

  // Form states
  const [feeInput, setFeeInput] = useState<string>('');
  const [treasuryInput, setTreasuryInput] = useState<string>('');
  const [policyInput, setPolicyInput] = useState<string>('');
  const [newAdminInput, setNewAdminInput] = useState<string>('');

  // Confirmation modal state for set_admin handover
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminConfirmText, setAdminConfirmText] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);

  const txFee = useTransaction({ contract: 'registry', onSuccess: () => configRead.refetch() });
  const txTreasury = useTransaction({ contract: 'registry', onSuccess: () => configRead.refetch() });
  const txPolicy = useTransaction({ contract: 'registry', onSuccess: () => configRead.refetch() });
  const txAdmin = useTransaction({ contract: 'registry', onSuccess: () => configRead.refetch() });

  const handleSetFee = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const bps = Number(feeInput);
    if (isNaN(bps) || bps < 0) {
      setValidationError('Fee must be a valid non-negative integer in basis points.');
      return;
    }
    if (bps > MAX_FEE_BPS) {
      setValidationError(`Fee cannot exceed maximum protocol cap of ${MAX_FEE_BPS} bps (10%).`);
      return;
    }

    await txFee.send(async () => {
      return registryClient.set_fee({ fee_bps: bps });
    });
  };

  const handleSetTreasury = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(treasuryInput)) {
      setValidationError('Enter a valid treasury Stellar address.');
      return;
    }

    await txTreasury.send(async () => {
      return registryClient.set_treasury({ treasury: treasuryInput });
    });
  };

  const handleSetPolicy = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(policyInput)) {
      setValidationError('Enter a valid policy contract address.');
      return;
    }

    await txPolicy.send(async () => {
      return registryClient.set_policy({ policy: policyInput });
    });
  };

  const handleTransferAdminConfirm = async () => {
    setValidationError(null);

    if (!looksLikeAddress(newAdminInput)) {
      setValidationError('Enter a valid new admin address.');
      return;
    }

    if (adminConfirmText.trim().toLowerCase() !== newAdminInput.trim().toLowerCase()) {
      setValidationError('Confirmation input must match the exact new admin address.');
      return;
    }

    await txAdmin.send(async () => {
      return registryClient.set_admin({ admin: newAdminInput });
    });

    if (!txAdmin.error) {
      setAdminModalOpen(false);
      setAdminConfirmText('');
      setNewAdminInput('');
    }
  };

  return (
    <Card className="registry-admin-card">
      <div className="registry-admin-header">
        <div>
          <h2 className="registry-admin-title">Protocol Registry Admin Console</h2>
          <p className="registry-admin-subtitle">
            Manage protocol-wide defaults, fees, treasury destination, and admin control
          </p>
        </div>
        <Badge tone={isAdmin ? 'accent' : 'neutral'}>
          {isAdmin ? 'Protocol Admin' : 'Read-Only'}
        </Badge>
      </div>

      {!isAdmin && (
        <div className="admin-read-only-banner" role="note">
          <p>
            You are viewing the registry configuration in <strong>read-only</strong> mode. Connected wallet ({wallet.address ? truncateAddress(wallet.address) : 'None'}) is not the protocol admin ({config?.admin ? truncateAddress(config.admin) : 'Admin'}).
          </p>
        </div>
      )}

      {config && (
        <div className="registry-config-grid">
          <div className="config-item">
            <span className="config-label">Protocol Admin:</span>
            <span className="mono">{config.admin}</span>
          </div>

          <div className="config-item">
            <span className="config-label">Treasury Address:</span>
            <span className="mono">{config.treasury}</span>
          </div>

          <div className="config-item">
            <span className="config-label">Protocol Fee:</span>
            <span>
              <strong>{config.fee_bps} bps</strong> ({config.fee_bps / 100}%) — <em>Cap: 1000 bps (10%)</em>
            </span>
          </div>

          <div className="config-item">
            <span className="config-label">Attestation Registry:</span>
            <span className="mono">{config.attest}</span>
          </div>

          <div className="config-item">
            <span className="config-label">Default Policy Contract:</span>
            <span className="mono">{config.policy}</span>
          </div>

          <div className="config-item">
            <span className="config-label">Record Contract:</span>
            <span className="mono">{config.record}</span>
          </div>
        </div>
      )}

      {validationError && (
        <div className="form-error" role="alert">
          {validationError}
        </div>
      )}

      {isAdmin && (
        <div className="admin-actions-section">
          <h3>Admin Controls</h3>

          {/* Fee Form */}
          <form onSubmit={handleSetFee} className="admin-form-block">
            <Field label="Set Protocol Fee (bps)" hint="Basis points (1 bps = 0.01%). Maximum cap: 1000 bps (10%)">
              <div className="input-with-button">
                <input
                  type="number"
                  className="input-text"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  placeholder={`Current: ${config?.fee_bps ?? 250}`}
                  max={MAX_FEE_BPS}
                  min="0"
                />
                <Button type="submit" loading={txFee.busy}>
                  Update Fee
                </Button>
              </div>
            </Field>
            <TransactionOutcome phase={txFee.phase} error={txFee.error} successTitle="Fee updated" />
          </form>

          {/* Treasury Form */}
          <form onSubmit={handleSetTreasury} className="admin-form-block">
            <Field label="Set Treasury Address" hint="Destination for collected protocol fees">
              <div className="input-with-button">
                <input
                  type="text"
                  className="input-text"
                  value={treasuryInput}
                  onChange={(e) => setTreasuryInput(e.target.value.trim())}
                  placeholder={`Current: ${config?.treasury ? truncateAddress(config.treasury) : 'G...'}`}
                />
                <Button type="submit" loading={txTreasury.busy}>
                  Update Treasury
                </Button>
              </div>
            </Field>
            <TransactionOutcome phase={txTreasury.phase} error={txTreasury.error} successTitle="Treasury updated" />
          </form>

          {/* Policy Contract Form */}
          <form onSubmit={handleSetPolicy} className="admin-form-block">
            <Field label="Set Spend Policy Contract" hint="Default policy contract inherited by new programmes">
              <div className="input-with-button">
                <input
                  type="text"
                  className="input-text"
                  value={policyInput}
                  onChange={(e) => setPolicyInput(e.target.value.trim())}
                  placeholder={`Current: ${config?.policy ? truncateAddress(config.policy) : 'C...'}`}
                />
                <Button type="submit" loading={txPolicy.busy}>
                  Update Policy
                </Button>
              </div>
            </Field>
            <TransactionOutcome phase={txPolicy.phase} error={txPolicy.error} successTitle="Default policy updated" />
          </form>

          {/* Irreversible Admin Handover Section */}
          <div className="admin-handover-block">
            <h4>Transfer Protocol Admin Control</h4>
            <p className="handover-warning">
              <strong>Warning:</strong> Transferring admin rights is an <strong>irreversible operation</strong>. Once set, you will immediately lose administrative access over protocol settings.
            </p>
            <Button variant="danger" onClick={() => setAdminModalOpen(true)}>
              Transfer Admin Ownership
            </Button>
            <TransactionOutcome phase={txAdmin.phase} error={txAdmin.error} successTitle="Admin control transferred" />
          </div>
        </div>
      )}

      {/* Confirmation Modal for Admin Handover */}
      <Modal open={adminModalOpen} title="Confirm Admin Handover" onClose={() => setAdminModalOpen(false)}>
          <div className="admin-modal-body">
            <p className="admin-modal-danger">
              You are about to transfer full protocol administrative control to a new address. This action cannot be undone.
            </p>

            <Field label="New Admin Address" hint="Stellar address taking over protocol administration">
              <input
                type="text"
                className="input-text"
                value={newAdminInput}
                onChange={(e) => setNewAdminInput(e.target.value.trim())}
                placeholder="G..."
              />
            </Field>

            {looksLikeAddress(newAdminInput) && (
              <Field label="Re-type New Admin Address to Confirm" hint="Type the exact new admin address to confirm handover">
                <input
                  type="text"
                  className="input-text"
                  value={adminConfirmText}
                  onChange={(e) => setAdminConfirmText(e.target.value.trim())}
                  placeholder="Re-enter G..."
                />
              </Field>
            )}

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setAdminModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={txAdmin.busy}
                disabled={!looksLikeAddress(newAdminInput) || adminConfirmText !== newAdminInput}
                onClick={handleTransferAdminConfirm}
              >
                Confirm Irreversible Transfer
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }
