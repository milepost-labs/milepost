import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// The app names its network in one place, src/config/network.ts. A testnet
// contract id or URL anywhere else is read on mainnet too and quietly points
// a mainnet build at testnet, so outside src/config/ and tests these fail
// lint. Read NETWORK (passphrase, rpcUrl, contracts, explorer) instead.
const TESTNET_URL = /testnet\.stellar\.org|stellar\.expert\/explorer\/testnet/
const NETWORK_SETTING_HINT =
  'Read the network from NETWORK in src/config/network.ts; only src/config/ may name testnet.'
const noTestnetLiterals = [
  {
    // networks.testnet, registryNetworks.testnet, and networks['testnet'].
    selector:
      "MemberExpression[object.name=/[Nn]etworks$/][property.name='testnet'], MemberExpression[object.name=/[Nn]etworks$/][property.value='testnet']",
    message: `networks.testnet outside the network setting. ${NETWORK_SETTING_HINT}`,
  },
  {
    selector: `Literal[value=${TESTNET_URL}]`,
    message: `A testnet URL outside the network setting. ${NETWORK_SETTING_HINT}`,
  },
  {
    selector: `TemplateElement[value.raw=${TESTNET_URL}]`,
    message: `A testnet URL outside the network setting. ${NETWORK_SETTING_HINT}`,
  },
]

export default defineConfig([
  globalIgnores(['dist', 'dist-mainnet']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/config/**', 'src/test/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...noTestnetLiterals],
    },
  },
])
