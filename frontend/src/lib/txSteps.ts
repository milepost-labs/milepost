import type { TransactionPhase } from '../hooks/useTransaction';

export type TxStepState = 'done' | 'current' | 'todo';

/**
 * Where a write has got to, in three plain steps. Building also simulates, so
 * contract refusals surface in the first step, before anything is signed.
 */
export function txSteps(phase: TransactionPhase, network = 'Stellar testnet'): { label: string; state: TxStepState }[] {
  const order: TransactionPhase[] = ['building', 'signing', 'submitting'];
  const at =
    phase === 'success'
      ? order.length
      : phase === 'confirming'
        ? 1
        : Math.max(0, order.indexOf(phase));
  // The first step names what is happening while it happens, and what was
  // done once it has.
  const labels = [
    at > 0 ? 'Built and checked' : 'Building and checking',
    'Waiting for your signature',
    `Confirming on ${network}`,
  ];
  return labels.map((label, i) => ({
    label,
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}
