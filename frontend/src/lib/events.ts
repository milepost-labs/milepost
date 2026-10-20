import { Keypair } from "@stellar/js-sdk";
import { ContractEventFilter, getContractEvents } from "@stellar/js-sdk/rpc";
import { rpc } from "./rpc";

export interface EventWindow {
  oldestLedger: number;
  latestLedger: number;
}

export interface Applied {
  applicant: string;
  applicationHash: string;
  ledgerSequence: number;
}

export interface VerifierChanged {
  payee: string;
  verifier: string;
  ledgerSequence: number;
}

export interface Attested {
  applicant: string;
  verifier: string;
  attested: boolean;
  ledgerSequence: number;
}

export interface SchemaRegistered {
  schemaId: string;
  schema: string;
  ledgerSequence: number;
}

export type ContractEvent = Applied | VerifierChanged | Attested | SchemaRegistered;

interface RawEvent {
  ledger: number;
  txnHash: string;
  eventIndex: number;
  contractId: string;
  type: string;
  topic: Array<any>;
  data: Array<any>;
}

function decodeEvent(event: RawEvent): ContractEvent | null {
  const { topic, data, ledger } = event;
  
  if (!topic || topic.length === 0) return null;

  const eventType = topic[0]?.value;

  switch (eventType) {
    case "Applied":
      return {
        applicant: topic[1]?.value || "",
        applicationHash: data[0]?.value || "",
        ledgerSequence: ledger,
      } as Applied;

    case "VerifierChanged":
      return {
        payee: topic[1]?.value || "",
        verifier: topic[2]?.value || "",
        ledgerSequence: ledger,
      } as VerifierChanged;

    case "Attested":
      return {
        applicant: topic[1]?.value || "",
        verifier: topic[2]?.value || "",
        attested: data[0]?.value || false,
        ledgerSequence: ledger,
      } as Attested;

    case "SchemaRegistered":
      return {
        schemaId: topic[1]?.value || "",
        schema: data[0]?.value || "",
        ledgerSequence: ledger,
      } as SchemaRegistered;

    default:
      return null;
  }
}

export async function fetchContractEvents(
  contractId: string,
  topics: string[],
  startLedger?: number
): Promise<{ events: ContractEvent[]; window: EventWindow }> {
  const events: ContractEvent[] = [];
  let cursor: string | undefined;
  let oldestLedger = Number.MAX_SAFE_INTEGER;
  let latestLedger = 0;

  // Get health to determine retention window
  const health = await rpc.getHealth();
  const retentionWindow = health.ledgerRetentionWindow || 120960;
  const oldestAvailable = health.oldestLedger || 1;

  // Clamp start ledger to retention window
  const effectiveStartLedger = startLedger
    ? Math.max(startLedger, oldestAvailable)
    : oldestAvailable;

  try {
    while (true) {
      const filter: ContractEventFilter = {
        type: "contract",
        contractIds: [contractId],
        topics: [topics],
      };

      const result = await rpc.getContractEvents(filter, {
        cursor,
        limit: 100,
      });

      if (!result.events || result.events.length === 0) {
        break;
      }

      for (const event of result.events) {
        const decodedEvent = decodeEvent(event as RawEvent);
        if (decodedEvent) {
          events.push(decodedEvent);
          oldestLedger = Math.min(oldestLedger, decodedEvent.ledgerSequence);
          latestLedger = Math.max(latestLedger, decodedEvent.ledgerSequence);
        }
      }

      cursor = result.paginationToken;
      if (!cursor) break;
    }
  } catch (error) {
    console.error("Failed to fetch contract events:", error);
    throw new Error("Failed to fetch contract events");
  }

  return {
    events,
    window: {
      oldestLedger: oldestLedger === Number.MAX_SAFE_INTEGER ? oldestAvailable : oldestLedger,
      latestLedger: latestLedger || Math.floor(Date.now() / 1000),
    },
  };
}

export async function useContractEvents(
  contractId: string,
  topics: string[],
  daysBack: number = 7
) {
  const ledgerCloseTime = 5; // seconds
  const ledgersPerDay = (24 * 60 * 60) / ledgerCloseTime;
  const startLedger = Math.max(1, Math.floor(Date.now() / 1000 / ledgerCloseTime) - ledgersPerDay * daysBack);

  return fetchContractEvents(contractId, topics, startLedger);
}
