/**
 * Read an award's details from the program contract.
 *
 * Usage: npx tsx read-award.ts [programme_id] [award_id]
 * Defaults to programme 1, award 1 if not provided.
 * No funded keys needed — read-only against testnet.
 */

import { Client as ProgramClient, networks } from "@milepost/program";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  const programmeId = BigInt(process.argv[2] || "1");
  const awardId = BigInt(process.argv[3] || "1");

  const client = new ProgramClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const awardResult = await client.get_award({ award_id: awardId });
    const award = awardResult.result;

    console.log(`Award #${awardId} for Programme #${programmeId}:`);
    console.log(`  Recipient: ${award.recipient}`);
    console.log(`  Amount: ${award.amount}`);
    console.log(`  Mode: ${award.mode?.tag || "Unknown"}`);
    console.log(`  Tranches: ${award.tranches?.length || 0}`);
  } catch (err) {
    console.error(`Award #${awardId} not found or error:`, err);
  }
}

main().catch(console.error);
