import { useEffect, useState } from 'react';
import { Buffer } from 'buffer';
import { Clock, ShieldCheck } from 'lucide-react';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction, phaseLabel } from '../../hooks/useTransaction';
import { Badge, Button, Card } from '../ui';
import './Keepalive.css';

const DAY_SECONDS = 86400;
const EXPIRY_WARNING_DAYS = 45;

// Ticking it as state matches AttestationLookup and keeps the age honest
// without a refresh. Reading Date.now() during render is also impure, which
// the React Compiler lint rejects.
function useNowSeconds() {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return nowSeconds;
}

function archivalExplainer() {
  return (
    <>
      <p className="typo-text text-muted keepalive__explain">
        Milepost stores signed proofs and standing records with an expiry. If nobody
        extends the entry, it becomes <strong>archived</strong> — it still exists but reads as missing until
        restored. Restoration can cost extra and fail at the worst moment — for example when a proof is needed to release funds.
      </p>
      <p className="typo-text text-muted keepalive__explain">
        Every expiry extension can be done by <strong>anyone</strong> — you don&apos;t need to own the signed proof or the standing record. If you&apos;re willing to pay the fee, you can keep someone else&apos;s entry alive.
      </p>
      <p className="typo-text text-muted keepalive__explain" style={{ fontSize: 'var(--text-sm)' }}>
        Entries are extended to about 90 days from the extension, and only re-extended when under about 60 days remaining — calling extension in a loop cannot push expiry out without bound.
      </p>
    </>
  );
}

export function AttestationKeepalive({ uid, createdAt }: { uid: Buffer; createdAt: bigint }) {
  const { attest } = useSoroban();
  const tx = useTransaction({ contract: 'attest' });

  const now = useNowSeconds();
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
      title="Keep this signed proof alive"
      aside={
        approaching ? (
          <Badge tone="warning">May need extension</Badge>
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
              This signed proof was created {ageDays} days ago and is approaching the window where it should be
              extended. Consider extending it now.
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
            Extend expiry
          </Button>
          {tx.phase === 'success' && (
            <span className="keepalive__success" role="status">
              Extended — this signed proof&apos;s expiry is now about 90 days out.
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
          Anyone may extend anyone&apos;s entry.
        </p>
      </div>
    </Card>
  );
}

export function StandingKeepalive({ subject, lastSeen }: { subject: string; lastSeen: bigint }) {
  const { record } = useSoroban();
  const tx = useTransaction({ contract: 'record' });

  const now = useNowSeconds();
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
          <Badge tone="warning">May need extension</Badge>
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
          A recipient&apos;s standing is a long-lived, persistent record — but it expires if nobody extends it. An archived standing reads as missing until restored, which can block review of future applications.
          Restoration is automatic but costs extra and can fail at the worst moment.
        </p>
        <p className="typo-text text-muted keepalive__explain">
          Anyone may keep it alive — the recipient themselves, a programme, or any observer willing to pay the fee.
        </p>
        <p className="typo-text text-muted keepalive__explain" style={{ fontSize: 'var(--text-sm)' }}>
          Entries are extended to about 90 days from the extension, and only re-extended when under about 60 days remaining —
          calling extension in a loop cannot push expiry out without bound.
        </p>
        <div className="keepalive__actions">
          <Button
            onClick={() => void handleKeepalive()}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase) || 'Extending…'}
            icon={<ShieldCheck size={16} />}
          >
            Extend expiry
          </Button>
          {tx.phase === 'success' && (
            <span className="keepalive__success" role="status">
              Extended — this standing&apos;s expiry is now about 90 days out.
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
          Anyone may extend anyone&apos;s entry.
        </p>
      </div>
    </Card>
  );
}
