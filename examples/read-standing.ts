/**
 * Read a recipient's standing from the record contract.
 *
 * Usage: npx tsx read-standing.ts [subject]
 * Defaults to a testnet address placeholder.
 * No funded keys needed — read-only against testnet.
 */

import { Client as RecordClient, networks } from "@milepost/record";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  const subject = process.argv[2] || "GABC...";

  const client = new RecordClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const result = await client.get({ subject });
    const standing = result.result.unwrap();

    console.log(`Standing for ${subject}:`);
    console.log(`  Total received: ${standing.total_received}`);
    console.log(`  Tranches: ${standing.tranches}`);
    console.log(`  Programmes: ${standing.programmes}`);
    console.log(`  First seen: ${standing.first_seen}`);
    console.log(`  Last seen: ${standing.last_seen}`);
  } catch (err) {
    console.error("Read failed:", err);
  }
}

main().catch(console.error);
