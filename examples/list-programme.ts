/**
 * List a programme's config from the registry contract.
 *
 * Usage: npx tsx list-programme.ts
 * No funded keys needed — read-only against testnet.
 */

import { Client as RegistryClient, networks } from "@milepost/registry";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  const client = new RegistryClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  // Read the registry config
  const configResult = await client.get_config();
  const config = configResult.result;

  console.log("Registry Config:");
  console.log(`  Admin: ${config.admin}`);
  console.log(`  Treasury: ${config.treasury}`);
  console.log(`  Fee (bps): ${config.fee_bps}`);
  console.log(`  Attest contract: ${config.attest_address}`);
  console.log(`  Record contract: ${config.record_address}`);
}

main().catch(console.error);
