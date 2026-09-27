import type { BadgeTone } from "../components/ui";

export interface RegistryProgrammeVerifier {
  is_programme: (args: { addr: string }) => Promise<{ result: boolean }>;
}

const PROGRAMME_CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

export function isProgrammeContractId(value: string): boolean {
  return PROGRAMME_CONTRACT_ID_PATTERN.test(value);
}

export async function verifyRegistryProgramme(
  registry: RegistryProgrammeVerifier,
  programmeId: string,
): Promise<boolean> {
  if (!isProgrammeContractId(programmeId)) return false;
  const response = await registry.is_programme({ addr: programmeId });
  return response.result;
}

export interface RegistryVerificationCopy {
  tone: BadgeTone;
  label: string;
  description: string;
}

/**
 * Registry-deployed only says which guarantees apply — that the programme can
 * write standing — not that the creator can be trusted. An unaffiliated
 * programme can still take contributions and make awards, so this is worded
 * as a fact about deployment, never as a verdict on the programme itself.
 */
export function registryVerificationCopy(
  deployedByRegistry: boolean,
): RegistryVerificationCopy {
  return deployedByRegistry
    ? {
        tone: "success",
        label: "Registry-deployed",
        description:
          "The Milepost registry deployed this programme, so it can write to the shared standing record. This confirms how it was deployed, not that the creator can be trusted.",
      }
    : {
        tone: "warning",
        label: "Not registry-deployed",
        description:
          "This address was not deployed by the Milepost registry. It can still take contributions and make awards, but cannot write to the standing record. That is not a verdict on the creator — only on which guarantees apply here.",
      };
}
