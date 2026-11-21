/**
 * A programme's recent activity, rebuilt from its contract events.
 *
 * The contracts keep no lists, so "who contributed, who applied, which awards
 * were made" only exists as a trail of events. The programme contract is the
 * programme itself, so every event it emitted within the RPC's retention
 * window (about a week) is this programme's activity. Events older than the
 * window are simply not available — the read returns the window it covered
 * and the screen must say so.
 *
 * Event names and fields follow docs/events.md. Each event's `value` is the
 * `#[contractevent]` struct as an ScVal map; `scValToNative` turns it into a
 * plain object keyed by the Rust field names.
 */

import { scValToNative, type rpc } from '@milepost/program';
import { readRecentEvents, symbolTopic, type EventWindow } from './contractEvents';

/** The event-topic symbols the activity feed listens for, per docs/events.md. */
const ACTIVITY_TOPICS = [
  'contrib',
  'applied',
  'reviewed',
  'vote_amended',
  'awarded',
  'released',
  'released_batch',
  'refunded',
  'swept',
  'allocd',
  'directd',
  'cancelled',
  'paused',
  'unpaused',
  'deadline',
  'kept',
  'withdrawn',
] as const;

/** One thing that happened, in the shape the timeline renders. */
export interface ActivityItem {
  /** Which event this came from; drives the sentence and the dot colour. */
  kind: (typeof ACTIVITY_TOPICS)[number];
  /** Ledger the event was emitted in. */
  ledger: number;
  /** ISO timestamp of the ledger close, from the RPC. */
  closedAt: string;
  /** The address that acted, when the event names one. */
  actor: string | null;
  /** Stroops, when the event carries an amount. */
  amount: bigint | null;
  /** Free-form detail: an id, a mode, a count — whatever the event adds. */
  detail: string | null;
}

export interface ProgrammeActivity {
  /** Newest first. */
  items: ActivityItem[];
  window: EventWindow;
  /** True when the page cap was hit, so older events in the window were not read. */
  truncated: boolean;
}

type EventsServer = Parameters<typeof readRecentEvents>[0];

/** Read one field from a decoded event map, as a display string. */
function field(map: Record<string, unknown>, name: string): string | null {
  const value = map[name];
  if (value === undefined || value === null) return null;
  return String(value);
}

/** Read one i128/u64 field as stroops (bigint), or null. */
function amountField(map: Record<string, unknown>, ...names: string[]): bigint | null {
  for (const name of names) {
    const value = map[name];
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.floor(value));
    if (typeof value === 'string' && value !== '') {
      try {
        return BigInt(value);
      } catch {
        // Not a number; try the next name.
      }
    }
  }
  return null;
}

/** The actor field for each event kind, per docs/events.md. */
const ACTOR_FIELD: Partial<Record<(typeof ACTIVITY_TOPICS)[number], string>> = {
  contrib: 'contributor',
  applied: 'applicant',
  reviewed: 'reviewer',
  vote_amended: 'reviewer',
  refunded: 'contributor',
  allocd: 'recipient',
};

/** The amount field for each event kind. */
const AMOUNT_FIELD: Partial<Record<(typeof ACTIVITY_TOPICS)[number], string>> = {
  contrib: 'amount',
  applied: 'requested',
  reviewed: 'approved_amount',
  vote_amended: 'new_amount',
  awarded: 'amount',
  released: 'amount',
  refunded: 'amount',
  swept: 'amount',
  allocd: 'amount',
  directd: 'amount',
  withdrawn: 'amount',
};

const MODE_NAMES = ['Direct', 'Allocated', 'Restricted'] as const;

/**
 * Every activity event this programme's contract emitted in the RPC's
 * retention window, newest first.
 *
 * Callers must not point this at a sample programme id — samples have no
 * contract and no events.
 */
