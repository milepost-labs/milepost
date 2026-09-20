import { useContext } from 'react';
import { SorobanContext, type SorobanState } from './sorobanStore';

export function useSoroban(): SorobanState {
  const context = useContext(SorobanContext);
  if (!context) throw new Error('useSoroban must be used inside a SorobanProvider');
  return context;
}
