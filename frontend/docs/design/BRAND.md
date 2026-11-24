# Milepost

Conditional grants on Stellar. **Money moves at each milepost, and only at each milepost.**

This system covers the Milepost landing page and web app. It starts with the landing page (see the *Landing page* card under Pages) and the tokens it uses. App screens and components come next and reuse the same tokens.

## The idea behind the look

A milepost is a roadside marker that tells you how far you've come. The design borrows from the road:

- **Milepost green** (`accent`) is the green of highway mile-marker signs. It means *released* and *go*.
- **Road-paint yellow** (`signal`) is used sparingly: the testnet dot and the Sample data tag.
- **Mileposts** are drawn as small rounded signs with a mono numeral (`01`, `02`, `03`). Each one stands for one tranche and one condition.
- **Money squares** are kept from the current app: money is drawn as rows of small rounded squares (`radius-sq`), in four states.

| State | Token | Meaning |
|---|---|---|
| Unawarded | `money-unawarded` | In the budget, not yet awarded |
| Awarded, locked | `money-locked` | Awarded, waiting for a verifier |
| Released | `money-released` | Paid after a valid proof |
| Refundable | `money-refundable` | Unpaid after the window, going back to funders in proportion |

Released and refundable differ in lightness as well as hue, so they stay distinguishable for colour-blind readers.

## Voice

Plain words for people who aren't crypto people: an NGO programme officer, a registrar, a clinic manager, a farmer.

- Say what happens to the money: "500 USDC released to the school", not "tx confirmed".
- Shared components use neutral words: **programme, recipient, verifier, condition, payee**. "School" and "tuition" appear only in example copy.
- State limits plainly. "Whoever finalizes first decides who gets funded" is said outright, never buried.
- Refunds are always "proportional", never a "full refund".
- An unavailable action always says why: "Available only while the programme is Open. This programme is in Review."
- Errors are a human sentence, then `Nothing was transferred · program error N`, then a retry.

### Never claim

Passkey or Face ID sign-in (sign-in is **Freighter only**), "no XLM needed" or covered fees, cash-out to local money (anchors are roadmap only), or invented live figures. The live section reads the real index and shows nothing when it can't. Every page says **testnet · pre-audit** somewhere visible.

## Visual foundations

- **Grounds, not boxes.** Separate regions with background steps (`bg-sunken`, `bg`, `bg-raised`) and generous space. Hairlines (`line`) appear only in tables and lists. Two full-bleed ink bands (the problem section and the developers section) give the landing page rhythm.
- **Type.** `display` (Bricolage Grotesque) for headlines, `sans` (Instrument Sans) for UI and reading, `mono` (IBM Plex Mono, tabular) for every number, amount, address and id. Addresses are shortened, like `GA7Q…VSGZ`, with a copy button.
- **Shape.** Buttons and badges are pills (`radius-pill`). Panels use `radius-md`, large bands use `radius-lg`, money squares use `radius-sq`.
- **Spacing.** A 4px base. Landing sections sit `space-24` apart (`space-16` on phone). The page gutter is `space-12` on desktop and `space-4` at 360px.
- **Motion.** Motion explains something about money. Squares change colour when a proof lands, the road fills to the next milepost, and words rise into the hero. Nothing loops without meaning, and everything respects `prefers-reduced-motion`.
- **Focus.** A 2px `focus` ring with a 2px offset on every control. Tap targets are at least 44px.

## Landing page

Sections, in order:

1. Hero with an interactive road: one award, three tranches. Press *Confirm term N* as the registrar and watch one tranche unlock.
2. "What brings you here?": four large typographic role lines, not cards.
3. The problem: "selection" gets struck through.
4. How it works: seven steps beside a 40-square budget board that changes state step by step.
5. Payment modes, ranked by guarantee (Allocated, Direct, Restricted, Open) with an animated money path.
6. Sectors: a sentence that rewrites itself per sector, plus the full table.
7. The people: reviewer and verifier as two separate jobs.
8. Why Stellar: *Today* and *Roadmap · not available* are tagged honestly.
9. Guarantees and limits.
10. Live on testnet, with loading, unreachable, and a sample-data preview.
11. For developers.
12. Final call to action and footer.

"Launch app" goes to `/directory`, which works without a wallet.
