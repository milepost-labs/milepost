import { useState, type FormEvent, type ReactNode } from 'react';
import type { Config } from '@milepost/registry';
import { useContractResult } from '../../hooks/useContractRead';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useTransaction } from '../../hooks/useTransaction';
import { looksLikeAddress, truncateAddress } from '../../lib/format';
import { AddressChip, Badge, Button, Field, Modal } from '../ui';
import { Loading, TransactionOutcome } from '../state/AsyncStates';
import { FIXTURE_PROTOCOL_CONFIG } from '../../fixtures/adminFixtures';
import './ProtocolConfigCard.css';

/** Refused above this cap; matches `MAX_FEE_BPS` in `contracts/registry/src/lib.rs`. */
const MAX_FEE_BPS = 1_000;

/**
 * Protocol configuration, read from the registry — never hard-coded — plus
 * the registry admin's edit controls for it (issue #342).
 *
 * The registry holds the fee, treasury and the addresses of the attestation,
 * standing and default-policy contracts; treasury and fee come from
 * configuration rather than the caller, so a creator cannot pay a fee to
 * themselves. Anyone evaluating the protocol can read every value here —
 * every address is copyable — but only the connected registry admin sees the
 * controls to change one. This used to be two separate views (this read-only
 * card, and a full `RegistryAdminConsole` duplicating the same six fields
 * plus edit forms); they are now one, so there is one place that shows a
 * setting and one place that changes it.
 */
