import { Address, rpc, xdr } from '@stellar/stellar-sdk';

/**
 * Entry lifetimes for a programme, read from the RPC.
 *
 * `getLedgerEntries` returns `liveUntilLedgerSeq` for each ledger key. The keys
 * mirror `contracts/program/src/lib.rs`: config and running totals live in the
 * contract instance; per-address entries are persistent and keyed by the
 * `Key` enum, which a `#[contracttype]` enum encodes as
 * `Vec[Symbol(variant), ...fields]`. See docs/ttl-strategy.md.
 */

/** Ledger close time the contracts budget for (`DAY_IN_LEDGERS = 17_280`). */
export const SECONDS_PER_LEDGER = 5;
const SECONDS_PER_DAY = 86_400;

export type ProgrammeEntryVariant = 'Award' | 'Donor' | 'Application' | 'Allocation' | 'Refunded';

/** Ledger key of a contract's instance entry (config, phase, running totals). */
export function instanceLedgerKey(contractId: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

/** Ledger key of a per-address persistent entry, e.g. `Key::Award(recipient)`. */
export function entryLedgerKey(
  contractId: string,
  variant: ProgrammeEntryVariant,
  subject: string,
): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), new Address(subject).toScVal()]),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

/** Whole days until an entry archives; 0 once it is due or past due. */
export function ledgersToDays(
  liveUntilLedgerSeq: number,
  latestLedger: number,
  secondsPerLedger: number = SECONDS_PER_LEDGER,
): number {
  const ledgersLeft = Math.max(0, liveUntilLedgerSeq - latestLedger);
  return Math.floor((ledgersLeft * secondsPerLedger) / SECONDS_PER_DAY);
}

export interface EntryLifetimeRow {
  key: 'instance' | 'awards';
  label: string;
  note: string;
  /** Days left for the shortest-lived entry in the group; null when none were found. */
  liveForDays: number | null;
}

export interface ProgrammeLifetimes {
  latestLedger: number;
  rows: EntryLifetimeRow[];
  /** Entry groups that could not be checked because their addresses are not published. */
  unchecked: string[];
}

type LedgerEntriesReader = Pick<rpc.Server, 'getLedgerEntries'>;

/**
 * Reads the instance entry and one `Award` entry per known recipient in a
 * single `getLedgerEntries` call. Contributions and applications are keyed by
 * addresses nothing publishes, so they are reported as unchecked.
 */
export async function readProgrammeLifetimes(
  server: LedgerEntriesReader,
  programmeId: string,
  awardRecipients: string[],
): Promise<ProgrammeLifetimes> {
  const recipients = [...new Set(awardRecipients)];
  const instanceKey = instanceLedgerKey(programmeId);
  const awardKeys = recipients.map((r) => entryLedgerKey(programmeId, 'Award', r));

  const response = await server.getLedgerEntries(instanceKey, ...awardKeys);
  const liveUntil = new Map<string, number>();
  for (const entry of response.entries) {
    if (entry.liveUntilLedgerSeq !== undefined) {
      liveUntil.set(entry.key.toXDR('base64'), entry.liveUntilLedgerSeq);
    }
  }
  const days = (key: xdr.LedgerKey): number | null => {
    const seq = liveUntil.get(key.toXDR('base64'));
    return seq === undefined ? null : ledgersToDays(seq, response.latestLedger);
  };

  const awardDays = awardKeys.map(days).filter((d): d is number => d !== null);
  const awardNote =
    recipients.length === 0
      ? 'No awards published for this programme'
      : `${awardDays.length} of ${recipients.length} ${recipients.length === 1 ? 'entry' : 'entries'} found`;

  return {
    latestLedger: response.latestLedger,
    rows: [
      {
        key: 'instance',
        label: 'Programme contract',
        note: 'Terms, phase and budget',
        liveForDays: days(instanceKey),
      },
      {
        key: 'awards',
        label: 'Awards',
        note: awardNote,
        liveForDays: awardDays.length > 0 ? Math.min(...awardDays) : null,
      },
    ],
    unchecked: ['Contributions', 'Applications and votes'],
  };
}

/** How many programmes' lifetimes are read from the RPC at once. */
export const LIFETIME_READ_CONCURRENCY = 4;

/** One programme's instance entry lifetime, or why it could not be read. */
export interface ProgrammeInstanceLifetime {
  programmeId: string;
  /** Days left; null when the RPC returned no entry (archived, or not a programme). */
  liveForDays: number | null;
  /** The read failed; the row says so instead of guessing a number. */
  error: unknown;
}

/**
 * Reads the instance entry of every programme, at most `concurrency` at a
 * time so a long index does not flood the RPC. A failed read is kept on its
 * own row rather than failing the whole table.
 */
export async function readInstanceLifetimes(
  server: LedgerEntriesReader,
  programmeIds: string[],
  concurrency: number = LIFETIME_READ_CONCURRENCY,
): Promise<ProgrammeInstanceLifetime[]> {
  const ids = [...new Set(programmeIds)];
  const results: ProgrammeInstanceLifetime[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const index = next++;
      const programmeId = ids[index];
      try {
        const response = await server.getLedgerEntries(instanceLedgerKey(programmeId));
        const seq = response.entries.find((entry) => entry.liveUntilLedgerSeq !== undefined)?.liveUntilLedgerSeq;
        results[index] = {
          programmeId,
          liveForDays: seq === undefined ? null : ledgersToDays(seq, response.latestLedger),
          error: null,
        };
      } catch (error) {
        results[index] = { programmeId, liveForDays: null, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), ids.length) }, worker));
  return results;
}

/**
 * Most urgent first: entries the RPC no longer returns, then fewest days
 * left. Failed reads go last, since nothing is known about them.
 */
export function sortByDaysLeft<T extends Pick<ProgrammeInstanceLifetime, 'liveForDays' | 'error'>>(rows: T[]): T[] {
  const rank = (row: T) => (row.error ? 2 : row.liveForDays === null ? 0 : 1);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || (a.liveForDays ?? 0) - (b.liveForDays ?? 0),
  );
}
