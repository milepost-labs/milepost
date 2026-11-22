import type { Sendable } from '../hooks/useTransaction';
import { restoreFromAssembled } from './restore';

type SendOptions = Parameters<Sendable<true>['signAndSend']>[0];

/**
 * An assembled creator write, ready for `useTransaction`.
 *
 * The creator calls return a contract `Result`; unwrapping it after sending
 * means a refusal surfaces as a thrown error that `explain()` can translate,
 * instead of being read as a success. Archived entries are restored first.
 */
export function creatorSendable<
  A extends { signAndSend: (options: SendOptions) => Promise<{ result: { unwrap: () => unknown } }> },
>(assembled: A): Sendable<true> {
  return {
    restore: restoreFromAssembled(assembled),
    signAndSend: async (options) => {
      const sent = await assembled.signAndSend(options);
      sent.result.unwrap();
      return { result: true };
    },
  };
}