export async function readProgrammeActivity(
  server: EventsServer,
  programmeId: string,
): Promise<ProgrammeActivity> {
  const topics = ACTIVITY_TOPICS.map((name) => [symbolTopic(name)]);
  const { events, window, truncated } = await readRecentEvents(server, programmeId, topics);

  const items: ActivityItem[] = [];
  for (const event of events) {
    const kind = symbolOf(event);
    if (kind === null || !isActivityKind(kind)) continue;

    let map: Record<string, unknown> = {};
    try {
      const decoded = scValToNative(event.value);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        map = decoded as Record<string, unknown>;
      }
    } catch {
      continue; // An event whose data does not decode is skipped, not fatal.
    }

    items.push({
      kind,
      ledger: event.ledger,
      closedAt: event.ledgerClosedAt,
      actor: field(map, ACTOR_FIELD[kind] ?? ''),
      amount: amountField(map, AMOUNT_FIELD[kind] ?? ''),
      detail: detailOf(kind, map),
    });
  }

  items.sort((a, b) => b.ledger - a.ledger);
  return { items, window, truncated };
}

/** The event's topic symbol, decoded, or null when the topic is not a symbol. */
function symbolOf(event: rpc.Api.EventResponse): string | null {
  try {
    const first = event.topic[0];
    if (!first) return null;
    const decoded = scValToNative(first);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return null;
  }
}

function isActivityKind(value: string): value is (typeof ACTIVITY_TOPICS)[number] {
  return (ACTIVITY_TOPICS as readonly string[]).includes(value);
}

/** Whatever extra sentence-fodder a kind carries beyond actor and amount. */
function detailOf(kind: (typeof ACTIVITY_TOPICS)[number], map: Record<string, unknown>): string | null {
  switch (kind) {
    case 'awarded': {
      const mode = Number(map.mode);
      if (Number.isInteger(mode) && mode >= 0 && mode < MODE_NAMES.length) {
        return `payment mode ${MODE_NAMES[mode]}`;
      }
      return null;
    }
    case 'reviewed':
    case 'vote_amended': {
      const id = field(map, 'application_id');
      return id !== null ? `application ${id}` : null;
    }
    case 'released': {
      const tranche = field(map, 'tranche_id');
      return tranche !== null ? `tranche ${tranche}` : null;
    }
    case 'released_batch': {
      const count = field(map, 'count');
      return count !== null ? `${count} tranches` : null;
    }
    case 'deadline': {
      const at = field(map, 'new_deadline');
      return at !== null ? `new deadline at unix ${at}` : null;
    }
    case 'kept':
    case 'allocd': {
      const id = field(map, 'award_id');
      return id !== null ? `award ${id}` : null;
    }
    case 'directd': {
      const id = field(map, 'award_id');
      const payee = field(map, 'payee');
      const parts = [id !== null ? `award ${id}` : null, payee !== null ? `to ${payee}` : null].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : null;
    }
    default:
      return null;
  }
}

/** One sentence for an item, in the programme's asset. */
export function activitySentence(item: ActivityItem, asset: string | null): string {
  const amount =
    item.amount !== null
      ? ` · ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
          Number(item.amount) / 10_000_000,
        )}${asset ? ` ${asset}` : ''}`
      : '';

  switch (item.kind) {
    case 'contrib':
      return `Contribution${amount}`;
    case 'applied':
      return `Application${item.actor ? ` from ${item.actor}` : ''}${amount}`;
    case 'reviewed':
      return `Review${item.actor ? ` by ${item.actor}` : ''}${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'vote_amended':
      return `Vote amended${item.actor ? ` by ${item.actor}` : ''}${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'awarded':
      return `Award finalized${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'released':
      return `Tranche released${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'released_batch':
      return `Tranches released${item.detail ? ` · ${item.detail}` : ''}`;
    case 'refunded':
      return `Refund claimed${item.actor ? ` by ${item.actor}` : ''}${amount}`;
    case 'swept':
      return `Unclaimed funds swept${amount}`;
    case 'allocd':
      return `Escrow payment${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'directd':
      return `Direct payment${amount}${item.detail ? ` · ${item.detail}` : ''}`;
    case 'cancelled':
      return 'Programme cancelled';
    case 'paused':
      return 'Programme paused';
    case 'unpaused':
      return 'Programme unpaused';
    case 'deadline':
      return `Release deadline extended${item.detail ? ` · ${item.detail}` : ''}`;
    case 'kept':
      return `Award kept${item.detail ? ` · ${item.detail}` : ''}`;
    case 'withdrawn':
      return `Funds withdrawn${amount}`;
  }
}
