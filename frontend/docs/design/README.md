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

- **Finalize** takes a payee as well as a mode for each award.
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

One fix was made to `prototypes/app.html` as delivered: the script's closing
`})();` sat above the event handlers for the later screens, which left their
buttons dead. It now closes after them.
