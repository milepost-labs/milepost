import { useEffect, useState } from 'react';
import { isRpcUnavailable, resetRpcHealth, subscribeRpcHealth } from '../lib/rpcHealth';

export function useRpcHealth(): { unavailable: boolean; retry: () => void } {
  const [unavailable, setUnavailable] = useState(isRpcUnavailable);
  useEffect(() => subscribeRpcHealth(setUnavailable), []);
  return { unavailable, retry: resetRpcHealth };
}
