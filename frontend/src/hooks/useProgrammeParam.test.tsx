import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_PROGRAMME_ID, SorobanContext, type SorobanState } from '../context/sorobanStore';
import { useProgramme } from './useProgramme';
import { useProgrammeParam } from './useProgrammeParam';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';

const VALID_PROGRAMME_ID = `C${'A'.repeat(55)}`;

function makeProgrammeClient() {
  return {
    total_contributed: vi.fn(async () => ({ result: 0n })),
    total_granted: vi.fn(async () => ({ result: 0n })),
    total_released: vi.fn(async () => ({ result: 0n })),
    total_refunded: vi.fn(async () => ({ result: 0n })),
    total_swept: vi.fn(async () => ({ result: 0n })),
  };
}

function setup(path: string, registryResult: boolean | Error = true) {
  const registry = {
    is_programme: vi.fn(async () => {
      if (registryResult instanceof Error) throw registryResult;
      return { result: registryResult };
    }),
  };
  const clients = new Map<string, ReturnType<typeof makeProgrammeClient>>();
  const programmeAt = vi.fn((contractId: string) => {
    const existing = clients.get(contractId);
    if (existing) return existing as unknown as SorobanState['demoProgramme'];
    const next = makeProgrammeClient();
    clients.set(contractId, next);
    return next as unknown as SorobanState['demoProgramme'];
  });
  const value: SorobanState = {
    registry: registry as unknown as SorobanState['registry'],
    attest: {} as SorobanState['attest'],
    record: {} as SorobanState['record'],
    policy: {} as SorobanState['policy'],
    programmeAt,
    demoProgramme: programmeAt(DEMO_PROGRAMME_ID),
    rpcUrl: 'https://example.invalid/rpc',
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <SorobanContext.Provider value={value}>{children}</SorobanContext.Provider>
    </MemoryRouter>
  );

  return { wrapper, registry, programmeAt, clients };
}

describe('useProgrammeParam', () => {
  it('blocks malformed programme parameters without calling the registry', () => {
    const { wrapper, registry } = setup('/funders?programme=not-a-contract');

    const { result } = renderHook(() => useProgrammeParam(), { wrapper });

    expect(result.current.status).toBe('malformed');
    expect(result.current.blocksProgramme).toBe(true);
    expect(result.current.message).toMatch(/not a valid Milepost programme address/i);
    expect(registry.is_programme).not.toHaveBeenCalled();
  });

  it('accepts a sample programme id without asking the registry', () => {
    const sample = FIXTURE_PROGRAMMES[0].id;
    const { wrapper, registry } = setup(`/keepalive?programme=${sample}`);

    const { result } = renderHook(() => useProgrammeParam(), { wrapper });

    expect(result.current.status).toBe('valid');
    expect(result.current.programmeId).toBe(sample);
    expect(registry.is_programme).not.toHaveBeenCalled();
  });

  it('blocks well-formed ids that are not registry programmes', async () => {
    const { wrapper, registry } = setup(`/recipients?programme=${VALID_PROGRAMME_ID}`, false);

    const { result } = renderHook(() => useProgrammeParam(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unknown'));
    expect(result.current.blocksProgramme).toBe(true);
    expect(result.current.message).toMatch(/not a Milepost registry programme/i);
    expect(registry.is_programme).toHaveBeenCalledWith({ addr: VALID_PROGRAMME_ID });
  });

  it('ignores the parameter on routes that do not consume it', () => {
    const { wrapper, registry } = setup(`/directory?programme=${VALID_PROGRAMME_ID}`);

    const { result } = renderHook(() => useProgrammeParam(), { wrapper });

    expect(result.current.status).toBe('absent');
    expect(result.current.active).toBe(false);
    expect(registry.is_programme).not.toHaveBeenCalled();
  });
});

describe('useProgramme', () => {
  it('pre-selects a registry-verified programme from the parameter', async () => {
    const { wrapper, programmeAt, registry } = setup(`/finalize?programme=${VALID_PROGRAMME_ID}`, true);

    const { result } = renderHook(() => useProgramme(), { wrapper });

    await waitFor(() => expect(result.current.linkedProgramme.status).toBe('valid'));
    expect(result.current.id).toBe(VALID_PROGRAMME_ID);
    expect(result.current.isDefault).toBe(false);
    expect(result.current.readsEnabled).toBe(true);
    expect(registry.is_programme).toHaveBeenCalledWith({ addr: VALID_PROGRAMME_ID });
    expect(programmeAt).toHaveBeenCalledWith(VALID_PROGRAMME_ID);
  });

  it('keeps reads disabled when the parameter is malformed', () => {
    const { wrapper, registry, clients } = setup('/keepalive?programme=bad-link');

    const { result } = renderHook(() => useProgramme(), { wrapper });

    expect(result.current.id).toBe(DEMO_PROGRAMME_ID);
    expect(result.current.linkedProgramme.status).toBe('malformed');
    expect(result.current.readsEnabled).toBe(false);
    expect(registry.is_programme).not.toHaveBeenCalled();
    expect(clients.get(DEMO_PROGRAMME_ID)?.total_contributed).not.toHaveBeenCalled();
  });
});
