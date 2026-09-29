import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSoroban } from '../context/useSoroban';
import { isProgrammeContractId, verifyRegistryProgramme } from '../lib/registryVerification';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';

export type ProgrammeParamStatus =
  | 'absent'
  | 'malformed'
  | 'checking'
  | 'valid'
  | 'unknown'
  | 'error';

export interface ProgrammeParamState {
  raw: string | null;
  programmeId: string | null;
  status: ProgrammeParamStatus;
  active: boolean;
  blocksProgramme: boolean;
  loading: boolean;
  error: unknown;
  message: string | null;
  clear: () => void;
  refetch: () => void;
}

type VerificationState = {
  programmeId: string | null;
  status: 'idle' | 'checking' | 'valid' | 'unknown' | 'error';
  error: unknown;
};

const PROGRAMME_PARAM_ROUTES = new Set(['/funders', '/recipients', '/finalize', '/keepalive']);

export function consumesProgrammeParam(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PROGRAMME_PARAM_ROUTES.has(normalized);
}

export function normalizeProgrammeParam(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? '' : trimmed;
}

export function looksLikeContractId(value: string): boolean {
  return isProgrammeContractId(value);
}

/**
 * The sample programmes the directory shows beside the indexed ones. Their ids
 * are stand-ins, not contract addresses, so they are accepted by name rather
 * than sent to the registry. Remove with the fixtures.
 */
function isSampleProgramme(value: string): boolean {
  return FIXTURE_PROGRAMMES.some((p) => p.id === value);
}

export function useProgrammeParam(): ProgrammeParamState {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { registry } = useSoroban();
  const consumesParam = consumesProgrammeParam(location.pathname);
  const raw = searchParams.get('programme');
  const programmeId = normalizeProgrammeParam(raw);
  const hasParam = consumesParam && programmeId !== null;
  const isSample = hasParam && programmeId !== '' && isSampleProgramme(programmeId);
  const syntaxValid = hasParam && programmeId !== '' && (isSample || looksLikeContractId(programmeId));
  const [verification, setVerification] = useState<VerificationState>({
    programmeId: null,
    status: 'idle',
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!syntaxValid || !programmeId || isSample) return;

    let cancelled = false;

    void verifyRegistryProgramme(registry, programmeId)
      .then((valid) => {
        if (cancelled) return;
        setVerification({ programmeId, status: valid ? 'valid' : 'unknown', error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setVerification({ programmeId, status: 'error', error });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, isSample, programmeId, registry, syntaxValid]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('programme');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const refetch = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return useMemo<ProgrammeParamState>(() => {
    if (!hasParam) {
      return {
        raw,
        programmeId: null,
        status: 'absent',
        active: false,
        blocksProgramme: false,
        loading: false,
        error: null,
        message: null,
        clear,
        refetch,
      };
    }

    if (!syntaxValid) {
      return {
        raw,
        programmeId,
        status: 'malformed',
        active: true,
        blocksProgramme: true,
        loading: false,
        error: null,
        message:
          'That programme link is not a valid Milepost programme address. Check the link or clear it to use the default programme.',
        clear,
        refetch,
      };
    }

    if (isSample) {
      return {
        raw,
        programmeId,
        status: 'valid',
        active: true,
        blocksProgramme: false,
        loading: false,
        error: null,
        message: null,
        clear,
        refetch,
      };
    }

    if (verification.programmeId !== programmeId || verification.status === 'idle' || verification.status === 'checking') {
      return {
        raw,
        programmeId,
        status: 'checking',
        active: true,
        blocksProgramme: true,
        loading: true,
        error: null,
        message: 'Checking that programme with the Milepost registry.',
        clear,
        refetch,
      };
    }

    if (verification.status === 'error') {
      return {
        raw,
        programmeId,
        status: 'error',
        active: true,
        blocksProgramme: true,
        loading: false,
        error: verification.error,
        message: 'We could not verify that programme against the registry. Nothing has been loaded from it yet.',
        clear,
        refetch,
      };
    }

    if (verification.status === 'unknown') {
      return {
        raw,
        programmeId,
        status: 'unknown',
        active: true,
        blocksProgramme: true,
        loading: false,
        error: null,
        message:
          'That address is not a Milepost registry programme. Check the link or clear it to use the default programme.',
        clear,
        refetch,
      };
    }

    return {
      raw,
      programmeId,
      status: 'valid',
      active: true,
      blocksProgramme: false,
      loading: false,
      error: null,
      message: null,
      clear,
      refetch,
    };
  }, [clear, hasParam, isSample, programmeId, raw, refetch, syntaxValid, verification]);
}
