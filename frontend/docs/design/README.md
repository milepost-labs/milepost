# Design reference

The look and behaviour the app is built to. Read `BRAND.md` first: the idea
behind the look, the voice, and the claims the app must never make.

| File | What it is |
| --- | --- |
| `BRAND.md` | Voice, the money-square colours, the never-claim rules, visual foundations. |
| `CLAUDE_CODE_HANDOFF.md` | The designer's handoff note: ground rules and a suggested build order. |
| `prototypes/landing.html` | The landing page. Open it in a browser. |
| `prototypes/app.html` | A clickable prototype of the app shell and every screen. The "Design review: states" button (bottom left) switches loading, empty, error, stale, signed-out and offline states. |
| `prototypes/app-styles.css` | The app prototype's stylesheet, on its own for reading. |
| `tokens/` | The design's tokens as CSS and as JSON, with a usage note on each. |

The prototypes are references, not code to copy. They use example data and
hash links (`#directory`); the app uses real reads and router paths.

## Tokens

`src/styles/tokens.css` carries the design's colours, fonts, radii and shadows
under the design's own names (`--bg-raised`, `--ink`, `--line`, `--money-*`,
`--signal`). Two things differ from `tokens/tokens.css`:

- **Spacing keeps the app's scale and names.** The design's `space-6`, `8`,
  `12`, `16` and `24` (24, 32, 48, 64 and 96px) are `--space-5`, `--space-6`,
  `--space-7`, `--space-8` and `--space-12` in the app.
- **The design's `radius-lg` (28px) is `--radius-band`.** `--radius-lg` was
  already in use for panels and stays at the panel radius.

Two text colours are darker than the design's fills, because the fills fall
under 4.5:1 as small text on paper: `--refund-strong` for refund wording and
`--warning-strong` for warning wording.

## Where the app departs from the prototypes

The prototypes were drawn from a written brief, so a few screens show things
the contracts and the index do not provide. The app follows the contracts.

- **Attestations** store a hash of their data, not readable fields; their ids
  are 32-byte hex; they can expire. "Used" is recorded per programme.
- **A schema** is one definition string with `revocable`, `restricted` and an
  optional predecessor.
- **A spend policy** is set by a steward with the wallet's consent, and only
  the steward changes it afterwards. Its cap is per period. Asset, payees and
  cap are always enforced, not optional checks. Its payee list is the
  steward's.
- **Standing** holds programmes, total received, tranches and first and last
  seen. There is no count of revoked proofs and no "of N" total.
- **The registry** keeps no list of programmes; the indexer builds it.
- **The verifier's claims queue** has no source: the contracts and the index
  keep no list of claims. Claims reach `/verifiers` two ways instead, both
  built so they can be compared: a recipient's *request link* (copied from
  their award, it opens the verifier's review panel and is remembered in
  that browser), and the verifier's own *lookup* (programme + recipient).
  Either way the panel reads the award, the schema definition (the
  condition), the verifier role and the registry on the chain before
  signing. After signing, a *reply link* fills in the recipient's release.
  "Signed this month" and "votes to cast" are not shown; nothing counts them.
- **The deploy wizard** has no payment-mode choice: `registry.create` takes
  no mode, and each award gets its mode at finalize, so a "planned mode"
  would be thrown away. The step shows the four modes ranked instead.
  Reviewers and verifiers are addresses without names until the metadata
  store exists. The asset and schema offered first are the testnet pilot's,
  read from the chain, and any other asset contract is checked by reading
  its `name()`. A restricted schema needs its authority among the
  verifiers, which the People step asks for.
- **Finalize** lists the programme's indexed awards plus applicants added on
  the page, each read on the chain: there is no list of applications to
  show. Phases Review and Settled both allow finalizing. The payee follows
  the contract per mode: Direct a verified payee (checked live), Allocated
  none yet, Restricted the recipient's smart wallet (its spend policy is
  checked and warned about, enforced at release), Open the recipient. The
  oversubscription warning has figures only when the rows are known.
- **Names** (sector, verifier, payee and reviewer labels) are not on the
  chain. Where a name appears it is the creator's label for an address, shown
  beside the address.
- **Counts and histories** that need events the indexer does not handle yet
  (funders, applicants, a programme's timeline, attestation search by
  recipient or verifier, schema use counts, index run history) carry the
  Sample data tag until it does.
- **Network fee figures** in the prototypes are illustrative. The app shows
  the fee a transaction simulates to, or none.
- Developer copy uses the real package names (`@milepost/registry` and so on)
  and contract names (`registry`, `program`, `attest`, `record`,
  `policy_spend`).

On the landing page: the live section shows the figures the index publishes
(programmes listed, freshness, last ledger, unhandled event types) and has no
sample-data preview; the install command is the five `@milepost/*` packages;
the registry is described without "the list of known programmes"; standing is
not called permanent, because ledger entries expire unless extended; the fee is
described as capped at 10%, with 2.5% only in the worked example; the footer
lists every route the app serves and leaves out "Propose a programme" until
that page exists; and the "play the steps" control for tall preview frames is
not built.

One fix was made to `prototypes/app.html` as delivered: the script's closing
`})();` sat above the event handlers for the later screens, which left their
buttons dead. It now closes after them.
