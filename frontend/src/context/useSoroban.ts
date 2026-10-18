import { useContext } from 'react';
import { SorobanContext, type SorobanState } from './sorobanStore';

export function useSoroban(): SorobanState {
  const context = useContext(SorobanContext);
  if (!context) throw new Error('useSoroban must be used inside a SorobanProvider');
  return context;
}

/**
 * The same context, tolerating a missing provider.
 *
 * Screens whose purpose survives without chain access — and the tests that
 * mount them without the provider — should degrade to making no reads rather
 * than crash. Anything that cannot work without an RPC calls `useSoroban` and
 * fails loudly, and every feature area keeps that line with its own test
 * deciding which it is.
 */
export function useOptionalSoroban(): SorobanState | undefined {
  return useContext(SorobanContext);
}
