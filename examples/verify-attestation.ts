/**
 * Verify an attestation exists for a subject.
 *
 * Usage: npx tsx verify-attestation.ts [uid_hex] [subject] [schema_hex] [attester]
 * All arguments are required for a real verification; defaults are placeholders.
 * No funded keys needed — read-only against testnet.
 */

import { Client as AttestClient, networks } from "@milepost/attest";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  // verify() requires uid, subject, schema (all as Buffer), and attester (string).
  // For illustration, encode hex strings as buffers.
  const uidHex = process.argv[2] || "00".repeat(32);
  const subject = process.argv[3] || "GABC...";
  const schemaHex = process.argv[4] || "00".repeat(32);
  const attester = process.argv[5] || "GABC...";

  const uid = Buffer.from(uidHex, "hex");
  const schema = Buffer.from(schemaHex, "hex");

  const client = new AttestClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const result = await client.verify({ uid, subject, schema, attester });

    console.log(`Attestation verification for ${subject}:`);
    console.log(`  UID: ${uidHex}`);
    console.log(`  Valid: ${result.result}`);
  } catch (err) {
    console.error("Verification failed:", err);
  }
}

main().catch(console.error);
