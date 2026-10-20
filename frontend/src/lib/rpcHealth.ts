const FAILURE_THRESHOLD = 2;
let failures = 0;
let unavailable = false;
const listeners = new Set<(value: boolean) => void>();

export function reportRpcSuccess(): void {
  failures = 0;
  if (!unavailable) return;
  unavailable = false;
  listeners.forEach((listener) => listener(false));
}

export function reportRpcFailure(): void {
  failures += 1;
  if (failures < FAILURE_THRESHOLD || unavailable) return;
  unavailable = true;
  listeners.forEach((listener) => listener(true));
}

export function isRpcFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /fetch|network|timeout|timed out|503|502|rate.?limit|rpc/i.test(message);
}

export function isRpcUnavailable(): boolean {
  return unavailable;
}

export function subscribeRpcHealth(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Clear a stale warning by explicitly checking the endpoint again. */
export function resetRpcHealth(): void {
  failures = 0;
  unavailable = false;
  listeners.forEach((listener) => listener(false));
}
