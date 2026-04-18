/**
 * Centralised application configuration derived from environment variables.
 *
 * All runtime constants should be read from this module — never import
 * `process.env` directly from feature code.
 */

// ─── Network ──────────────────────────────────────────────────────────────────

export type SuiNetwork = 'testnet' | 'mainnet' | 'devnet' | 'localnet';

/** The Sui network this deployment targets. Controlled by NEXT_PUBLIC_NETWORK. */
export const APP_NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'testnet') as SuiNetwork;

/** Human-readable label for the target network. */
export const NETWORK_LABEL: Record<SuiNetwork, string> = {
  testnet:  'Sui Testnet',
  mainnet:  'Sui Mainnet',
  devnet:   'Sui Devnet',
  localnet: 'Sui Localnet',
};

// ─── Sui RPC ──────────────────────────────────────────────────────────────────

const DEFAULT_RPC: Record<SuiNetwork, string> = {
  testnet:  'https://fullnode.testnet.sui.io:443',
  mainnet:  'https://fullnode.mainnet.sui.io:443',
  devnet:   'https://fullnode.devnet.sui.io:443',
  localnet: 'http://127.0.0.1:9000',
};

/** JSON-RPC endpoint for the target network. */
export const SUI_RPC_URL =
  process.env.NEXT_PUBLIC_SUI_RPC_URL ?? DEFAULT_RPC[APP_NETWORK];

// ─── Move Package ─────────────────────────────────────────────────────────────

/** On-chain object ID of the deployed SealVault Move package. */
export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;

if (!PACKAGE_ID) {
  throw new Error('[SealVault] NEXT_PUBLIC_PACKAGE_ID is not set. Check your .env.local file.');
}

// ─── Walrus Storage ───────────────────────────────────────────────────────────

const DEFAULT_WALRUS_PUBLISHER: Record<SuiNetwork, string> = {
  testnet:  'https://publisher.walrus-testnet.walrus.space/v1',
  mainnet:  'https://publisher.walrus-mainnet.walrus.space/v1',
  devnet:   'https://publisher.walrus-testnet.walrus.space/v1',
  localnet: 'http://127.0.0.1:31415/v1',
};

const DEFAULT_WALRUS_AGGREGATOR: Record<SuiNetwork, string> = {
  testnet:  'https://aggregator.walrus-testnet.walrus.space/v1',
  mainnet:  'https://aggregator.walrus-mainnet.walrus.space/v1',
  devnet:   'https://aggregator.walrus-testnet.walrus.space/v1',
  localnet: 'http://127.0.0.1:31415/v1',
};

/** Walrus publisher endpoint (proxied via Next.js API routes to avoid CORS). */
export const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ?? DEFAULT_WALRUS_PUBLISHER[APP_NETWORK];

/** Walrus aggregator endpoint (proxied via Next.js API routes to avoid CORS). */
export const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ?? DEFAULT_WALRUS_AGGREGATOR[APP_NETWORK];

// ─── App meta ─────────────────────────────────────────────────────────────────

export const APP_NAME = 'SealVault';
export const APP_DESCRIPTION =
  'On-chain password manager · Encrypted with Seal Protocol · Stored on Walrus';
