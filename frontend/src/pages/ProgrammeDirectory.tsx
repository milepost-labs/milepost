import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Phase, ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useContractRead } from '../hooks/useContractRead';
import { AsyncView, Empty } from '../components/state/AsyncStates';
import { Badge, Button, Card, PhaseBadge, Stat } from '../components/ui';
import { formatAmount } from '../lib/amount';
import { explain } from '../lib/errors';
import './ProgrammeDirectory.css';

interface ProgrammeItem {
  nonceIndex: number;
  status: 'loading' | 'loaded' | 'error';
  address?: string;
  config?: ProgrammeConfig;
  phase?: Phase;
  budget?: bigint;
  error?: string;
}

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;
const formatDate = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleDateString();

export const ProgrammeDirectory = () => {
  const { registry, programmeAt } = useSoroban();
  const nonceRead = useContractRead(() => registry.nonce(), [registry]);

  const [programmes, setProgrammes] = useState<Record<number, ProgrammeItem>>({});

  useEffect(() => {
    if (nonceRead.data === null) return;
    const count = Number(nonceRead.data);
    if (count === 0) return;

    let cancelled = false;

    // Derive and fetch each programme progressively
    for (let i = 0; i < count; i += 1) {
      (async () => {
        try {
          const { result: address } = await registry.programme_address({ n: BigInt(i) });
          if (cancelled) return;

          setProgrammes((prev) => ({
            ...prev,
            [i]: { nonceIndex: i, status: 'loading', address },
          }));

          const progClient = programmeAt(address);

          const [configRes, phaseRes, budgetRes] = await Promise.all([
            progClient.get_config().catch(() => null),
            progClient.get_phase().catch(() => null),
            progClient.budget().catch(() => null),
          ]);

          if (cancelled) return;

          if (!configRes || !phaseRes) {
            setProgrammes((prev) => ({
              ...prev,
              [i]: {
                ...prev[i],
                address,
                status: 'error',
                error: 'Could not read programme contract data.',
              },
            }));
            return;
          }

          setProgrammes((prev) => ({
            ...prev,
            [i]: {
              nonceIndex: i,
              status: 'loaded',
              address,
              config: configRes.result.unwrap(),
              phase: phaseRes.result.unwrap(),
              budget: budgetRes ? budgetRes.result.unwrap() : 0n,
            },
          }));
        } catch (err) {
          if (cancelled) return;
          const explained = explain(err, 'program');
          setProgrammes((prev) => ({
            ...prev,
            [i]: {
              nonceIndex: i,
              status: 'error',
              error: explained.message,
            },
          }));
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [registry, nonceRead.data, programmeAt]);

  return (
    <div className="directory-container">
      <header className="directory-header">
        <h1>Programme Directory</h1>
        <p className="typo-text text-muted">
          All grant programmes deployed on Stellar, derived deterministically from the registry.
        </p>
      </header>

      <AsyncView {...nonceRead} onRetry={nonceRead.refetch}>
        {(nonceCount) => {
          const count = Number(nonceCount);
          if (count === 0) {
            return (
              <Empty
                title="No programmes found"
                description="The registry currently contains no deployed programmes."
              />
            );
          }

          const items: ProgrammeItem[] = Array.from({ length: count }, (_, i) => programmes[i] ?? { nonceIndex: i, status: 'loading' });

          return (
            <div className="directory-grid">
              {items.map((item) => {
                if (item.status === 'loading') {
                  return (
                    <Card key={item.nonceIndex} className="directory-card directory-card--loading">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="typo-text text-muted">Programme #{item.nonceIndex}</span>
                        <Badge tone="neutral">Loading…</Badge>
                      </div>
                      <p className="numeric text-muted" style={{ margin: '0.5rem 0' }}>
                        {item.address ? shorten(item.address) : 'Deriving address…'}
                      </p>
                    </Card>
                  );
                }

                if (item.status === 'error' || !item.address || !item.config || !item.phase) {
                  return (
                    <Card key={item.nonceIndex} className="directory-card directory-card--error">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="typo-text text-muted">Programme #{item.nonceIndex}</span>
                        <Badge tone="danger">Unreadable</Badge>
                      </div>
                      <p className="numeric" style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.875rem' }}>
                        {item.address ? shorten(item.address) : 'Derived contract'}
                      </p>
                      <p className="typo-text text-muted" style={{ fontSize: '0.75rem' }}>
                        {item.error || 'Failed to load details'}
                      </p>
                      {item.address && (
                        <Link to={`/programme/${item.address}`} style={{ fontSize: '0.875rem', marginTop: '0.5rem', display: 'inline-block' }}>
                          Attempt view &rarr;
                        </Link>
                      )}
                    </Card>
                  );
                }

                return (
                  <Card key={item.nonceIndex} className="directory-card">
                    <div className="directory-card__header">
                      <div>
                        <span className="directory-card__nonce">Programme #{item.nonceIndex}</span>
                        <h3 className="numeric directory-card__address" title={item.address}>
                          {shorten(item.address)}
                        </h3>
                      </div>
                      <PhaseBadge phase={item.phase.tag} />
                    </div>

                    <div className="directory-card__stats">
                      <Stat
                        label="Net budget"
                        value={item.budget !== undefined ? formatXlm(item.budget) : '0.00 XLM'}
                        numeric
                      />
                      <Stat
                        label="Apply deadline"
                        value={formatDate(item.config.apply_deadline)}
                      />
                    </div>

                    <div className="directory-card__details">
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                        Creator: <span className="numeric" title={item.config.creator}>{shorten(item.config.creator)}</span>
                      </p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                        Tranches: <strong className="numeric">{item.config.tranches}</strong> &bull; Quorum: <strong className="numeric">{item.config.quorum}</strong>
                      </p>
                    </div>

                    <div className="directory-card__actions">
                      <Link to={`/programme/${item.address}`}>
                        <Button fullWidth>View programme</Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </AsyncView>
    </div>
  );
};
