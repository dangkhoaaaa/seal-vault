/**
 * Seal encryption/decryption utilities.
 *
 * Uses @mysten/seal SDK with a pool of 11 testnet key servers (threshold = 2).
 * Any 2 servers responding is enough to decrypt, providing strong liveness
 * guarantees even if individual servers are unavailable.
 *
 * Key server registry: https://seal-docs.wal.app/Pricing
 */
import { SealClient, SessionKey, EncryptedObject, type SealCompatibleClient } from '@mysten/seal';
export { EncryptedObject };
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { PACKAGE_ID, SUI_RPC_URL, APP_NETWORK } from '@/lib/config';

const VAULT_POLICY_MODULE = 'vault_policy';
const SESSION_TTL_MIN = 10;

/**
 * Verified testnet key servers: 1 committee (3-of-5) + 10 independent Open-mode.
 * Committee servers require `aggregatorUrl`; independent servers must not have it.
 */
const KEY_SERVERS = [
  // Decentralized committee — 3-of-5, aggregated by Mysten Labs
  { objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98', aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com', weight: 1 },
  // Mysten Labs #1
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  // Mysten Labs #2
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
  // Ruby Nodes
  { objectId: '0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2', weight: 1 },
  // NodeInfra
  { objectId: '0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007', weight: 1 },
  // Studio Mirai
  { objectId: '0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2', weight: 1 },
  // Overclock
  { objectId: '0x9c949e53c36ab7a9c484ed9e8b43267a77d4b8d70e79aa6b39042e3d4c434105', weight: 1 },
  // H2O Nodes
  { objectId: '0x39cef09b24b667bc6ed54f7159d82352fe2d5dd97ca9a5beaa1d21aa774f25a2', weight: 1 },
  // Triton One
  { objectId: '0x4cded1abeb52a22b6becb42a91d3686a4c901cf52eee16234214d0b5b2da4c46', weight: 1 },
  // Natsai
  { objectId: '0x3c93ec1474454e1b47cf485a4e5361a5878d722b9492daf10ef626a76adc3dad', weight: 1 },
  // Mhax.io
  { objectId: '0x6a0726a1ea3d62ba2f2ae51104f2c3633c003fb75621d06fde47f04dc930ba06', weight: 1 },
];

/** Minimum key server responses required to reconstruct the decryption key. */
const THRESHOLD = 2;

/**
 * Creates a `SealCompatibleClient` using a direct JSON-RPC connection.
 *
 * The Seal SDK v1.1.1 requires `ClientWithExtensions<{ core: CoreClient }>`.
 * `SuiJsonRpcClient` satisfies this interface; the dapp-kit `useSuiClient()`
 * hook does not reliably expose `.core` at runtime.
 */
function makeSuiClient(): SealCompatibleClient {
  return new SuiJsonRpcClient({
    url: SUI_RPC_URL,
    network: APP_NETWORK,
  }) as unknown as SealCompatibleClient;
}

/**
 * Encrypts `data` under the vault's Seal identity (threshold = 2).
 * The resulting ciphertext can only be decrypted by the vault owner's wallet.
 */
export async function sealEncrypt(vaultId: string, data: Uint8Array): Promise<Uint8Array> {
  const id = `${PACKAGE_ID.replace(/^0x/, '')}${vaultId.replace(/^0x/, '')}`;

  const { encryptedObject } = await new SealClient({
    suiClient: makeSuiClient(),
    serverConfigs: KEY_SERVERS,
    verifyKeyServers: false,
  }).encrypt({ threshold: THRESHOLD, packageId: PACKAGE_ID, id, data });

  return encryptedObject;
}

/**
 * Decrypts a Seal-encrypted blob.
 *
 * Flow:
 *  1. A short-lived session key is created and signed by the wallet.
 *  2. A `seal_approve` PTB is built (simulated by key servers, never broadcast).
 *  3. Key servers verify vault ownership on-chain and release their key shares.
 *  4. Shares are combined locally to decrypt the ciphertext.
 */
export async function sealDecrypt(
  /** dapp-kit client — used only to build the approval transaction. */
  suiClient: SealCompatibleClient,
  /** Full on-chain reference (objectId, version, digest) of the vault object. */
  vaultRef: { objectId: string; version: string; digest: string },
  encryptedData: Uint8Array,
  walletAddress: string,
  signPersonalMessage: (bytes: Uint8Array) => Promise<string>,
): Promise<Uint8Array> {
  const internalClient = makeSuiClient();

  const sealClient = new SealClient({
    suiClient: internalClient,
    serverConfigs: KEY_SERVERS,
    verifyKeyServers: false,
  });

  const sessionKey = await SessionKey.create({
    address: walletAddress,
    packageId: PACKAGE_ID,
    ttlMin: SESSION_TTL_MIN,
    suiClient: internalClient,
  });

  const signature = await signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);

  const tx = new Transaction();
  const id = EncryptedObject.parse(encryptedData).id;
  tx.moveCall({
    target: `${PACKAGE_ID}::${VAULT_POLICY_MODULE}::seal_approve`,
    arguments: [
      tx.pure.vector('u8', Array.from(Buffer.from(id, 'hex'))),
      tx.objectRef(vaultRef),
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  // checkLEEncoding handles blobs encrypted with an older nonce encoding variant
  return sealClient.decrypt({ data: encryptedData, sessionKey, txBytes, checkLEEncoding: true });
}
