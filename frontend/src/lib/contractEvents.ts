/**
 * Reading a contract's recent events from the RPC.
 *
 * The contracts keep no lists, so "every attestation about this address" or
 * "every applicant" only exists as a trail of events. The RPC serves those
 * events for its retention window (about a week on testnet) and nothing older,
 * so every caller gets the window back alongside the events and is expected
 * to say on screen which ledgers it covers.
 */

import { xdr, type rpc } from '@milepost/program';

/** Ledgers per request. The RPC caps a page at 10,000; small pages keep each reply quick. */
export const EVENTS_PAGE_SIZE = 200;
/** Stop after this many pages so a busy contract cannot keep the screen loading forever. */
export const EVENTS_MAX_PAGES = 25;
/** Testnet closes a ledger roughly every five seconds. Only used to describe a window. */
export const SECONDS_PER_LEDGER = 5;

/** The ledgers a read covered. */
export interface EventWindow {
  fromLedger: number;
  toLedger: number;
}

export interface RecentEvents {
  events: rpc.Api.EventResponse[];
  window: EventWindow;
  /** True when the page cap was hit, so older events in the window were not read. */
  truncated: boolean;
}

type EventsServer = Pick<rpc.Server, 'getHealth' | 'getEvents'>;

/** A topic filter segment matching one symbol, as the RPC expects it (base64 XDR). */
export function symbolTopic(name: string): string {
  return xdr.ScVal.scvSymbol(name).toXDR('base64');
}

/**
 * Every event `contractId` emitted under `topics` within the RPC's retention
 * window, oldest first. `topics` uses the RPC's filter syntax: base64 XDR per
 * segment, `*` for any.
 */
export async function readRecentEvents(
  server: EventsServer,
  contractId: string,
  topics: string[][],
): Promise<RecentEvents> {
  const health = await server.getHealth();
  const filters = [{ type: 'contract' as const, contractIds: [contractId], topics }];

  const events: rpc.Api.EventResponse[] = [];
  let response = await server.getEvents({
    startLedger: health.oldestLedger,
    filters,
    limit: EVENTS_PAGE_SIZE,
  });
  let pages = 1;
  events.push(...response.events);

  while (response.events.length === EVENTS_PAGE_SIZE && pages < EVENTS_MAX_PAGES) {
    response = await server.getEvents({ cursor: response.cursor, filters, limit: EVENTS_PAGE_SIZE });
    events.push(...response.events);
    pages += 1;
  }

  // Hitting the page cap means newer events exist that were not read, so the
  // window ends at the last event seen rather than at the chain tip.
  const truncated = response.events.length === EVENTS_PAGE_SIZE;
  const toLedger = truncated
    ? events[events.length - 1].ledger
    : (response.latestLedger ?? health.latestLedger);

  return { events, window: { fromLedger: health.oldestLedger, toLedger }, truncated };
}

/** "about 7 days", for labelling a window without promising precision. */
export function describeWindow(window: EventWindow): string {
  const seconds = Math.max(0, window.toLedger - window.fromLedger) * SECONDS_PER_LEDGER;
  const days = Math.round(seconds / 86_400);
  if (days >= 1) return `about ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.round(seconds / 3_600));
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}
