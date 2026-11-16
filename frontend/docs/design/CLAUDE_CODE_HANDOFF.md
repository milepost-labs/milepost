# Milepost redesign — handoff for Claude Code

This folder is a design handoff. It holds working HTML prototypes plus design tokens. Your job is to rebuild the Milepost React app so it matches these designs, using the app's real data and contract calls instead of the example data.

## What's in this folder

| File | What it is |
|---|---|
| `prototypes/landing.html` | The full landing page. Open it in a browser. |
| `prototypes/app.html` | A clickable prototype of the app shell and **every screen** (all 17 routes). Use the bottom-left "Design review: states" button to see loading, empty, error, stale, signed-out, offline and not-found states. |
| `prototypes/app-styles.css` | The prototype's stylesheet, a reference for layout and component styles. |
| `tokens/tokens.css` | Design tokens as CSS custom properties, light and dark. Drop this straight into `src/styles/tokens.css`. |
| `tokens/tokens.json` | The same tokens as data, with a usage note on every token. |
| `BRAND.md` | Voice, the money-square colours, the never-claim rules and visual foundations. **Read it first.** |

## Ground rules (from the product brief)

- **Stack stays the same:** React 19, TypeScript, Vite, react-router, lucide-react icons, plain CSS with the tokens. No UI framework, no chart or animation libraries (there's a JS size budget).
- **Don't change contract logic** or the indexer. This is a visual and UX rebuild.
- **Never claim** passkey or Face ID sign-in (Freighter only), covered network fees, cash-out to local money, or invented live figures. Keep "testnet · pre-audit" visible.
- Shared components use neutral words: programme, recipient, verifier, condition, payee.
- Every disabled action shows **why** ("Available only while the programme is Open. This programme is in Review.").
- Errors: a human sentence, then `Nothing was transferred · program error N`, then a retry.
- Numbers, amounts, addresses and ids use `--font-mono` with tabular numerals. Addresses are shortened (`GA7Q…VSGZ`) with a copy button.
- 360px wide with no horizontal scroll, 44px tap targets, visible focus rings, labels on every control, `prefers-reduced-motion` respected.
- Anything still using stand-in data gets the yellow **Sample data** tag (`.tag-sample` in the prototype CSS).

## Suggested order

1. **Tokens and fonts.** Add `tokens.css`, import it first in the global CSS, and add the Google Fonts link (it's in the comment at the top of `tokens.css`). Add a theme toggle that sets `data-theme` on `<html>` and defaults to the system setting.
2. **Shared components** (`src/components/`), matching the prototype:
   - Button (primary, secondary, ghost, danger, small; disabled-with-reason)
   - PhaseBadge, ModePill (shows the strength meter; Allocated is strongest), SampleTag, TestnetTag
   - MoneySquares (unawarded, locked, released and refundable, sized from real amounts)
   - StatTile, AmountInput (presets, balance, fee breakdown), CopyAddress
   - TxSheet (idle → pending → confirmed with receipt, or failed with retry)
   - ErrorPanel, EmptyState, Skeleton, Notice (info, warn, risk, ok)
3. **App shell:** header with the 5 sections and sub-navigation, the Freighter sign-in sheet, the account menu, a phone bottom tab bar, the offline banner, and one screen-reader live region that announces every async result.
4. **Screens**, one per pull request, wired to real data:
   - `/directory`
   - `/programme/:id`
   - `/funders` plus the contribute flow
   - recipient awards
   - `/verifiers`
   - `/admin` (deploy)
   - `/finalize`
5. **Landing page `/`** from `prototypes/landing.html`. The hero road demo, the how-it-works board and the modes switcher are plain JS in the prototype. Port them to small React components with no animation library. The "Live on testnet" section must read the real index and show nothing if it fails.
6. **Remaining screens.** These are all designed in `prototypes/app.html` too, built from the same components:
   - `/status` (index health and recent rebuilds, warning past 12 h)
   - `/about` (contract ids, network and build)
   - `/funders/receipt` (rebuild a receipt from a transaction hash; found and not-found states)
   - `/funders/propose` (form, then a summary to copy, email or open as a GitHub issue; nothing goes on chain)
   - `/policy` (no-policy setup, and active policy with checks, cap meter and allowed payees)
   - `/attestations` (search by id, recipient or verifier; valid, used and revoked results)
   - `/schemas/register` (name, meaning, fields builder, revocable, live preview, existing schemas)
   - `/admin/payees` (creator-only list, add and remove; read-only with a reason for non-creators)
   - `/admin/standing` (look up totals, who can write, record life)
   - `/keepalive` (days left per programme, warning under 30 days, extend one or all)

## Notes

- The prototypes use hash links like `#directory`. The real app uses react-router paths (`/directory`, `/programme/:id`, and so on).
- `npm install @milepost/sdk` on the landing page is a **placeholder**. Use the real package name.
- The five contract names on the landing page (Registry, Programme, Attestations, Standing, Spend policy) are descriptive. Rename them to match the repo.
- Check accessibility with the existing CI check after each screen.
