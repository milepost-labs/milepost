import { useEffect, useState } from 'react';
import { useSoroban } from '../../context/useSoroban';
import { fetchProgrammes } from '../../lib/indexer';

export interface RoleProgramme {
  id: string;
  /** The index's label for the programme, when it has one. */
  name: string | null;
  isVerifier: boolean;
  isReviewer: boolean;
  phase: string | null;
}

/**
 * The programmes where `address` holds a role. The published index lists the
 * programmes (it is advisory), and each one is re-checked on the chain with
 * `is_verifier` and `is_reviewer`, so the index alone never grants a role.
 *
 * `all` is every indexed programme with its name, for labelling claims.
 * `mine` is null until the checks for the current address finish.
 */
export function useMyRoles(address: string | null) {
  const { programmeAt } = useSoroban();
  const [loaded, setLoaded] = useState<{ address: string; all: RoleProgramme[] } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      const indexed = await fetchProgrammes().catch(() => []);
      const checked = await Promise.all(
        indexed.map(async (p): Promise<RoleProgramme> => {
          // A programme that cannot be read holds no role we can confirm.
          try {
            const programme = programmeAt(p.id);
            const [ver, rev, phase] = await Promise.all([
              programme.is_verifier({ addr: address }).then((r) => r.result).catch(() => false),
              programme.is_reviewer({ addr: address }).then((r) => r.result).catch(() => false),
              programme.get_phase().then((r) => r.result.unwrap().tag).catch(() => null),
            ]);
            return { id: p.id, name: p.name, isVerifier: ver, isReviewer: rev, phase: phase != null ? String(phase) : null };
          } catch {
            return { id: p.id, name: p.name, isVerifier: false, isReviewer: false, phase: null };
          }
        }),
      );
      if (!cancelled) setLoaded({ address, all: checked });
    })();
    return () => {
      cancelled = true;
    };
  }, [address, programmeAt]);

  // The address is stored beside the list, so a new account never sees the
  // previous one's roles.
  const all = loaded && loaded.address === address ? loaded.all : null;
  const mine = all ? all.filter((p) => p.isVerifier || p.isReviewer) : null;
  return {
    all,
    mine,
    verifierOf: mine?.filter((p) => p.isVerifier) ?? [],
    // Review-phase programmes first: those are the ones with votes to cast.
    reviewerOf: (mine ?? [])
      .filter((p) => p.isReviewer)
      .sort((a, b) => (a.phase === 'Review' ? -1 : b.phase === 'Review' ? 1 : 0)),
  };
}

/** The index's name for a programme, or its shortened id. */
export function programmeLabel(all: RoleProgramme[] | null, id: string): string | null {
  return all?.find((p) => p.id === id)?.name ?? null;
}
