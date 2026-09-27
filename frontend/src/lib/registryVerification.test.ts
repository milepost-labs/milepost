import { describe, it, expect, vi } from 'vitest';
import {
  isProgrammeContractId,
  registryVerificationCopy,
  verifyRegistryProgramme,
} from './registryVerification';

describe('registryVerificationCopy', () => {
  it('marks a registry-deployed programme without vouching for the creator', () => {
    const copy = registryVerificationCopy(true);
    expect(copy.tone).toBe('success');
    expect(copy.label).toBe('Registry-deployed');
    expect(copy.description).toMatch(/not that the creator can be trusted/i);
  });

  it('marks an unaffiliated programme without implying it is unsafe', () => {
    const copy = registryVerificationCopy(false);
    expect(copy.tone).toBe('warning');
    expect(copy.label).toBe('Not registry-deployed');
    expect(copy.description).toMatch(/can still take contributions and make awards/i);
    expect(copy.description).not.toMatch(/unsafe|scam|fraud/i);
  });
});


describe('programme id validation', () => {
  const validProgrammeId = `C${'A'.repeat(55)}`;

  it('accepts Stellar contract ids and rejects malformed input', () => {
    expect(isProgrammeContractId(validProgrammeId)).toBe(true);
    expect(isProgrammeContractId('')).toBe(false);
    expect(isProgrammeContractId('not-a-contract')).toBe(false);
    expect(isProgrammeContractId(`c${'A'.repeat(55)}`)).toBe(false);
    expect(isProgrammeContractId(`C${'0'.repeat(55)}`)).toBe(false);
  });

  it('does not call the registry for malformed input', async () => {
    const registry = { is_programme: vi.fn() };

    await expect(verifyRegistryProgramme(registry, 'not-a-contract')).resolves.toBe(false);

    expect(registry.is_programme).not.toHaveBeenCalled();
  });

  it('asks the registry for well-formed ids', async () => {
    const registry = { is_programme: vi.fn().mockResolvedValue({ result: true }) };

    await expect(verifyRegistryProgramme(registry, validProgrammeId)).resolves.toBe(true);

    expect(registry.is_programme).toHaveBeenCalledWith({ addr: validProgrammeId });
  });
});
