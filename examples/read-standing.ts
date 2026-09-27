/**
 * Read a recipient's standing from the record contract.
 *
 * Usage: npx tsx read-standing.ts [recipient] [key]
 * Defaults to a testnet address and key "credits".
 * No funded keys needed — read-only against testnet.
 */

import { Client as RecordClient, networks } from "@milepost/record";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  const recipient = process.argv[2] || "GABC...";
  const key = process.argv[3] || "credits";

  const client = new RecordClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const result = await client.read_standing({
      recipient,
      key,
    });

    console.log(`Standing for ${recipient}:`);
    console.log(`  Key: ${key}`);
    console.log(`  Value: ${result.result}`);
  } catch (err) {
    console.error("Read failed:", err);
  }
}

main().catch(console.error);
