import { describe, it, expect } from 'vitest';
import { registryVerificationCopy } from './registryVerification';

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
