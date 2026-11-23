/**
 * Whether this build carries sample data at all. Replaced at build time (see
 * `__MILEPOST_NETWORK__` in vite.config.ts), so on a mainnet build every
 * fixture export that names a sample programme or address is the empty value
 * and its data is dropped from the bundle. CI's mainnet build fails if a sample
 * id reaches dist/ (scripts/check-mainnet-build.sh).
 *
 * This is not the switch for showing samples; that is `samplesEnabled()` in
 * src/lib/samples.ts, which every screen asks. Samples never show on mainnet
 * either way; this keeps them out of the files served there too.
 */
export const SAMPLES_IN_BUILD = __MILEPOST_NETWORK__ === 'testnet';
