#!/usr/bin/env bash
#
# Fail if a binding package cannot be installed and used the way an integrator
# would use it.
#
# check-bindings-publishable.sh inspects the tarball's file list, which cannot
# catch a broken `exports` map, a `typings` path that resolves to nothing, or a
# module that only loads under one module system. This packs every package for
# real, installs all five tarballs into an empty project, and then:
#
#   - imports each package under Node ESM and checks it exports a `Client`
#   - typechecks a file that constructs each `Client` and references one of its
#     generated methods, with `tsc --noEmit` under `module: nodenext`, so the
#     declarations are resolved through `exports` exactly as a consumer's are
#
# Requires every package to be built first (`npm run build`). Needs network
# access to the npm registry for the packages' own dependencies.
#
# Usage: ./scripts/check-bindings-consumable.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(attest policy-spend program record registry)

TMP="$(mktemp -d "${TMPDIR:-/tmp}/milepost-consumer.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "==> Packing binding packages"
for pkg in "${PACKAGES[@]}"; do
  echo "    $pkg"
  (cd "$ROOT/packages/$pkg" && npm pack --pack-destination "$TMP" --ignore-scripts --loglevel=error >/dev/null)
done

# The same TypeScript the packages build with, so a new compiler release
# cannot fail this check on its own.
TS_VERSION="$(node -p "require('$ROOT/packages/registry/node_modules/typescript/package.json').version")"

PROJECT="$TMP/consumer"
mkdir "$PROJECT"
cat >"$PROJECT/package.json" <<'EOF'
{ "name": "milepost-consumer-check", "private": true, "type": "module" }
EOF
cat >"$PROJECT/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "files": ["consumer.ts"]
}
EOF

echo "==> Installing all five tarballs into an empty project"
(cd "$PROJECT" && npm install --no-audit --no-fund --loglevel=error "$TMP"/*.tgz "typescript@$TS_VERSION")

cat >"$PROJECT/import.mjs" <<'EOF'
const packages = process.argv.slice(2);
let failed = false;
for (const name of packages) {
  try {
    const mod = await import(name);
    if (typeof mod.Client !== 'function') {
      throw new Error('it has no Client export');
    }
    console.log(`    ${name}`);
  } catch (error) {
    console.error(`    ${name} does not import under Node ESM: ${error.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
EOF

cat >"$PROJECT/consumer.ts" <<'EOF'
import { Client as AttestClient } from "@milepost/attest";
import { Client as PolicySpendClient } from "@milepost/policy-spend";
import { Client as ProgramClient } from "@milepost/program";
import { Client as RecordClient } from "@milepost/record";
import { Client as RegistryClient } from "@milepost/registry";

const options = {
  contractId: "never-contacted-the-file-is-only-typechecked",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
};

// One generated method per client, so the method declarations resolve too and
// not just the class.
export const methods = [
  new AttestClient(options).get_schema,
  new PolicySpendClient(options).is_payee,
  new ProgramClient(options).get_config,
  new RecordClient(options).get_admin,
  new RegistryClient(options).get_config,
];
EOF

failed=0

echo "==> Importing each package under Node ESM"
(cd "$PROJECT" && node import.mjs "${PACKAGES[@]/#/@milepost/}") || failed=1

echo "==> Typechecking a consumer of each Client"
if (cd "$PROJECT" && npx --no-install tsc -p tsconfig.json); then
  echo "    consumer.ts"
else
  failed=1
fi

if [[ "$failed" -ne 0 ]]; then
  cat >&2 <<'EOF'

error: a binding package installs but cannot be used by a consumer.

Check `exports`, `typings` and `type` in its package.json against what
dist/ actually contains, then rebuild (`npm run build` in packages/<name>).

EOF
  exit 1
fi

echo "==> Binding packages install, import and typecheck in a clean project"
