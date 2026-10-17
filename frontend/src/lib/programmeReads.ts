/**
 * The one small layer that owns per-programme chain reads.
 *
 * Every binding call is a simulation against the RPC, and public testnet RPCs
 * rate-limit bursts: a directory of forty programmes read one component at a
 * time through `useContractRead` fires hundreds of simulations at once, and
 * re-fires them on every screen, every remount. This layer owns three things
 * all per-programme reads should go through:
 *
 * - **A concurrency cap.** At most {@link MAX_CONCURRENT} reads are in flight
 *   at any instant; the rest queue behind them. A burst of simulations is
 *   still *possible* from many screens, so the directory itself batches a
 *   whole programme's reads into one promise rather than six.
 * - **One promise per key.** Concurrent callers of the same read share a
 *   single in-flight simulation instead of racing.
 * - **A session cache.** Settled results stay for the life of the tab, so a
 *   screen visited twice reads once. Failures are never cached: a failed read
 *   may be a momentary rate limit, and the next attempt should try again.
 *
 * Calls remain plain promise-returning functions rather than hooks so
 * non-React code (and tests) can use them directly; `hooks/useProgrammeReads`
 * is the React wiring on top. Errors are deliberately not translated here —
 * screens decide how to present them, through `explain()` like everywhere else.
 */

import type { Award, Client as Programme } from '@milepost/program';
import type { Client as Registry } from '@milepost/registry';
import { isPhase, type Phase } from './phaseGate';

/**
 * In-flight reads at once. Four keeps a directory page from ever having more
 * than four simulations pending on the testnet RPC, whatever the screen count.
 */
const MAX_CONCURRENT = 4;

/** The settled promise cache, keyed per read. Failures are removed on arrival. */
const settled = new Map<string, Promise<unknown>>();

let inFlight = 0;
const queued: Array<() => void> = [];

/** Run `task` once the reader's concurrency window allows it. */
async function admitted<T>(task: () => Promise<T>): Promise<T> {
  await new Promise<void>((admit) => {
    if (inFlight < MAX_CONCURRENT) {
      inFlight += 1;
      admit();
      return;
    }
    queued.push(() => {
      inFlight += 1;
      admit();
    });
  });
  try {
    return await task();
  } finally {
    inFlight -= 1;
    const next = queued.shift();
    if (next) next();
  }
}

/**
 * Deduplicate, cache and rate-limit one read.
 *
 * Successes stay until the tab closes. Errors are not cached — removing the
 * rejected entry lets the next attempt retry while still sharing one promise
 * between concurrent callers of the same failed read.
 */
export async function sessionRead<T>(key: string, run: () => Promise<T>): Promise<T> {
  const cached = settled.get(key);
  if (cached) return cached as Promise<T>;

  const pending = admitted(run);
  settled.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    settled.delete(key);
    throw error;
  }
}

export type ProgrammeClientFactory = (contractId: string) => Programme;

/** One programme's chain state, as the directory cards and receipts render it. */
export interface ProgrammeChainRead {
  /** null when the phase read failed — screens must show unknown, not invent one. */
  phase: Phase | null;
  /** Contributions less the protocol fee: what is available to award. */
  budget: bigint | null;
  contributed: bigint | null;
  granted: bigint | null;
  released: bigint | null;
  refunded: bigint | null;
  /** Basis points the programme takes out of every contribution. */
  feeBps: number | null;
  quorum: number | null;
  /** Applications close here (Unix seconds), for the "closes in N days" line. */
  applyDeadline: bigint | null;
}

/**
 * A programme's phase, totals, budget and configuration in one read per
 * programme, not one read per screen. The phase and the budget anchor a card —
 * without a phase nothing on a card can be shown honestly — so their failure
 * fails the whole read. The totals and configuration degrade to nulls, and
 * whatever the contract answers is displayed as-is.
 *
 * Sample programmes (the fixture set) have no contract behind them: callers
 * must not point this at a fixture id.
 */
