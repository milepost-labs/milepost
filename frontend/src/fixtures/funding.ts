/**
 * Stand-in data for the funding screens (`/funders`).
 *
 * Each export is named `FIXTURE_*` and shaped like the read it stands in for,
 * so wiring the real call is a change of source:
 *
 * - `FIXTURE_BALANCE` stands in for the signed-in wallet's token balance.
 * - `FIXTURE_CONTRIBUTIONS` stands in for a per-address
 *   `program.contributed_by({ donor })` read, joined with the programme id.
 * - `FIXTURE_TX` stands in for the hash and ledger of a submitted transaction,
 *   which the real path reads from the sent transaction's responses.
 *
 * Programme names, phases and amounts come from `fixtures/programmes.ts`.
 */

/** Wallet balance in stroops, as the token contract's `balance` returns it. */
export const FIXTURE_BALANCE = '52500000000';

export interface FixtureContribution {
  programmeId: string;
  /** Stroops, as `contributed_by` returns it. */
  amount: string;
  ledger: number;
  /** Whether this donor has already claimed their refund. */
  refunded: boolean;
}

export const FIXTURE_CONTRIBUTIONS: FixtureContribution[] = [
  {
    programmeId: 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7',
    amount: '10000000000',
    ledger: 4815532,
    refunded: false,
  },
  {
    programmeId: 'CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM',
    amount: '20000000000',
    ledger: 4613904,
    refunded: false,
  },
  {
    programmeId: 'CBUESJW3MUDDN2NVG7RPQK7N2JSJMSKHDQMIQZMDXZMR6GNNZWX46LNU',
    amount: '5000000000',
    ledger: 4656011,
    refunded: false,
  },
];

/** Shaped like a sent transaction's hash and the ledger it landed in. */
export interface FixtureTx {
  hash: string;
  ledger: number;
}

export const FIXTURE_TX: FixtureTx = {
  hash: '7c1e9a4b0d3f52a8e61c9b7f04d2a5e8c3b1f6a9d0e4c7b2a5f8e1d4c7b0f04b2d',
  ledger: 4853391,
};

/**
 * Sample programmes whose contribution fails, keyed by programme id, with the
 * error the bindings would throw. Smallholder inputs moves out of Open while
 * the transaction is in flight, so the contract refuses it with `WrongPhase`
 * (program error 2). Lets the failure state be seen without a real failure.
 */
export const FIXTURE_TX_FAILURES: Record<string, string> = {
  CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI: 'HostError: Error(Contract, #2)',
};
