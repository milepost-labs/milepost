#!/usr/bin/env bash
# Builds the app for mainnet and fails if any sample fixture id reached it.
#
# The network is fixed per build by VITE_NETWORK (src/config/network.ts), so a
# change can break the mainnet build, or ship a sample programme to it, without
# any testnet check noticing. This builds with VITE_NETWORK=mainnet and
# placeholder, valid-format values for every mainnet variable, then looks for
# every Stellar address and contract id written in src/fixtures/ in the output.
#
# Samples never render on mainnet (src/lib/samples.ts), and fixture exports are
# empty in a mainnet build (src/fixtures/inBuild.ts), so none should be there.
#
#   cd frontend && npm run check:mainnet-build
#
# The output goes to dist-mainnet/, so it does not replace a testnet dist/.
# Pass --no-build to check an existing dist-mainnet/ without rebuilding.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dist-mainnet"
cd "$root"

if [ "${1:-}" != "--no-build" ]; then
  # Placeholders, not real deployments: each id is a well-formed contract
  # strkey (32 bytes of 0x01..0x04), and the URLs use the reserved .invalid TLD.
  export VITE_NETWORK=mainnet
  export VITE_MAINNET_RPC_URL=https://rpc.mainnet.invalid
  export VITE_MAINNET_INDEXER_URL=https://indexer.mainnet.invalid/v1
  export VITE_MAINNET_REGISTRY_ID=CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526
  export VITE_MAINNET_ATTEST_ID=CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ
  export VITE_MAINNET_RECORD_ID=CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3
  export VITE_MAINNET_POLICY_ID=CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW
  # Overrides that only apply on testnet must not leak in from the shell.
  unset VITE_PROGRAMME_ID VITE_SOROBAN_RPC_URL VITE_INDEXER_URL
  npx tsc -b
  npx vite build --outDir "$out" --emptyOutDir
fi

if [ ! -d "$out/assets" ]; then
  echo "::error::No mainnet build found in $out"
  exit 1
fi

# Every G… account and C… contract id written in a fixture module.
mapfile -t ids < <(
  find src/fixtures -name '*.ts' ! -name '*.test.ts' -print0 \
    | xargs -0 grep -hoE '\b[GC][A-Z2-7]{55}\b' \
    | sort -u
)
if [ "${#ids[@]}" -eq 0 ]; then
  echo "::error::Found no sample ids in src/fixtures/; the check would pass vacuously"
  exit 1
fi

leaked=0
for id in "${ids[@]}"; do
  files="$(grep -rlF "$id" "$out" || true)"
  if [ -n "$files" ]; then
    leaked=1
    echo "::error::Sample id $id is in the mainnet build:"
    sed "s|^$root/|  |" <<<"$files"
  fi
done

if [ "$leaked" -ne 0 ]; then
  echo "Gate the export that holds it with SAMPLES_IN_BUILD (src/fixtures/inBuild.ts)."
  exit 1
fi

echo "Mainnet build passed: none of the ${#ids[@]} sample ids in src/fixtures/ reached it."
