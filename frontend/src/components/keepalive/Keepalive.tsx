import { Buffer } from 'buffer';
import { Clock, ShieldCheck } from 'lucide-react';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction, phaseLabel } from '../../hooks/useTransaction';
import { Badge, Button, Card } from '../ui';
import './Keepalive.css';

const DAY_SECONDS = 86400;
const EXPIRY_WARNING_DAYS = 45;

function archivalExplainer() {
  return (
    <>
      <p className="typo-text text-muted keepalive__explain">
        Soroban stores entries like attestations and standing records on-chain with an expiry. If nobody
        extends (bumps) the entry, it becomes <strong>archived</strong> — it still exists but reads as missing until
        restored. Protocol 23 auto-restores archived entries, but restoration costs extra and can fail at the worst
        moment — for example when a proof is needed to release funds.
      </p>
      <p className="typo-text text-muted keepalive__explain">
        Every keepalive can be done by <strong>anyone</strong> — you don&apos;t need to own the attestation or the
        standing record. If you&apos;re willing to pay the fee, you can keep someone else&apos;s entry alive.
      </p>
      <p className="typo-text text-muted keepalive__explain" style={{ fontSize: 'var(--text-sm)' }}>
        Entries are extended to ~90 days from the bump, and only re-extended when under ~60 days remaining — calling
        keepalive in a loop cannot push expiry out without bound.
      </p>
    </>
  );
}

export function AttestationKeepalive({ uid, createdAt }: { uid: Buffer; createdAt: bigint }) {
  const { attest } = useSoroban();
  const tx = useTransaction({ contract: 'attest' });

  const now = Math.floor(Date.now() / 1000);
  const ageDays = Math.floor((now - Number(createdAt)) / DAY_SECONDS);
  const approaching = ageDays >= EXPIRY_WARNING_DAYS;

  const handleKeepalive = () =>
    tx.send(async () => {
      const built = await attest.keepalive({ uid });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

  return (
    <Card
      title="Keep this attestation alive"
      aside={
        approaching ? (
          <Badge tone="warning">May need keepalive</Badge>
        ) : (
          <Badge tone="neutral">Archival protection</Badge>
        )
      }
    >
      <div className="keepalive">
        {approaching && (
          <div className="keepalive__flag" role="status">
            <Clock size={16} aria-hidden="true" />
            <span>
              This attestation was created {ageDays} days ago and is approaching the window where it should be
              extended. Consider bumping it now.
            </span>
          </div>
        )}
        {archivalExplainer()}
        <div className="keepalive__actions">
          <Button
            onClick={() => void handleKeepalive()}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase) || 'Extending…'}
            icon={<ShieldCheck size={16} />}
          >
            Extend expiry (keepalive)
          </Button>
          {tx.phase === 'success' && (
            <span className="keepalive__success" role="status">
              Extended — this attestation&apos;s expiry is now ~90 days out.
            </span>
          )}
        </div>
        {tx.error && (
          <div className={`state-error state-error--${tx.error.kind}`} role="alert">
            <p className="state-error__message">{tx.error.message}</p>
            {tx.error.action && <p className="state-error__action">{tx.error.action}</p>}
          </div>
        )}
        <p className="typo-text text-muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
          Permissionless: anyone may extend anyone&apos;s entry.
        </p>
      </div>
    </Card>
  );
}

export function StandingKeepalive({ subject, lastSeen }: { subject: string; lastSeen: bigint }) {
  const { record } = useSoroban();
  const tx = useTransaction({ contract: 'record' });

  const now = Math.floor(Date.now() / 1000);
  const ageDays = Math.floor((now - Number(lastSeen)) / DAY_SECONDS);
  const approaching = ageDays >= EXPIRY_WARNING_DAYS;

  const handleKeepalive = () =>
    tx.send(async () => {
      const built = await record.keepalive({ subject });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

  return (
    <Card
      title="Keep this standing alive"
      aside={
        approaching ? (
          <Badge tone="warning">May need keepalive</Badge>
        ) : (
          <Badge tone="neutral">Archival protection</Badge>
        )
      }
    >
      <div className="keepalive">
        {approaching && (
          <div className="keepalive__flag" role="status">
            <Clock size={16} aria-hidden="true" />
            <span>
              Last update was {ageDays} days ago — this standing is approaching the window where it should be
              extended.
            </span>
          </div>
        )}
        <p className="typo-text text-muted keepalive__explain">
          A recipient&apos;s standing is a long-lived, persistent record — but like any Soroban persistent entry it
          expires if nobody bumps it. An archived standing reads as missing and can break underwriting until restored.
          Restoration is automatic but costs extra and can fail at the worst moment.
        </p>
        <p className="typo-text text-muted keepalive__explain">
          Anyone may keep it alive — the recipient themselves, a programme, or any observer willing to pay the fee.
        </p>
        <p className="typo-text text-muted keepalive__explain" style={{ fontSize: 'var(--text-sm)' }}>
          Entries are extended to ~90 days from the bump, and only re-extended when under ~60 days remaining —
          calling keepalive in a loop cannot push expiry out without bound.
        </p>
        <div className="keepalive__actions">
          <Button
            onClick={() => void handleKeepalive()}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase) || 'Extending…'}
            icon={<ShieldCheck size={16} />}
          >
            Extend expiry (keepalive)
          </Button>
          {tx.phase === 'success' && (
            <span className="keepalive__success" role="status">
              Extended — this standing&apos;s expiry is now ~90 days out.
            </span>
          )}
        </div>
        {tx.error && (
          <div className={`state-error state-error--${tx.error.kind}`} role="alert">
            <p className="state-error__message">{tx.error.message}</p>
            {tx.error.action && <p className="state-error__action">{tx.error.action}</p>}
          </div>
        )}
        <p className="typo-text text-muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
          Permissionless: anyone may extend anyone&apos;s entry.
        </p>
      </div>
    </Card>
  );
}
