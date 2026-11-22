import { useOptionalSoroban } from '../context/useSoroban';
import { NETWORK } from '../config/network';
import { FIXTURE_ASSET_CODE } from '../fixtures/programmes';
import { isSampleProgrammeId } from '../lib/programmeView';
import { fetchTokenName, parseTokenName } from '../lib/token';
import { useKeyedRead } from './useKeyedRead';

/**
 * The asset a programme actually distributes, read from the chain.
 *
 * A programme's `token` is fixed at deploy and a token's `name()` never
 * changes, so each is read once per session and the answer kept, including for
 * every other screen that asks about the same programme or token. A failed
 * read is not kept: the next ask tries again.
 */

type ProgrammeAt = (contractId: string) => {
  get_config: () => Promise<{ result: { unwrap: () => { token: string } } }>;
};

/** programme id -> its token contract address. */
const tokenOfProgramme = new Map<string, Promise<string>>();
/** token contract address -> its asset code. */
const codeOfToken = new Map<string, Promise<string>>();

/** Forget everything read so far. For tests. */
export function resetProgrammeAssetCache(): void {
  tokenOfProgramme.clear();
  codeOfToken.clear();
}

function remember<T>(cache: Map<string, Promise<T>>, key: string, start: () => Promise<T>): Promise<T> {
  const known = cache.get(key);
  if (known) return known;
  // Through an async wrapper so a reader that throws synchronously is a rejection too.
  const pending = (async () => start())();
  cache.set(key, pending);
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}

/** The asset code for a real programme, from its token's name. Rejects when it cannot be read. */
export function readProgrammeAsset(
  programmeId: string,
  programmeAt: ProgrammeAt,
  rpcUrl: string,
): Promise<string> {
  return remember(tokenOfProgramme, programmeId, async () => {
    const config = (await programmeAt(programmeId).get_config()).result.unwrap();
    return config.token;
  }).then((token) =>
    remember(codeOfToken, token, async () => {
      const { result } = await fetchTokenName(token, rpcUrl, NETWORK.passphrase);
      const code = parseTokenName(result).code;
      if (!code) throw new Error('The asset contract returned no name.');
      return code;
    }),
  );
}

/**
 * The asset code of one programme's money, or null while it is being read, when
 * the read failed, or when there is no programme. Callers show a figure
 * without a unit for null: never a guess.
 *
 * A sample programme has no contract; it keeps the stand-in asset its sample
 * figures are written in.
 */
export function useProgrammeAsset(programmeId: string | null | undefined): string | null {
  const soroban = useOptionalSoroban();
  const sample = Boolean(programmeId) && isSampleProgrammeId(programmeId as string);
  const key = programmeId && !sample && soroban ? programmeId : null;

  const read = useKeyedRead<string>(key, (id) => readProgrammeAsset(id, soroban!.programmeAt, soroban!.rpcUrl));

  if (sample) return FIXTURE_ASSET_CODE;
  return read.status === 'ok' ? read.data : null;
}