export async function readProgrammeChain(
  programmeId: string,
  programmeAt: ProgrammeClientFactory,
): Promise<ProgrammeChainRead> {
  return sessionRead(`programme-chain:${programmeId}`, async () => {
    const client = programmeAt(programmeId);
    const prefix = `programme:${programmeId}`;

    const phase = await sessionRead(`${prefix}:get_phase`, async () => {
      const tag = (await client.get_phase()).result.unwrap().tag;
      if (!isPhase(tag)) throw new Error(`The contract answered an unknown phase: ${String(tag)}`);
      return tag as Phase;
    });
    const budget = await sessionRead(`${prefix}:budget`, async () =>
      BigInt((await client.budget()).result.unwrap() as bigint),
    );

    // Nice-to-have on a card: their failure becomes an empty figure rather
    // than hiding the programme behind a whole-card error.
    const tolerant = <T>(key: string, run: () => Promise<T>) =>
      sessionRead(key, run).then(
        (value) => value,
        () => null,
      );

    const [contributed, granted, released, refunded, config] = await Promise.all([
      tolerant<bigint>(`${prefix}:total_contributed`, () =>
        client.total_contributed().then((r) => r.result as bigint),
      ),
      tolerant<bigint>(`${prefix}:total_granted`, () =>
        client.total_granted().then((r) => r.result as bigint),
      ),
      tolerant<bigint>(`${prefix}:total_released`, () =>
        client.total_released().then((r) => r.result as bigint),
      ),
      tolerant<bigint>(`${prefix}:total_refunded`, () =>
        client.total_refunded().then((r) => r.result as bigint),
      ),
      tolerant(`${prefix}:get_config`, async () => {
        const value = (await client.get_config()).result.unwrap();
        return {
          feeBps: Number(value.fee_bps),
          quorum: Number(value.quorum),
          applyDeadline: value.apply_deadline,
        };
      }),
    ]);

    return {
      phase,
      budget,
      contributed,
      granted,
      released,
      refunded,
      feeBps: config?.feeBps ?? null,
      quorum: config?.quorum ?? null,
      applyDeadline: config?.applyDeadline ?? null,
    };
  });
}

/**
 * What `donor` has put into this programme, in stroops. Zero when they have
 * put nothing in — the contract answers the amount, not an error.
 */
export async function readContribution(
  programmeId: string,
  donor: string,
  programmeAt: ProgrammeClientFactory,
): Promise<bigint> {
  return sessionRead(`contribution:${programmeId}:${donor}`, async () =>
    programmeAt(programmeId).contributed_by({ donor }).then((r) => r.result as bigint),
  );
}

/**
 * The award `recipient` holds in this programme, or null when they have none.
 * The contract answers `AwardNotFound` for no award, so a failed read lands
 * here as null rather than as an error screen — "no award" is an answer, not
 * a fault. Real network failures read the same way; callers that must tell
 * them apart should read the client directly.
 */
export async function readAward(
  programmeId: string,
  recipient: string,
  programmeAt: ProgrammeClientFactory,
): Promise<Award | null> {
  return sessionRead(`award:${programmeId}:${recipient}`, async () => {
    try {
      const award = (await programmeAt(programmeId).get_award({ recipient })).result.unwrap();
      return { ...award, granted: BigInt(award.granted), released: BigInt(award.released) };
    } catch {
      return null;
    }
  });
}

/**
 * Walk the registry itself for its programme list.
 *
 * `nonce()` is the nonce the *next* deployment will use, so the deployed
 * programmes are `[0, nonce)`; `programme_address(n)` derives each address,
 * and `is_programme` confirms it — every entry is re-checked on-chain before
 * the app shows it, as the design rule requires. The registry keeps no list,
 * so this is the closest thing to one the chain offers, and it is what the
 * directory falls back to when the published index is unavailable.
 *
 * The whole walk is one cached read: addresses are immutable once deployed,
 * so re-walking buys nothing within a session. A walk that queued without the
 * cache would re-fire 2n simulations on every mount.
 */
export async function readRegistryProgrammes(registry: Registry): Promise<string[]> {
  return sessionRead('registry:programmes', async () => {
    const nonce = (await registry.nonce()).result;
    const count = Number(nonce);
    const addresses: string[] = [];
    for (let n = 0; n < count; n += 1) {
      const id = await sessionRead(`registry:programme_address:${n}`, async () =>
        registry.programme_address({ n: BigInt(n) }).then((r) => r.result),
      );
      const confirmed = await sessionRead(`registry:is_programme:${id}`, async () =>
        registry.is_programme({ addr: id }).then((r) => r.result),
      );
      if (confirmed) addresses.push(id);
    }
    return addresses;
  });
}
