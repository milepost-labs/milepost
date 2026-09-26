/**
 * Stand-in addresses for exercising `AddressChip`'s verified indicator
 * without a live `registry.is_programme` read. Real, well-formed Stellar
 * strkey shapes (a `C...` contract address, a `G...` account), not
 * arbitrary strings, so truncation and the monospace layout look right.
 */

/** A programme address the registry deployed. */
export const FIXTURE_VERIFIED_PROGRAMME = 'CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL';

/** A programme-shaped address the registry did not deploy. */
export const FIXTURE_UNVERIFIED_PROGRAMME = 'CAUYHVYA5EE7DKPBHZ2SLGPP2S26F3AJH5G6XKCV2MYUKDXCKZ4KVQ7Q';

/** An address that is not a programme at all — no verified indicator applies. */
export const FIXTURE_ACCOUNT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
