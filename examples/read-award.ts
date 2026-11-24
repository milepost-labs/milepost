/**
 * Read an award's details from a programme contract.
 *
 * Usage: npx tsx read-award.ts <contract_id> <recipient>
 * Both arguments are required — programme contracts are individually deployed
 * instances with no shared testnet address.
 * No funded keys needed — read-only against testnet.
 */

import { Client as ProgramClient } from "@milepost/program";

const networkPassphrase = "Test SDF Network ; September 2015";

async function main() {
  const contractId = process.argv[2];
  const recipient = process.argv[3];

  if (!contractId || !recipient) {
    console.error("Usage: npx tsx read-award.ts <contract_id> <recipient>");
    process.exit(1);
  }

  const client = new ProgramClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const awardResult = await client.get_award({ recipient });
    const award = awardResult.result.unwrap();

    console.log(`Award for ${recipient}:`);
    console.log(`  Recipient: ${award.recipient}`);
    console.log(`  Granted: ${award.granted}`);
    console.log(`  Released: ${award.released}`);
    console.log(`  Mode: ${award.mode?.tag || "Unknown"}`);
    console.log(`  Tranches: ${award.tranches}`);
    console.log(`  Tranches released: ${award.tranches_released}`);
  } catch (err) {
    console.error(`Award for ${recipient} not found or error:`, err);
  }
}

main().catch(console.error);