export function ProtocolConfigCard() {
  const { registry } = useSoroban();
  const wallet = useWallet();
  const configRead = useContractResult<Config>(() => registry.get_config(), [registry], {
    contract: 'registry',
  });

  const live = configRead.data;
  const feeBps = live?.fee_bps ?? FIXTURE_PROTOCOL_CONFIG.feeBps;
  const treasury = live?.treasury ?? FIXTURE_PROTOCOL_CONFIG.treasury;
  const attest = live?.attest ?? FIXTURE_PROTOCOL_CONFIG.attest;
  const record = live?.record ?? FIXTURE_PROTOCOL_CONFIG.record;
  const policy = live?.policy ?? FIXTURE_PROTOCOL_CONFIG.policy;
  const admin = live?.admin ?? FIXTURE_PROTOCOL_CONFIG.admin;
  const sample = !live;

  const isAdmin = Boolean(wallet.address && live && wallet.address.toLowerCase() === admin.toLowerCase());

  const rows: { k: string; v: ReactNode }[] = [
    { k: 'Protocol fee', v: <span className="numeric">{feeBps / 100}%</span> },
    { k: 'Treasury', v: <AddressChip address={treasury} copyLabel="Copy treasury address" /> },
    { k: 'Attest contract', v: <AddressChip address={attest} copyLabel="Copy attestation contract address" /> },
    { k: 'Record contract', v: <AddressChip address={record} copyLabel="Copy record contract address" /> },
    { k: 'Default policy', v: <AddressChip address={policy} copyLabel="Copy default policy address" /> },
    { k: 'Registry admin', v: <AddressChip address={admin} copyLabel="Copy registry admin address" /> },
  ];

  return (
    <section className="protocol-config" aria-labelledby="protocol-config">
      <div className="protocol-config__head">
        <h2 id="protocol-config">Protocol config</h2>
        {sample && <Badge tone="neutral">Sample data</Badge>}
        {!sample && <Badge tone={isAdmin ? 'accent' : 'neutral'}>{isAdmin ? 'Registry admin' : 'Read-only'}</Badge>}
      </div>
      {configRead.loading && !live ? (
        <Loading label="Loading protocol config" rows={3} />
      ) : (
        <dl className="protocol-config__rows">
          {rows.map((row) => (
            <div key={row.k} className="protocol-config__row">
              <dt>{row.k}</dt>
              <dd>{row.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="protocol-config__foot">
        Read from the registry. Treasury and fee come from configuration rather than the
        caller, so a creator cannot pay a fee to themselves.
        {sample && ' Sample values for the design phase.'}
      </p>

      {!sample && !isAdmin && wallet.address && (
        <p className="protocol-config__note" role="note">
          You are viewing in read-only mode. Connected wallet (
          <AddressChip address={wallet.address} copyLabel="Copy your address" />) is not the
          registry admin ({<AddressChip address={admin} copyLabel="Copy registry admin address" />}).
        </p>
      )}

      {isAdmin && live && <ProtocolConfigEditor config={live} onChanged={configRead.refetch} />}
    </section>
  );
}

/**
 * The registry admin's edit forms — split out of `ProtocolConfigCard` so the
 * read view above never has to think about transaction state, and so this
 * only ever mounts (and only ever calls `set_*`) for a wallet already proven
 * to be the admin.
 */
function ProtocolConfigEditor({ config, onChanged }: { config: Config; onChanged: () => void }) {
  const { registry } = useSoroban();

  const [feeInput, setFeeInput] = useState('');
  const [treasuryInput, setTreasuryInput] = useState('');
  const [policyInput, setPolicyInput] = useState('');
  const [newAdminInput, setNewAdminInput] = useState('');
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminConfirmText, setAdminConfirmText] = useState('');

  const [feeError, setFeeError] = useState<string | null>(null);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const txFee = useTransaction({ contract: 'registry', onSuccess: onChanged });
  const txTreasury = useTransaction({ contract: 'registry', onSuccess: onChanged });
  const txPolicy = useTransaction({ contract: 'registry', onSuccess: onChanged });
  const txAdmin = useTransaction({ contract: 'registry', onSuccess: onChanged });

  const handleSetFee = async (e: FormEvent) => {
    e.preventDefault();
    setFeeError(null);

    const bps = Number(feeInput);
    if (feeInput.trim() === '' || !Number.isInteger(bps) || bps < 0) {
      setFeeError('Enter a whole number of basis points, 0 or greater.');
      return;
    }
    if (bps > MAX_FEE_BPS) {
      setFeeError(`Fee cannot exceed the protocol cap of ${MAX_FEE_BPS} bps (${MAX_FEE_BPS / 100}%).`);
      return;
    }

    const result = await txFee.send(() => registry.set_fee({ fee_bps: bps }));
    if (result !== null) setFeeInput('');
  };

  const handleSetTreasury = async (e: FormEvent) => {
    e.preventDefault();
    setTreasuryError(null);

    if (!looksLikeAddress(treasuryInput)) {
      setTreasuryError('Enter a valid Stellar address.');
      return;
    }

    const result = await txTreasury.send(() => registry.set_treasury({ treasury: treasuryInput }));
    if (result !== null) setTreasuryInput('');
  };

  const handleSetPolicy = async (e: FormEvent) => {
    e.preventDefault();
    setPolicyError(null);

    if (!looksLikeAddress(policyInput)) {
      setPolicyError('Enter a valid contract address.');
      return;
    }

    const result = await txPolicy.send(() => registry.set_policy({ policy: policyInput }));
    if (result !== null) setPolicyInput('');
  };

  const openAdminModal = () => {
    setAdminError(null);
    setNewAdminInput('');
    setAdminConfirmText('');
    txAdmin.reset();
    setAdminModalOpen(true);
  };

  const handleTransferAdmin = async () => {
    setAdminError(null);

    if (!looksLikeAddress(newAdminInput)) {
      setAdminError('Enter a valid Stellar address for the new admin.');
      return;
    }
    if (adminConfirmText.trim() !== newAdminInput.trim()) {
      setAdminError('The confirmation address does not match. Re-type it exactly.');
      return;
    }

    const result = await txAdmin.send(() => registry.set_admin({ admin: newAdminInput }));
    if (result !== null) {
      setAdminModalOpen(false);
      setNewAdminInput('');
      setAdminConfirmText('');
    }
  };

  const confirmDisabled =
    !looksLikeAddress(newAdminInput) || adminConfirmText.trim() !== newAdminInput.trim();

  return (
    <div className="protocol-config__editor">
      <h3 className="protocol-config__editor-title">Change protocol settings</h3>

      <form onSubmit={handleSetFee} className="protocol-config__form">
        <Field
          label="Protocol fee (bps)"
          hint={`Current: ${config.fee_bps} bps (${config.fee_bps / 100}%). 1 bps = 0.01%. Cap: ${MAX_FEE_BPS} bps.`}
          error={feeError}
          inputMode="numeric"
          value={feeInput}
          onChange={(e) => setFeeInput(e.target.value)}
        />
        <Button type="submit" loading={txFee.busy} className="protocol-config__form-submit">
          Set fee
        </Button>
        <TransactionOutcome phase={txFee.phase} error={txFee.error} successTitle="Fee updated" />
      </form>

      <form onSubmit={handleSetTreasury} className="protocol-config__form">
        <Field
          label="Treasury address"
          hint={`Current: ${truncateAddress(config.treasury)}. Destination for collected protocol fees.`}
          error={treasuryError}
          value={treasuryInput}
          onChange={(e) => setTreasuryInput(e.target.value.trim())}
          placeholder="G…"
        />
        <Button type="submit" loading={txTreasury.busy} className="protocol-config__form-submit">
          Set treasury
        </Button>
        <TransactionOutcome phase={txTreasury.phase} error={txTreasury.error} successTitle="Treasury updated" />
      </form>

      <form onSubmit={handleSetPolicy} className="protocol-config__form">
        <Field
          label="Default policy contract"
          hint={`Current: ${truncateAddress(config.policy)}. Inherited by new programmes.`}
          error={policyError}
          value={policyInput}
          onChange={(e) => setPolicyInput(e.target.value.trim())}
          placeholder="C…"
        />
        <Button type="submit" loading={txPolicy.busy} className="protocol-config__form-submit">
          Set policy
        </Button>
        <TransactionOutcome phase={txPolicy.phase} error={txPolicy.error} successTitle="Default policy updated" />
      </form>

      <div className="protocol-config__handover">
        <p className="protocol-config__handover-warning">
          Transferring registry admin is <strong>irreversible</strong>: once set, this wallet
          immediately loses every control on this page.
        </p>
        <Button variant="danger" onClick={openAdminModal}>
          Transfer registry admin
        </Button>
      </div>

      <Modal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        title="Confirm admin handover"
        busy={txAdmin.busy}
      >
        <p className="protocol-config__handover-warning">
          You are about to give up registry admin control. This cannot be undone from this
          wallet.
        </p>
        <Field
          label="New admin address"
          hint="Stellar address taking over registry administration."
          value={newAdminInput}
          onChange={(e) => setNewAdminInput(e.target.value.trim())}
          placeholder="G…"
        />
        {looksLikeAddress(newAdminInput) && (
          <Field
            label="Re-type the new admin address to confirm"
            error={adminError}
            hint={adminError ? undefined : 'Type it again, exactly, to confirm.'}
            value={adminConfirmText}
            onChange={(e) => setAdminConfirmText(e.target.value.trim())}
            placeholder="G…"
          />
        )}
        <TransactionOutcome phase={txAdmin.phase} error={txAdmin.error} successTitle="Admin transferred" />
        <div className="protocol-config__modal-actions">
          <Button variant="secondary" onClick={() => setAdminModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={txAdmin.busy}
            disabled={confirmDisabled}
            onClick={handleTransferAdmin}
          >
            Confirm irreversible transfer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
