import type { ReactNode } from 'react';
import type { Config } from '@milepost/registry';
import { useContractResult } from '../../hooks/useContractRead';
import { useSoroban } from '../../context/useSoroban';
import { AddressChip, Badge } from '../ui';
import { Loading } from '../state/AsyncStates';
import { FIXTURE_PROTOCOL_CONFIG } from '../../fixtures/adminFixtures';
import './ProtocolConfigCard.css';

/**
 * Protocol configuration, read from the registry — never hard-coded.
 *
 * The registry holds the fee, treasury and the addresses of the attestation
 * and standing contracts; treasury and fee come from configuration rather than
 * the caller, so a creator cannot pay a fee to themselves. Anyone evaluating
 * the protocol should be able to read them, so every address is copyable and
 * the card renders read-only for everyone.
 */
export function ProtocolConfigCard() {
  const { registry } = useSoroban();
  const configRead = useContractResult<Config>(() => registry.get_config(), [registry], {
    contract: 'registry',
  });

  const live = configRead.data;
  const feeBps = live?.fee_bps ?? FIXTURE_PROTOCOL_CONFIG.feeBps;
  const treasury = live?.treasury ?? FIXTURE_PROTOCOL_CONFIG.treasury;
  const attest = live?.attest ?? FIXTURE_PROTOCOL_CONFIG.attest;
  const record = live?.record ?? FIXTURE_PROTOCOL_CONFIG.record;
  const admin = live?.admin ?? FIXTURE_PROTOCOL_CONFIG.admin;
  const sample = !live;

  const rows: { k: string; v: ReactNode }[] = [
    { k: 'Protocol fee', v: <span className="numeric">{feeBps / 100}%</span> },
    { k: 'Treasury', v: <AddressChip address={treasury} copyLabel="Copy treasury address" /> },
    { k: 'Attest contract', v: <AddressChip address={attest} copyLabel="Copy attestation contract address" /> },
    { k: 'Record contract', v: <AddressChip address={record} copyLabel="Copy record contract address" /> },
    { k: 'Registry admin', v: <AddressChip address={admin} copyLabel="Copy registry admin address" /> },
  ];

  return (
    <section className="protocol-config" aria-labelledby="protocol-config">
      <div className="protocol-config__head">
        <h2 id="protocol-config">Protocol config</h2>
        {sample && <Badge tone="neutral">Sample data</Badge>}
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
    </section>
  );
}
