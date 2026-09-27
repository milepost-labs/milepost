/**
 * Verify an attestation exists for a subject.
 *
 * Usage: npx tsx verify-attestation.ts [schema] [subject]
 * Defaults to schema "enrolment" and a testnet address.
 * No funded keys needed — read-only against testnet.
 */

import { Client as AttestClient, networks } from "@milepost/attest";

const { contractId, networkPassphrase } = networks.testnet;

async function main() {
  const schemaName = process.argv[2] || "enrolment";
  const subject = process.argv[3] || "GABC...";

  const client = new AttestClient({
    contractId,
    networkPassphrase,
    rpcUrl: "https://soroban-testnet.stellar.org",
  });

  try {
    const result = await client.verify({
      schema_name: schemaName,
      subject,
      attestation_id: BigInt(1),
    });

    console.log(`Attestation verification for ${subject}:`);
    console.log(`  Schema: ${schemaName}`);
    console.log(`  Valid: ${result.result}`);
  } catch (err) {
    console.error("Verification failed:", err);
  }
}

main().catch(console.error);
