import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldOff, AlertTriangle, Check } from 'lucide-react';
import { useProgramme } from '../hooks/useProgramme';
import { useContractRead, useTransaction, phaseLabel } from '../hooks';
import { Button, Field, Modal } from '../components/ui';
import { Badge } from '../components/ui/Badge';
import './PayeeManager.css';

const STORAGE_PREFIX = 'milepost:payees:';

function loadPayees(programmeId: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + programmeId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePayees(programmeId: string, payees: string[]) {
  localStorage.setItem(STORAGE_PREFIX + programmeId, JSON.stringify(payees));
}

function isValidAddress(addr: string): boolean {
  return /^[GS][A-Z0-9]{55}$/.test(addr);
}

/* ---------- payee row (owns its own useContractRead) ---------- */

interface PayeeRowProps {
  addr: string;
  programme: ReturnType<typeof useProgramme>['client'];
  onRemove: (addr: string) => void;
  disabled: boolean;
}

function PayeeRow({ addr, programme, onRemove, disabled }: PayeeRowProps) {
  const { data, loading, error } = useContractRead(
    useCallback(() => programme.is_payee({ payee: addr }), [programme, addr]),
    [programme, addr],
  );

  return (
    <div className="payee-item">
      <div className="payee-item__icon" aria-hidden="true">
        <ShieldCheck size={18} />
      </div>
      <div className="payee-item__info">
        <span className="payee-item__addr">{addr}</span>
        <span className="payee-item__status">
          {loading ? (
            <Badge tone="neutral">Checking…</Badge>
          ) : error ? (
            <Badge tone="warning">Check failed</Badge>
          ) : data === true ? (
            <Badge tone="success">Verified on-chain</Badge>
          ) : (
            <Badge tone="neutral">Not on chain</Badge>
          )}
        </span>
      </div>
      <button
        type="button"
        className="payee-item__remove"
        onClick={() => onRemove(addr)}
        disabled={disabled}
        aria-label={`Remove payee ${addr}`}
      >
        <ShieldOff size={16} />
      </button>
    </div>
  );
}

/* ---------- main component ---------- */

export const PayeeManager = () => {
  const { id: programmeId, client: programme } = useProgramme();
  const tx = useTransaction({ contract: 'program' });

  const [payees, setPayees] = useState<string[]>(() => loadPayees(programmeId));
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const persist = (next: string[]) => {
    setPayees(next);
    savePayees(programmeId, next);
  };

  const handleAdd = async () => {
    const addr = draft.trim();
    if (!addr) return;
    if (!isValidAddress(addr)) {
      setDraftError('Must be a valid Stellar address (G or S prefix, 56 characters).');
      return;
    }
    if (payees.includes(addr)) {
      setDraftError('This address is already in your list.');
      return;
    }

    setDraftError(null);

    const result = await tx.send(() =>
      programme.allow_payee({ payee: addr }),
    );

    if (result) {
      persist([...payees, addr]);
      setDraft('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const openRemoveConfirm = (addr: string) => {
    setConfirmRemove(addr);
    setAcknowledged(false);
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;

    const result = await tx.send(() =>
      programme.deny_payee({ payee: confirmRemove }),
    );

    if (result) {
      persist(payees.filter((a) => a !== confirmRemove));
      setConfirmRemove(null);
      setAcknowledged(false);
    }
  };

  const handleCloseConfirm = () => {
    if (tx.busy) return;
    setConfirmRemove(null);
    setAcknowledged(false);
  };

  return (
    <div className="dashboard-container">
      <div className="payee-header animate-fade-up">
        <Link to="/funders" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>← Back to Dashboard</Link>
        <h1>Manage Payees</h1>
        <p className="typo-text text-muted">
          Verified payees are the only addresses this programme can pay.
          Only the programme creator can add or remove payees.
        </p>
      </div>

      <section className="payee-summary animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="payee-stat glass-panel">
          <div className="payee-stat__icon" aria-hidden="true"><ShieldCheck size={24} /></div>
          <div>
            <span className="payee-stat__label">Stored payees</span>
            <span className="payee-stat__value numeric">{payees.length}</span>
          </div>
        </div>
        <div className="payee-stat glass-panel">
          <div className="payee-stat__icon payee-stat__icon--verified" aria-hidden="true"><Check size={24} /></div>
          <div>
            <span className="payee-stat__label">On-chain verified</span>
            <span className="payee-stat__value numeric">—</span>
          </div>
        </div>
      </section>

      <section className="payee-add glass-panel animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2>Add payee</h2>
        <p className="typo-text-sm text-muted">
          Enter the Stellar address of a person or organisation that this programme should be able to pay.
        </p>
        <div className="payee-add__row">
          <Field label="Payee address" hint="G… or S… (56 characters)" error={draftError ?? undefined}>
            <input
              type="text"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="Enter Stellar address"
              className="ui-input"
              disabled={tx.busy}
            />
          </Field>
          <Button
            type="button"
            onClick={handleAdd}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase)}
            disabled={!draft.trim() || !isValidAddress(draft.trim()) || tx.busy}
            style={{ alignSelf: 'flex-end' }}
          >
            Verify Payee
          </Button>
        </div>
      </section>

      <section className="payee-list glass-panel animate-fade-up" style={{ animationDelay: '300ms' }}>
        <h2>Verified payees</h2>
        {payees.length === 0 ? (
          <div className="payee-empty">
            <ShieldCheck size={40} aria-hidden="true" />
            <p>No payees added yet. Use the form above to verify a payee address.</p>
          </div>
        ) : (
          <div className="payee-items">
            {payees.map((addr) => (
              <PayeeRow
                key={addr}
                addr={addr}
                programme={programme}
                onRemove={openRemoveConfirm}
                disabled={tx.busy}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={!!confirmRemove}
        onClose={handleCloseConfirm}
        title="Remove payee"
        busy={tx.busy}
      >
        <div className="payee-confirm">
          <div className="payee-confirm__icon" aria-hidden="true">
            <AlertTriangle size={32} />
          </div>
          <p>
            This will remove <strong>{confirmRemove}</strong> as a verified payee.
          </p>
          <div className="payee-confirm__warning">
            <strong>Important:</strong> This does not claw back any payments already sent to this address.
            It only prevents future payments from being directed to them.
          </div>
          <label className="payee-confirm__check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={tx.busy}
            />
            I understand past payments are unaffected
          </label>
        </div>

        <div className="payee-confirm__footer" slot="footer">
          <Button type="button" variant="ghost" onClick={handleCloseConfirm} disabled={tx.busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleRemove}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase)}
            disabled={!acknowledged || tx.busy}
          >
            Remove Payee
          </Button>
        </div>
      </Modal>

      {tx.error && (
        <div className="wizard-error" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <div className="wizard-error__message">{tx.error.message}</div>
          {tx.error.action && <div className="wizard-error__action">{tx.error.action}</div>}
        </div>
      )}
    </div>
  );
};
