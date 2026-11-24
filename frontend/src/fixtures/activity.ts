/**
 * Stand-in activity for the sample programmes.
 *
 * Sample programmes have no contract behind them, so no events exist. These
 * entries stand in for what a real programme's timeline would show and are
 * the only place a FIXTURE_* value may appear; the panel tags them Sample
 * data.
 */

import type { ActivityItem } from '../lib/programmeActivity';

export const FIXTURE_ACTIVITY: ActivityItem[] = [
  {
    kind: 'released',
    ledger: 4_811_400,
    closedAt: '2026-11-18T09:14:00Z',
    actor: null,
    amount: 30_000_000n,
    detail: 'tranche 1',
  },
  {
    kind: 'awarded',
    ledger: 4_810_950,
    closedAt: '2026-11-17T16:02:00Z',
    actor: null,
    amount: 90_000_000n,
    detail: 'payment mode Allocated',
  },
  {
    kind: 'reviewed',
    ledger: 4_809_800,
    closedAt: '2026-11-15T11:41:00Z',
    actor: 'GREVIEWER1SAMPLE',
    amount: 90_000_000n,
    detail: 'application 3',
  },
  {
    kind: 'applied',
    ledger: 4_807_200,
    closedAt: '2026-11-12T08:20:00Z',
    actor: 'GRECIPIENT1SAMPLE',
    amount: 120_000_000n,
    detail: null,
  },
  {
    kind: 'contrib',
    ledger: 4_805_100,
    closedAt: '2026-11-09T14:55:00Z',
    actor: 'GDONOR1SAMPLE',
    amount: 250_000_000n,
    detail: null,
  },
];
