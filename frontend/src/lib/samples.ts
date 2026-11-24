import type { NetworkConfig } from '../config/network';

/**
 * Whether the sample programmes may render. They help someone judge the app
 * on testnet; on a network that moves real money a made-up programme beside
 * real ones can mislead, so no sample may appear anywhere on mainnet.
 *
 * One check every place that merges or shows fixture data asks, rather than a
 * network condition repeated in each screen.
 */
export function samplesEnabled(network?: Pick<NetworkConfig, 'name'>): boolean {
  // With no argument, answer from the build-time constant rather than from
  // NETWORK, so a mainnet build can drop every branch this guards, and the
  // fixture data in it, from the bundle. CI checks that it does.
  if (network === undefined) return __MILEPOST_NETWORK__ === 'testnet';
  return network.name === 'testnet';
}
