import type { NetworkConfig } from '../config/network';
import { NETWORK } from '../config/network';

/**
 * Whether the sample programmes may render. They help someone judge the app
 * on testnet; on a network that moves real money a made-up programme beside
 * real ones can mislead, so no sample may appear anywhere on mainnet.
 *
 * One check every place that merges or shows fixture data asks, rather than a
 * network condition repeated in each screen.
 */
export function samplesEnabled(network: Pick<NetworkConfig, 'name'> = NETWORK): boolean {
  return network.name === 'testnet';
}
